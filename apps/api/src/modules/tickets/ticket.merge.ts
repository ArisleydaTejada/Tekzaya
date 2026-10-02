import {
  ACTIVE_TICKET_STATUSES,
  canMerge,
  canUnmerge,
  shiftTargets,
  type Actor,
  type DuplicateCandidate,
  type TicketStatus,
} from "@tekzaya/shared";
import { Types } from "mongoose";
import { AppError } from "../../middleware/errors";
import { Ticket } from "../../models/ticket.model";
import { User } from "../../models/user.model";
import { notify } from "../notifications/notifications.service";
import { getCalendar, getSettings } from "../settings/settings.service";
import { applyStatusChange, recordSystemEvent } from "./ticket.lifecycle";
import { idOf, refOf, type LeanTicket, type TicketDoc } from "./ticket.access";

const ACTIVE: readonly TicketStatus[] = ACTIVE_TICKET_STATUSES;

/**
 * Posibles duplicados por búsqueda de texto, **sin IA**: mismo área, todavía
 * vivos, creados dentro de la ventana del incidente y con palabras parecidas en
 * el título. El índice de texto ya existe desde F1, así que esto no gasta cuota
 * de Gemini ni tarda (spec §7.5.1).
 */
export async function findDuplicateCandidates(
  principal: TicketDoc,
  limit = 10,
): Promise<DuplicateCandidate[]> {
  const settings = await getSettings();
  const since = new Date(Date.now() - settings.incidentDetection.windowHours * 3_600_000);

  const base = {
    _id: { $ne: idOf(principal) },
    areaId: principal.get("areaId"),
    status: { $in: [...ACTIVE] },
    createdAt: { $gte: since },
  };

  // Las palabras cortas ("de", "el", "no") no distinguen nada y ensucian el
  // resultado; con menos de cuatro letras no entran en la búsqueda.
  const words = String(principal.get("title"))
    .split(/\s+/)
    .filter((word) => word.length > 3);

  let found: LeanTicket[] = [];
  if (words.length) {
    found = (await Ticket.find(
      { ...base, $text: { $search: words.join(" ") } },
      { score: { $meta: "textScore" } },
    )
      .sort({ score: { $meta: "textScore" } })
      .limit(limit)
      .lean()) as LeanTicket[];
  }

  // Sin coincidencias de texto, al menos se ofrecen los recientes de la misma
  // categoría: es donde más suelen caer los duplicados reales.
  if (!found.length && principal.get("categoryId")) {
    found = (await Ticket.find({ ...base, categoryId: principal.get("categoryId") })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean()) as LeanTicket[];
  }

  const requesters = await User.find({
    _id: { $in: found.map((ticket) => ticket["requesterId"]) },
  })
    .select("name")
    .lean();
  const nameById = new Map(requesters.map((user) => [String(user._id), user.name ?? ""]));

  const incidentGroup = principal.get("ai")?.incident?.groupId;

  return found.map((ticket) => ({
    id: String(ticket["_id"]),
    number: ticket["number"] as number,
    title: ticket["title"] as string,
    status: ticket["status"] as TicketStatus,
    requesterName: nameById.get(String(ticket["requesterId"])) ?? "Desconocido",
    createdAt: (ticket["createdAt"] as Date).toISOString(),
    sameIncident: Boolean(
      incidentGroup && ticket["ai"]?.incident?.groupId === incidentGroup,
    ),
  }));
}

export interface MergeOptions {
  reason: string;
  addAssignees: boolean;
  notifyRequesters: boolean;
}

/**
 * Absorbe los duplicados dentro del principal. Los mensajes **no se copian**: se
 * quedan en su ticket y la conversación del principal los lee de allí (spec
 * §7.5.1). Lo que sí se mueve son los solicitantes, que pasan a serlo del
 * principal y por tanto dejan de ver las notas internas.
 */
