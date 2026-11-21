/**
 * طلب شراء — the flow Mohammed set on 2026-11-21:
 *   1. the warehouse keeper asks for raw materials (جديد)
 *   2. the purchasing employee is told, sets it قيد التنفيذ or مؤجل, then تم الشراء
 *   3. the request stays open until the keeper documents the receipt: the day it arrived and the quantity received of
 *      each raw material (تم الاستلام). Nothing enters the warehouse yet.
 *   4. what was received and is not on a purchase invoice shows in الحسابات > المشتريات; the purchase invoice enters
 *      it into the warehouse (postPurchase) and is linked back to the request's lines.
 */
import type { Db } from "@/data/hooks";
import type { StockRequest, StockRequestEvent, StockRequestLine, StorageLocation } from "@/data/types";
import { nowIso } from "@/lib/time";
import { requestOpen } from "../lib";

export class PurchaseRequestError extends Error {}
type Actor = { id: string | null; name: string } | null | undefined;
const event = (actor: Actor, action: string, note?: string): StockRequestEvent => ({ at: nowIso(), by: actor?.id ?? null, name: actor?.name ?? "", action, ...(note ? { note } : {}) });

/** تم الشراء: the purchasing employee bought it; the keeper is told to document the receipt */
export async function markBought(db: Db, req: StockRequest, actor: Actor) {
  if (req.kind !== "purchase" || !requestOpen(req)) throw new PurchaseRequestError("الطلب ده اتقفل");
  return db.update("stockRequests", req.id, { status: "sent", sentAt: nowIso(), history: [...(req.history ?? []), event(actor, "bought")] });
}

/** a line received and not yet on a purchase invoice */
export const awaitingInvoice = (l: StockRequestLine) => (l.receivedQty ?? 0) > 0 && !l.invoiceId;

/**
 * توثيق الاستلام: the day the goods arrived and the quantity received of each line (0 = nothing came), and the
 * warehouse it will enter when the invoice is registered. Nothing moves.
 */
export async function documentReceipt(db: Db, reqId: string, actor: Actor, day: string, got: Record<string, { qty: number; locationId: string | null }>) {
  const req = await db.get("stockRequests", reqId);
  if (!req || req.kind !== "purchase") throw new PurchaseRequestError("الطلب غير موجود");
  if (!requestOpen(req)) throw new PurchaseRequestError("الاستلام اتوثق قبل كده");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new PurchaseRequestError("اختر تاريخ الاستلام");
  const locs = new Map((await db.list("storageLocations")).map((l) => [l.id, l] as [string, StorageLocation]));
  const lines = req.lines.map((l) => {
    const g = got[l.itemId];
    const qty = Math.max(0, Math.round((g?.qty ?? 0) * 1000) / 1000);
    if (qty > 0 && !locs.get(g?.locationId ?? "")) throw new PurchaseRequestError(`اختر المخزن اللي ${l.name.ar} هيدخله`);
    return { ...l, receivedQty: qty, locationId: qty > 0 ? g!.locationId : null, invoiceId: null };
  });
  if (!lines.some((l) => (l.receivedQty ?? 0) > 0)) throw new PurchaseRequestError("اكتب الكمية المستلمة");
  return db.update("stockRequests", req.id, {
    lines, status: "done", receivedAt: `${day}T10:00:00.000Z`,
    history: [...(req.history ?? []), event(actor, "received", lines.map((l) => `${l.name.ar}: ${l.receivedQty} ${l.unit}`).join("، "))],
  });
}

/** the purchase invoice registered for a request: its lines (by stock item) are marked as invoiced */
export async function linkInvoice(db: Db, reqId: string, invoiceId: string, itemIds: string[], actor: Actor) {
  const req = await db.get("stockRequests", reqId);
  if (!req) return null;
  const ids = new Set(itemIds);
  const lines = req.lines.map((l) => (awaitingInvoice(l) && ids.has(l.itemId) ? { ...l, invoiceId } : l));
  return db.update("stockRequests", req.id, { lines, history: [...(req.history ?? []), event(actor, "invoiced")] });
}

/** the purchase requests with received quantities that are not on an invoice yet, oldest receipt first */
export const awaitingInvoices = (requests: StockRequest[]) =>
  requests.filter((r) => r.kind === "purchase" && r.lines.some(awaitingInvoice)).sort((a, b) => (a.receivedAt ?? "").localeCompare(b.receivedAt ?? ""));
