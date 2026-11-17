/**
 * Finishing a request moves its quantities:
 *   طلب شراء          each line enters the warehouse chosen for it
 *   طلب توريد         each line leaves the warehouse chosen for it and enters a warehouse of the branch that asked
 *                     (requests saved before branches existed name one branch warehouse: every line enters it)
 * A request moves stock once (receivedAt).
 */
import type { Db } from "@/data/hooks";
import type { StockItem, StockRequest, StorageLocation } from "@/data/types";
import { nowIso } from "@/lib/time";
import { applyMoves, levelId } from "@/modules/inventory/stock";
import { toBaseQty } from "../lib";

export class ReceiveError extends Error {}

export async function finishRequest(db: Db, requestId: string, lineLocations: Record<string, string>, destLocations: Record<string, string> = {}): Promise<StockRequest> {
  const req = await db.get("stockRequests", requestId);
  if (!req) throw new ReceiveError("الطلب غير موجود");
  if (req.receivedAt) throw new ReceiveError("الطلب تم استلامه من قبل");
  const items = new Map((await db.list("stockItems")).map((i) => [i.id, i] as [string, StockItem]));
  const locs = new Map((await db.list("storageLocations")).map((l) => [l.id, l] as [string, StorageLocation]));
  const supply = req.kind === "supply";
  const legacy = supply ? locs.get(req.branchLocationId ?? "") : undefined;
  if (supply && !legacy && !req.branchId) throw new ReceiveError("مخزن الفرع غير موجود");
  const lines = req.lines.map((l) => {
    const item = items.get(l.itemId);
    const loc = locs.get(lineLocations[l.itemId] ?? l.locationId ?? req.toLocationId ?? "");
    if (!item) throw new ReceiveError(`الصنف ${l.name.ar} غير موجود`);
    if (!loc) throw new ReceiveError(`اختر المخزن للصنف ${l.name.ar}`);
    const dest = supply ? legacy ?? locs.get(destLocations[l.itemId] ?? l.toLocationId ?? "") : undefined;
    if (supply && (!dest || (!legacy && dest.branchId !== req.branchId))) throw new ReceiveError(`اختر مخزن الفرع للصنف ${l.name.ar}`);
    if (dest && dest.id === loc.id) throw new ReceiveError(`مخزن الخروج ومخزن الفرع واحد للصنف ${l.name.ar}`);
    return { line: l, item, loc, dest, qty: toBaseQty(l.qty, item) };
  });
  const ref = { refType: "stock_request", refId: req.id, groupId: req.id };
  if (supply) {
    for (const l of lines) {
      const have = (await db.get("stockLevels", levelId(db.restaurantId, l.loc.id, l.item.id)))?.qty ?? 0;
      if (l.qty > have + 1e-6) throw new ReceiveError(`الكمية المتوفرة من ${l.item.name.ar} في ${l.loc.name.ar} أقل من المطلوب`);
    }
    const out = await applyMoves(db, lines.map((l) => ({ itemId: l.item.id, locationId: l.loc.id, branchId: l.loc.branchId, kind: "transfer_out" as const, qty: -l.qty, ...ref })), { items });
    await applyMoves(db, lines.map((l, i) => ({ itemId: l.item.id, locationId: l.dest!.id, branchId: l.dest!.branchId, kind: "transfer_in" as const, qty: l.qty, value: Math.abs(out[i]?.value ?? 0), ...ref })), { items });
  } else {
    await applyMoves(db, lines.map((l) => ({ itemId: l.item.id, locationId: l.loc.id, branchId: l.loc.branchId, kind: "receive" as const, qty: l.qty, value: Math.round(l.qty * l.item.lastCost), ...ref })), { items });
  }
  return db.update("stockRequests", req.id, {
    status: "done", receivedAt: nowIso(),
    lines: lines.map((l) => ({ ...l.line, locationId: l.loc.id, ...(l.dest ? { toLocationId: l.dest.id } : {}) })),
  });
}
