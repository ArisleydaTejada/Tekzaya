import { formatSparePartNumber, PART_UNIT_LABEL, type PartUnit } from "@tekzaya/shared";
import type { Types } from "mongoose";
import { SparePart } from "../../models/maintenance.models";
import { notify, supervisorsOf } from "../notifications/notifications.service";

/**
 * Las existencias se mueven solo por aquí. `stock` es la suma en caché del libro
 * (`stock_movements`) y cada cambio es una única actualización atómica: dos
 * técnicos que tocan la misma pieza a la vez nunca la dejan en un número que
 * no salga de sumar sus movimientos (plan §2.3).
 */

/** Documento plano de un repuesto, tal como sale de `.lean()`. */
export interface LeanSparePart {
  _id: Types.ObjectId;
  number: number;
  name: string;
  areaId: Types.ObjectId;
  unit: string;
  stock: number;
  minStock: number;
  avgUnitCost: number;
  isActive: boolean;
  /** Ausente en los repuestos anteriores al vínculo con equipos. */
  assetIds?: Types.ObjectId[] | null;
  lowStockNotifiedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Entra mercancía al costo `unitCost` y el promedio ponderado se recalcula en la
 * misma operación, con el stock tal como está en la base (`weightedAverageCost`
 * escrito como pipeline). `$round` de Mongo redondea al par; `floor(x + 0,5)`
 * es `Math.round` para montos positivos, igual que la función pura.
 *
 * Se usa para las compras y también para las devoluciones de una orden: la pieza
 * vuelve al costo con el que salió, así el valor del almacén cuadra.
 */
export async function receiveStock(partId: Types.ObjectId, qty: number, unitCost: number): Promise<LeanSparePart | null> {
  return (await SparePart.findOneAndUpdate(
    { _id: partId },
    [
      {
        $set: {
          avgUnitCost: {
            $cond: [
              { $lte: ["$stock", 0] },
              unitCost,
              {
                $floor: {
                  $add: [
                    {
                      $divide: [
                        { $add: [{ $multiply: ["$stock", "$avgUnitCost"] }, qty * unitCost] },
                        { $add: ["$stock", qty] },
                      ],
                    },
                    0.5,
                  ],
                },
              },
            ],
          },
          stock: { $add: ["$stock", qty] },
        },
      },
    ],
    { returnDocument: "after", updatePipeline: true },
  ).lean()) as LeanSparePart | null;
}

/**
 * Saca `qty` solo si alcanzan: la condición va en la propia actualización, así
 * que de dos consumos del último filtro a la vez pasa uno y el otro recibe
 * `null`. El promedio no cambia: sacar piezas no encarece las que quedan.
 * Devuelve el documento **antes** de sacar, que trae el costo del momento.
 */
export async function takeStock(
  partId: Types.ObjectId,
  qty: number,
  extra: Record<string, unknown> = {},
): Promise<LeanSparePart | null> {
  return (await SparePart.findOneAndUpdate(
    { _id: partId, stock: { $gte: qty }, ...extra },
    { $inc: { stock: -qty } },
    { returnDocument: "before" },
  ).lean()) as LeanSparePart | null;
}

/** "Solo quedan 2 unidades de Tóner HP 58A": lo que dice un 409 por falta de stock. */
export function shortageMessage(part: Pick<LeanSparePart, "name" | "unit">, left: number): string {
  const unit = PART_UNIT_LABEL[part.unit as PartUnit];
  return left > 0
    ? `Solo queda${left === 1 ? "" : "n"} ${left} ${left === 1 ? unit : `${unit}s`} de ${part.name}`
    : `No queda ${part.name} en el almacén`;
}

/**
 * Aviso `low_stock` al supervisor la **primera vez** que la pieza cruza el
 * mínimo, con una marca como la del SLA para no repetirlo en cada consumo. Al
 * volver a superar el mínimo la marca se borra y el aviso queda armado para la
 * próxima vez. Las dos actualizaciones van condicionadas: dos consumos a la vez
 * no mandan dos avisos.
 *
 * Quien provoca el cruce no recibe el aviso de su propia acción.
 */
export async function checkLowStock(partId: Types.ObjectId, actorId?: string): Promise<void> {
  const below = { $expr: { $lt: ["$stock", "$minStock"] } };
  await SparePart.updateOne(
    { _id: partId, lowStockNotifiedAt: { $exists: true }, $expr: { $gte: ["$stock", "$minStock"] } },
    { $unset: { lowStockNotifiedAt: "" } },
  );
  const armed = (await SparePart.findOneAndUpdate(
    { _id: partId, isActive: true, lowStockNotifiedAt: { $exists: false }, ...below },
    { $set: { lowStockNotifiedAt: new Date() } },
    { returnDocument: "after" },
  ).lean()) as LeanSparePart | null;
  if (!armed) return;

  const audience = (await supervisorsOf(armed.areaId)).filter((id) => id !== actorId);
  const unit = PART_UNIT_LABEL[armed.unit as PartUnit];
  await notify(audience, {
    type: "low_stock",
    title: `Stock bajo: ${armed.name}`,
    body: `${formatSparePartNumber(armed.number)} · quedan ${armed.stock} ${armed.stock === 1 ? unit : `${unit}s`} de un mínimo de ${armed.minStock}`,
    sparePartId: armed._id,
    sparePartNumber: armed.number,
  });
}
