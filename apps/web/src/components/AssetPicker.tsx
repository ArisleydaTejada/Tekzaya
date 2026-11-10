import {
  ASSET_TYPE_LABEL,
  ASSET_TYPE_PLURAL_LABEL,
  formatAssetNumber,
  type AssetPickGroup,
  type AssetPickerItem,
  type AssetType,
} from "@tekzaya/shared";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useDeferredValue, useState } from "react";
import { assetKeys, listAssetLinkOptions } from "../api/assets";
import { useAuth } from "../auth/AuthContext";
import { useOnOpen } from "../lib/useOnOpen";
import { AssetStatusBadge } from "./assets";
import { SearchIcon } from "./icons";
import { Modal } from "./Modal";

/** Lo que el formulario necesita recordar del equipo elegido. */
export type PickedAsset = Omit<AssetPickerItem, "group">;

function groupTitle(group: AssetPickGroup, person: { id: string; name: string }, meId?: string): string {
  const mine = person.id === meId;

  switch (group) {
    case "custodian":
      return mine ? "A tu cargo" : `A cargo de ${person.name}`;
    case "area":
      return mine ? "Los que usa tu área" : `Los que usa el área de ${person.name}`;
    case "other":
      return "Otros que mantiene tu área";
  }
}

/**
 * "Vincular un equipo" (plan A2). El servidor ya devuelve solo lo que se puede
 * vincular y en el orden en que conviene ofrecerlo: primero lo que la persona
 * tiene a su cargo, luego lo de su área. Aquí solo se agrupa y se busca.
 */
export function AssetPicker({
  open,
  onClose,
  onPick,
  ticketId,
  requesterId,
  type,
  selectedId,
}: {
  open: boolean;
  onClose: () => void;
  onPick: (asset: PickedAsset) => void;
  /** Ticket ya creado; sin él, el ticket será de quien elige. */
  ticketId?: string;
  /** Sin `ticketId`: el compañero en cuyo nombre se crea el ticket. */
  requesterId?: string;
  /** El tipo del que habla el ticket: se ofrece solo ese, con la opción de ver todos. */
  type?: AssetType;
  selectedId?: string;
}) {
  const { me } = useAuth();
  const [search, setSearch] = useState("");
  const q = useDeferredValue(search.trim());
  const [showAll, setShowAll] = useState(false);
  useOnOpen(open, () => setShowAll(false));
  const onlyType = type && !showAll ? type : undefined;

  const query = {
    q: q || undefined,
    ticketId: ticketId || undefined,
    requesterId: requesterId || undefined,
    type: onlyType || undefined,
  };

  const { data, isLoading, isError, error } = useQuery({
    queryKey: assetKeys.linkOptions(query),
    queryFn: () => listAssetLinkOptions(query),
    enabled: open,
    placeholderData: keepPreviousData,
  });

  const items = data?.items ?? [];

  const groups = (["custodian", "area", "other"] as const).flatMap((group) => {
    const inGroup = items.filter((item) => item.group === group);

    return inGroup.length > 0 ? [{ group, items: inGroup }] : [];
  });

  return (
    <Modal open={open} onClose={onClose} title="Vincular un equipo" wide>
      <div className="relative mb-3">
        <SearchIcon className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--content-ink-dim)]" />
        <input
          autoFocus
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          aria-label="Buscar equipo"
          placeholder="Número, nombre, marca, serie o ubicación…"
          className="w-full rounded-lg border border-[var(--content-border)] bg-[var(--content-bg)] py-2 pl-9 pr-3 text-sm text-[var(--content-ink)] outline-none placeholder:text-[var(--content-ink-dim)] focus:border-accent focus:ring-2 focus:ring-accent/25"
        />
      </div>

      {type && (
        <p className="mb-3 flex flex-wrap items-center gap-x-2 text-xs text-[var(--content-ink-dim)]">
          {onlyType ? `Solo ${ASSET_TYPE_PLURAL_LABEL[type]}, por lo que escribiste.` : "Todos los equipos."}
          <button type="button" onClick={() => setShowAll(!showAll)} className="font-medium text-accent-ink hover:underline">
            {onlyType ? "Ver todos los equipos" : `Solo ${ASSET_TYPE_PLURAL_LABEL[type]}`}
          </button>
        </p>
      )}

      {isError ? (
        <p role="alert" className="py-6 text-center text-sm text-red">
          {error instanceof Error ? error.message : "No se pudieron cargar los equipos."}
        </p>
      ) : isLoading ? (
        <p className="py-6 text-center text-sm text-[var(--content-ink-dim)]">Buscando equipos…</p>
      ) : groups.length === 0 ? (
        <p className="py-6 text-center text-sm text-[var(--content-ink-dim)]">
          {q
            ? "Ningún equipo coincide con la búsqueda."
            : onlyType
              ? `No hay ${ASSET_TYPE_PLURAL_LABEL[onlyType]} que puedas vincular a este ticket.`
              : "No hay equipos que puedas vincular a este ticket."}
        </p>
      ) : (
        <div className="space-y-4">
          {groups.map(({ group, items: groupItems }) => (
            <section key={group} aria-label={groupTitle(group, data!.person, me?.id)}>
              <h3 className="mb-1.5 font-display text-[11px] font-semibold uppercase tracking-wide text-[var(--content-ink-dim)]">
                {groupTitle(group, data!.person, me?.id)}
              </h3>
              <ul className="space-y-1">
                {groupItems.map(({ group: _group, ...asset }) => {
                  const selected = asset.id === selectedId;

                  return (
                    <li key={asset.id}>
                      <button
                        type="button"
                        aria-pressed={selected}
                        onClick={() => {
                          onPick(asset);
                          onClose();
                        }}
                        className={`flex w-full flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                          selected
                            ? "border-accent bg-accent/10"
                            : "border-[var(--content-border)] hover:border-accent/50 hover:bg-[var(--content-bg)]"
                        }`}
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium text-[var(--content-ink)]">{asset.name}</span>
                          <span className="block truncate text-xs text-[var(--content-ink-dim)]">
                            <span className="font-display tabular">{formatAssetNumber(asset.number)}</span> ·{" "}
                            {ASSET_TYPE_LABEL[asset.type]} · {asset.location}
                            {asset.custodianName && ` · ${asset.custodianName}`}
                          </span>
                        </span>
                        <AssetStatusBadge status={asset.status} />
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </Modal>
  );
}
