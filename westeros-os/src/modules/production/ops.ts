/**
 * Saving and voiding a manufacturing batch. A saved batch:
 *   - is numbered `<category>-<DDMMYYYY>#<run>(<chef code>)` and signed with the chef's membership (who made it),
 *   - takes its ingredients out of stock and puts the products in at the batch cost (./build.ts),
 *   - leaves a lot per product with its expiry date, so the stock alerts warn before it expires,
 *   - sets the product's last cost — the "last production price" the next recipes are costed with.
 */
import type { Db } from "@/data/hooks";
import type { Membership, MfgBatch, MfgSettings, StockItem } from "@/data/types";
import { uuid } from "@/lib/id";
import { nowIso } from "@/lib/time";
import { applyMoves, homeLocation, type MoveInput } from "@/modules/inventory/stock";
import { buildBatch, type BatchDraft, type BuildError } from "./build";
import { batchNumber, cairoDay } from "./calc";

export class BatchError extends Error {
  constructor(public errors: BuildError[]) {
    super(`batch is not complete: ${errors.join(", ")}`);
  }
}

export async function mfgSettings(db: Db): Promise<MfgSettings | null> {
  return (await db.list("mfgSettings"))[0] ?? null;
}

/** The chef's code in batch numbers; a chef without one gets the next free number the first time they make a batch. */
export async function chefCodeFor(db: Db, chefId: string): Promise<number> {
  const s = await mfgSettings(db);
  const have = s?.chefCodes[chefId];
  if (have) return have;
  const next = Math.max(0, ...Object.values(s?.chefCodes ?? {})) + 1;
  if (s) await db.update("mfgSettings", s.id, { chefCodes: { ...s.chefCodes, [chefId]: next } });
  return next;
}

export async function saveBatch(db: Db, draft: BatchDraft, p: { chef: Pick<Membership, "id" | "name">; branchId: string; note?: string; madeAt?: string; /** the warehouse chosen for each output, by its stock item */ outputLocations?: Record<string, string> }): Promise<MfgBatch> {
  const madeAt = p.madeAt ?? nowIso();
  const [products, stockItems, settings, everyLocation] = await Promise.all([db.list("mfgProducts"), db.list("stockItems"), mfgSettings(db), db.list("storageLocations")]);
  const locations = everyLocation.filter((l) => l.branchId === p.branchId);
  const items = new Map(stockItems.map((i) => [i.id, i]));
  const built = buildBatch(draft, { products: new Map(products.map((x) => [x.id, x])), items, settings, unitCost: (id) => items.get(id)?.lastCost ?? 0, madeAt });
  if (built.errors.length || !built.outputs.length) throw new BatchError(built.errors.length ? built.errors : ["outputs"]);

  const day = cairoDay(madeAt);
  const lead = built.outputs[0];
  const sameDay = (await db.list("mfgBatches", { where: { day } })).filter((b) => b.outputs[0]?.productId === lead.productId);
  const seq = Math.max(0, ...sameDay.map((b) => b.seq)) + 1;
  const chefCode = await chefCodeFor(db, p.chef.id);
  const id = uuid();
  const { errors: _e, unpriced: _u, ...fields } = built;
  const locationOf = (it: StockItem | undefined) => homeLocation(it, p.branchId, locations)?.id ?? settings?.productLocationId ?? locations[0]?.id ?? "";
  // an output goes to the warehouse chosen for it (it may belong to another branch: the central kitchen)
  const outLoc = (stockItemId: string) => { const chosen = everyLocation.find((l) => l.id === p.outputLocations?.[stockItemId] && l.active); return chosen ? { id: chosen.id, branchId: chosen.branchId } : { id: locationOf(items.get(stockItemId)), branchId: p.branchId }; };
  const locationId = outLoc(lead.stockItemId).id;

  const batch = await db.insert("mfgBatches", {
    ...fields, outputs: built.outputs.map((o) => ({ ...o, locationId: outLoc(o.stockItemId).id })), id, branchId: p.branchId, locationId, number: batchNumber({ categoryCode: built.categoryCode, day, seq, chefCode }), seq, madeAt, day,
    chefId: p.chef.id, chefName: p.chef.name, chefCode, status: "done", voidedBy: null, voidedAt: null, voidReason: "", note: p.note ?? "", labelsPrinted: 0, moveGroupId: id,
  });

  const ref = { refType: "mfg_batch", refId: id, groupId: id, at: madeAt, branchId: p.branchId };
  const moves: MoveInput[] = [
    ...built.inputs.map((l): MoveInput => ({ ...ref, itemId: l.itemId, locationId: locationOf(items.get(l.itemId)), kind: "production_out", qty: -l.qty, note: batch.number })),
    ...built.outputs.map((o): MoveInput => ({ ...ref, itemId: o.stockItemId, locationId: outLoc(o.stockItemId).id, branchId: outLoc(o.stockItemId).branchId, kind: "production_in", qty: outQty(o), value: o.totalCost, note: batch.number })),
  ];
  await applyMoves(db, moves, { items });
  for (const o of built.outputs) {
    const qty = outQty(o);
    await db.insert("stockBatches", { branchId: outLoc(o.stockItemId).branchId, locationId: outLoc(o.stockItemId).id, itemId: o.stockItemId, lot: batch.number, receivedAt: madeAt, expiresOn: cairoDay(o.expiresAt), qty, remaining: qty, poId: null });
    // price of one base unit (gram or piece) from this batch
    if (items.has(o.stockItemId)) await db.update("stockItems", o.stockItemId, { lastCost: o.unit === "kg" ? Math.round(o.unitCost / 1000) : o.unitCost });
  }
  await db.audit("mfg.batch", "mfgBatches", id, { number: batch.number, chef: p.chef.name, total: built.totalCost });
  return batch;
}