export async function mergeTickets(
  principal: TicketDoc,
  duplicateIds: readonly string[],
  actor: Actor,
  options: MergeOptions,
): Promise<void> {
  const principalRef = refOf(principal.toObject() as LeanTicket);

  if (principal.get("mergedIntoId")) {
    throw new AppError(
      409,
      "already_merged",
      "Este ticket ya está fusionado dentro de otro; fusiona sobre el principal",
    );
  }
  if (!ACTIVE.includes(principalRef.status)) {
    throw new AppError(409, "ticket_closed", "Solo se fusiona sobre un ticket todavía abierto");
  }
  if (duplicateIds.includes(String(idOf(principal)))) {
    throw new AppError(422, "validation_error", "Un ticket no puede fusionarse consigo mismo");
  }

  const duplicates = (await Ticket.find({ _id: { $in: duplicateIds } })) as TicketDoc[];
  if (duplicates.length !== new Set(duplicateIds).size) {
    throw new AppError(404, "not_found", "Alguno de los duplicados no existe");
  }

  for (const duplicate of duplicates) {
    const ref = refOf(duplicate.toObject() as LeanTicket);
    if (ref.areaId !== principalRef.areaId) {
      throw new AppError(
        422,
        "different_area",
        "Solo se fusionan tickets de la misma área; transfiere primero el duplicado",
      );
    }
    if (!ACTIVE.includes(ref.status)) {
      throw new AppError(422, "ticket_closed", "Solo se fusionan tickets todavía abiertos");
    }
    if (!canMerge(actor, principalRef, ref)) {
      throw new AppError(403, "forbidden", "No puedes fusionar estos tickets");
    }
  }

  const at = new Date();
  const extraRequesters = new Set(
    (principal.get("additionalRequesterIds") as unknown[]).map(String),
  );
  const assignees = new Set((principal.get("assigneeIds") as unknown[]).map(String));
  const principalRequesters = new Set([principalRef.requesterId, principalRef.createdById]);

  for (const duplicate of duplicates) {
    await applyStatusChange(duplicate, "merged", actor, at);
    duplicate.set("mergedIntoId", idOf(principal));
    duplicate.set("mergedAt", at);
    duplicate.set("mergedById", actor.id);
    await duplicate.save();

    for (const id of [duplicate.get("requesterId"), duplicate.get("createdById")]) {
      if (!principalRequesters.has(String(id))) extraRequesters.add(String(id));
    }
    if (options.addAssignees) {
      for (const id of duplicate.get("assigneeIds") as unknown[]) assignees.add(String(id));
    }
  }

  principal.set(
    "mergedTicketIds",
    [
      ...new Set([
        ...(principal.get("mergedTicketIds") as unknown[]).map(String),
        ...duplicates.map((duplicate) => String(idOf(duplicate))),
      ]),
    ].map((id) => new Types.ObjectId(id)),
  );
  principal.set(
    "additionalRequesterIds",
    [...extraRequesters].map((id) => new Types.ObjectId(id)),
  );
  if (options.addAssignees) {
    principal.set("assigneeIds", [...assignees].map((id) => new Types.ObjectId(id)));
  }
  principal.set("lastActivityAt", at);
  await principal.save();

  const numbers = duplicates.map((duplicate) => `TK-${String(duplicate.get("number")).padStart(6, "0")}`);
  await recordSystemEvent(
    idOf(principal),
    { kind: "merged", to: numbers.join(", "), reason: options.reason },
    at,
  );
  for (const duplicate of duplicates) {
    await recordSystemEvent(
      idOf(duplicate),
      {
        kind: "merged",
        to: `TK-${String(principal.get("number")).padStart(6, "0")}`,
        reason: options.reason,
      },
      at,
    );
  }

  if (options.notifyRequesters) {
    await notify([...extraRequesters], {
      type: "ticket_merged",
      title: "Tu solicitud se unió a otra igual",
      body: `Se está atendiendo en TK-${String(principal.get("number")).padStart(6, "0")}.`,
      ticketId: idOf(principal),
    });
  }

  // Los responsables del principal también se enteran: a su ticket le acaban de
  // llegar más personas afectadas y eso cambia su urgencia (spec §8).
  await notify(
    (principal.get("assigneeIds") as unknown[]).map(String).filter((id) => id !== actor.id),
    {
      type: "ticket_merged",
      title: "Se fusionaron duplicados en tu ticket",
      body: `${duplicates.length} ticket(s) se unieron a TK-${String(principal.get("number")).padStart(6, "0")}.`,
      ticketId: idOf(principal),
    },
  );
}