/** stock quantity of an output in its base unit: grams when stored by the kilo, pieces otherwise */
export const outQty = (o: { unit: "kg" | "pc"; weightKg: number | null; count: number | null }) => (o.unit === "kg" ? Math.round((o.weightKg ?? 0) * 1_000_000) / 1000 : (o.count ?? 0));

/** Cancels a batch: the products leave stock and the ingredients come back at what they cost. The number is never reused. */
export async function voidBatch(db: Db, batchId: string, p: { reason: string; by: string | null }): Promise<MfgBatch> {
  const b = await db.get("mfgBatches", batchId);
  if (!b || b.status !== "done") throw new Error("batch is not active");
  const items = new Map((await db.list("stockItems")).map((i) => [i.id, i]));
  const everyLocation = await db.list("storageLocations");
  const locations = everyLocation.filter((l) => l.branchId === b.branchId);
  const locationOf = (it: StockItem | undefined) => homeLocation(it, b.branchId, locations)?.id ?? b.locationId;
  // the product leaves the warehouse it was stored in
  const outLoc = (o: MfgBatch["outputs"][number]) => { const l = everyLocation.find((x) => x.id === o.locationId); return l ? { locationId: l.id, branchId: l.branchId } : { locationId: locationOf(items.get(o.stockItemId)) }; };
  const ref = { refType: "mfg_batch_void", refId: b.id, groupId: b.id, branchId: b.branchId, note: `إلغاء ${b.number}` };
  await applyMoves(
    db,
    [
      ...b.outputs.map((o): MoveInput => ({ ...ref, itemId: o.stockItemId, ...outLoc(o), kind: "production_in", qty: -outQty(o) })),
      ...b.inputs.map((l): MoveInput => ({ ...ref, itemId: l.itemId, locationId: locationOf(items.get(l.itemId)), kind: "production_out", qty: l.qty, value: l.cost })),
    ],
    { items },
  );
  for (const lot of await db.list("stockBatches", { where: { lot: b.number } })) await db.update("stockBatches", lot.id, { remaining: 0 });
  const row = await db.update("mfgBatches", b.id, { status: "void", voidedBy: p.by, voidedAt: nowIso(), voidReason: p.reason });
  await db.audit("mfg.batch.void", "mfgBatches", b.id, { number: b.number, reason: p.reason }, p.by);
  return row;
}

export async function countLabels(db: Db, batchId: string, copies: number) {
  const b = await db.get("mfgBatches", batchId);
  if (b) await db.update("mfgBatches", b.id, { labelsPrinted: b.labelsPrinted + copies });
}