/**
 * Separa un duplicado del principal. Vuelve al estado que tenía antes de la
 * fusión y su plazo de resolución se corre el tiempo que estuvo absorbido: si no,
 * un ticket separado tres días después nacería vencido sin que nadie lo dejara caer.
 */
export async function unmergeTicket(
  principal: TicketDoc,
  duplicateId: string,
  actor: Actor,
): Promise<void> {
  const principalRef = refOf(principal.toObject() as LeanTicket);
  if (!canUnmerge(actor, principalRef)) {
    throw new AppError(403, "forbidden", "Solo el supervisor del área deshace una fusión");
  }
  if (principal.get("status") === "closed") {
    throw new AppError(409, "ticket_closed", "El principal ya está cerrado");
  }

  const merged = (principal.get("mergedTicketIds") as unknown[]).map(String);
  if (!merged.includes(duplicateId)) {
    throw new AppError(404, "not_found", "Ese ticket no está fusionado en este");
  }

  const duplicate = (await Ticket.findById(duplicateId)) as TicketDoc | null;
  if (!duplicate) throw new AppError(404, "not_found", "Ese ticket no existe");

  const at = new Date();
  const mergedAt = (duplicate.get("mergedAt") as Date | undefined) ?? at;

  // El estado anterior sale del historial: la entrada justo antes de "merged".
  const history = duplicate.get("statusHistory") as { status: TicketStatus }[];
  const mergedIndex = history.map((entry) => entry.status).lastIndexOf("merged");
  const previous = (mergedIndex > 0 ? history[mergedIndex - 1]!.status : "open") as TicketStatus;

  const calendar = await getCalendar();
  const sla = duplicate.get("sla");
  const resolution = shiftTargets(
    { dueAt: sla.resolutionDueAt as Date, riskAt: sla.resolutionRiskAt as Date },
    mergedAt,
    at,
    calendar,
  );
  duplicate.set("sla.resolutionDueAt", resolution.dueAt);
  duplicate.set("sla.resolutionRiskAt", resolution.riskAt);

  await applyStatusChange(duplicate, previous, actor, at);
  duplicate.set("mergedIntoId", undefined);
  duplicate.set("mergedAt", undefined);
  duplicate.set("mergedById", undefined);
  await duplicate.save();

  principal.set(
    "mergedTicketIds",
    merged.filter((id) => id !== duplicateId).map((id) => new Types.ObjectId(id)),
  );
  // Sus solicitantes dejan de serlo del principal, salvo que otro duplicado que
  // sigue fusionado los aporte también.
  const stillMerged = (await Ticket.find({
    _id: { $in: merged.filter((id) => id !== duplicateId) },
  })
    .select("requesterId createdById")
    .lean()) as LeanTicket[];
  const keep = new Set<string>();
  for (const ticket of stillMerged) {
    keep.add(String(ticket["requesterId"]));
    keep.add(String(ticket["createdById"]));
  }
  principal.set(
    "additionalRequesterIds",
    (principal.get("additionalRequesterIds") as unknown[])
      .map(String)
      .filter((id) => keep.has(id))
      .map((id) => new Types.ObjectId(id)),
  );
  principal.set("lastActivityAt", at);
  await principal.save();

  const number = `TK-${String(duplicate.get("number")).padStart(6, "0")}`;
  await recordSystemEvent(idOf(principal), { kind: "unmerged", to: number }, at);
  await recordSystemEvent(
    idOf(duplicate),
    { kind: "unmerged", to: `separado de TK-${String(principal.get("number")).padStart(6, "0")}` },
    at,
  );

  // Su solicitante tiene que saber que su ticket volvió a vivir por su cuenta, y
  // los responsables de ambos, que hay otra conversación que atender (spec §8).
  const audience = [
    String(duplicate.get("requesterId")),
    String(duplicate.get("createdById")),
    ...(duplicate.get("assigneeIds") as unknown[]).map(String),
    ...(principal.get("assigneeIds") as unknown[]).map(String),
  ].filter((id) => id !== actor.id);

  await notify(audience, {
    type: "ticket_unmerged",
    title: `${number} se separó y vuelve a atenderse aparte`,
    body: duplicate.get("title"),
    ticketId: idOf(duplicate),
    ticketNumber: duplicate.get("number"),
  });
}
