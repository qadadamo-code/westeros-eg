/**
 * طلب توريد — the flow Mohammed set on 2026-11-20:
 *   1. a branch employee asks (the branch is their workplace unless their role may choose it)
 *   2. the employees responsible for the products' kind (مواد خام / منتجات مصنعة, ticked on their role) are told,
 *      set the request قيد التنفيذ or مؤجل to another date, and type the quantity sent from a warehouse
 *   3. the employee who asked documents the receipt by scanning the stickers (the expiry sticker of a manufactured
 *      product, the supply sticker printed for a raw material), then picks the warehouse each product is stored in
 *   4. only then the stock moves: out of the warehouse it was sent from, into the branch warehouse
 */
import type { Db } from "@/data/hooks";
import type { MfgBatch, MfgLists, MfgProduct, StockItem, StockLevel, StockRequest, StockRequestEvent, StockRequestLine, StorageLocation } from "@/data/types";
import { nowIso } from "@/lib/time";
import { applyMoves, levelId } from "@/modules/inventory/stock";
import { memberCan } from "../perms";
import { requestOpen, toBaseQty } from "../lib";

export class SupplyError extends Error {}

export type LineKind = "raw" | "made";
export const KIND_LABEL: Record<LineKind, string> = { raw: "مواد خام", made: "منتجات مصنعة" };

type Actor = { id: string; name: string; role: string } | null | undefined;

/** مواد خام or منتج مصنع: saved on the line, else read from the stock item */
export const lineKind = (l: Pick<StockRequestLine, "kind" | "itemId">, itemById?: Map<string, Pick<StockItem, "kind">>): LineKind =>
  l.kind ?? (itemById?.get(l.itemId)?.kind === "raw" ? "raw" : "made");

/** the warehouses and what they hold: who keeps the warehouse a requested product is stored in */
export interface StoreCtx {
  locations: Pick<StorageLocation, "id" | "branchId" | "keeperId" | "active">[];
  levels: Pick<StockLevel, "itemId" | "locationId" | "qty">[];
}

/**
 * The warehouses a line is supplied from: the active ones outside the asking branch that hold the product,
 * else (none holds it) every active warehouse outside that branch.
 */
export function sourcesOf(line: Pick<StockRequestLine, "itemId">, req: Pick<StockRequest, "branchId">, stores: StoreCtx) {
  const outside = stores.locations.filter((l) => l.active && l.branchId !== req.branchId);
  const holding = outside.filter((l) => stores.levels.some((v) => v.locationId === l.id && v.itemId === line.itemId && v.qty > 0));
  return holding.length ? holding : outside;
}

/**
 * Is this line for this member? The owner handles every line. Anyone else needs "إشعارات وتنفيذ طلبات التوريد"
 * on their role and must keep (امين المخزن) one of the warehouses the product is stored in; when none of those
 * warehouses has a keeper, everyone with the permission is told.
 */
export function mineLine(member: Actor, lists: MfgLists | null | undefined, line: Pick<StockRequestLine, "itemId">, req: Pick<StockRequest, "branchId">, stores: StoreCtx): boolean {
  if (!member) return false;
  if (member.role === "owner") return true;
  if (!memberCan(member, lists, "supply.handle")) return false;
  const keepers = new Set(sourcesOf(line, req, stores).map((l) => l.keeperId).filter(Boolean));
  return keepers.size ? keepers.has(member.id) : true;
}

const day = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: "Africa/Cairo" });

/** a line still waiting to be sent */
export const waitingToSend = (l: StockRequestLine) => l.sentQty == null;
/** a line sent and not received yet */
export const waitingToReceive = (l: StockRequestLine) => (l.sentQty ?? 0) > 0 && l.receivedQty == null;

/**
 * What waits for this member:
 *   toSend     open requests with lines from the warehouses they keep that were not sent (a request postponed to a later day waits until that day)
 *   toReceive  requests they asked for with lines that were sent and not received
 *   toBuy      طلب شراء waiting for the purchasing employee; toConfirm: bought, waiting for the keeper who asked to document the receipt
 */
export function pendingFor(member: Actor, lists: MfgLists | null | undefined, requests: StockRequest[], stores: StoreCtx, now = nowIso()) {
  const today = day(now);
  const open = requests.filter((r) => r.kind === "supply" && requestOpen(r));
  const toSend = !member ? [] : open.filter((r) =>
    r.status !== "rejected" && !(r.status === "postponed" && r.dueDate && r.dueDate > today) && r.lines.some((l) => waitingToSend(l) && mineLine(member, lists, l, r, stores)));
  const toReceive = !member ? [] : open.filter((r) => r.keeperId === member.id && r.lines.some(waitingToReceive));
  // طلب شراء: the employees responsible for purchasing see every open request (a postponed one from its new date)
  const toBuy = !member || !memberCan(member, lists, "purchase.handle") ? [] : requests.filter((r) =>
    r.kind === "purchase" && requestOpen(r) && r.status !== "sent" && !(r.status === "postponed" && r.dueDate && r.dueDate > today));
  // bought: the warehouse keeper who asked documents the receipt
  const toConfirm = !member ? [] : requests.filter((r) => r.kind === "purchase" && r.status === "sent" && requestOpen(r) && r.keeperId === member.id);
  const supply = toSend.length + toReceive.length, purchase = toBuy.length + toConfirm.length;
  return { toSend, toReceive, toBuy, toConfirm, supply, purchase, count: supply + purchase };
}

const event = (actor: Actor, action: string, note?: string): StockRequestEvent => ({ at: nowIso(), by: actor?.id ?? null, name: actor?.name ?? "", action, ...(note ? { note } : {}) });

/** قيد التنفيذ، or مؤجل to another date (the new date becomes موعد التوريد) */
export async function setRequestStatus(db: Db, req: StockRequest, actor: Actor, status: "in_progress" | "postponed" | "rejected", newDue?: string) {
  if (!requestOpen(req)) throw new SupplyError("الطلب ده اتقفل");
  if (status === "postponed" && !newDue) throw new SupplyError("حدد الموعد الجديد");
  return db.update("stockRequests", req.id, {
    status,
    ...(status === "postponed" ? { dueDate: newDue } : {}),
    history: [...(req.history ?? []), event(actor, status, status === "postponed" ? `الموعد الجديد ${newDue}` : undefined)],
  });
}

/**
 * الكمية اللي اتبعتت: per line, the quantity and the warehouse it leaves from. Nothing moves yet.
 * When every line was sent the request is تم الإرسال.
 */
export async function sendLines(db: Db, reqId: string, actor: Actor, sent: Record<string, { qty: number; locationId: string | null }>) {
  const req = await db.get("stockRequests", reqId);
  if (!req) throw new SupplyError("الطلب غير موجود");
  if (!requestOpen(req)) throw new SupplyError("الطلب ده اتقفل");
  const locs = new Map((await db.list("storageLocations")).map((l) => [l.id, l] as [string, StorageLocation]));
  const items = new Map((await db.list("stockItems")).map((i) => [i.id, i] as [string, StockItem]));
  const lines = req.lines.map((l) => {
    const s = sent[l.itemId];
    if (!s || !waitingToSend(l)) return l;
    const qty = Math.max(0, Math.round(s.qty * 1000) / 1000);
    if (qty > 0) {
      const loc = locs.get(s.locationId ?? "");
      if (!loc) throw new SupplyError(`اختر المخزن اللي ${l.name.ar} هيخرج منه`);
      if (req.branchId && loc.branchId === req.branchId) throw new SupplyError(`${l.name.ar}: المخزن ده في نفس الفرع اللي طالب`);
    }
    return { ...l, kind: lineKind(l, items), sentQty: qty, locationId: qty > 0 ? s.locationId : null, sentBy: actor?.id ?? null, sentByName: actor?.name ?? "" };
  });
  const changed = lines.filter((l, i) => l !== req.lines[i]);
  if (!changed.length) throw new SupplyError("اكتب الكمية اللي اتبعتت");
  const all = lines.every((l) => !waitingToSend(l));
  const nothing = all && lines.every((l) => !l.sentQty);
  return db.update("stockRequests", req.id, {
    lines,
    status: nothing ? "rejected" : all ? "sent" : "in_progress",
    ...(all ? { sentAt: nowIso() } : {}),
    history: [...(req.history ?? []), event(actor, "sent", changed.map((l) => `${l.name.ar}: ${l.sentQty} ${l.unit}`).join("، "))],
  });
}

/* ───────── المسح الضوئي ───────── */

export type Sticker =
  | { type: "batch"; number: string; product: string | null; index: number | null }
  | { type: "supply"; request: number; sku: string; index: number | null };

/** what a scanned code says: the expiry sticker of a batch, or the supply sticker of a raw material */
export function parseSticker(text: string): Sticker | null {
  const t = text.trim();
  if (!t) return null;
  let params: URLSearchParams | null = null;
  try {
    params = new URL(t).searchParams;
  } catch {
    const q = t.indexOf("?");
    if (q >= 0) params = new URLSearchParams(t.slice(q + 1));
  }
  const n = (v: string | null) => (v && /^\d+$/.test(v) ? Number(v) : null);
  if (params?.get("b")) return { type: "batch", number: params.get("b")!, product: params.get("p"), index: n(params.get("s")) };
  if (params?.get("r") && params.get("i")) return { type: "supply", request: Number(params.get("r")), sku: params.get("i")!, index: n(params.get("s")) };
  // typed by hand: the code printed in the box of the supply sticker (T12-10005-3) or a batch number
  const m = /^T(\d+)-([^-\s]+)-(\d+)$/i.exec(t);
  if (m) return { type: "supply", request: Number(m[1]), sku: m[2], index: Number(m[3]) };
  if (/^\d+-\d{8}#\d+\(\d+\)$/.test(t)) return { type: "batch", number: t, product: null, index: null };
  return null;
}

/** the supply sticker's link: opens the request's receipt when scanned with a phone camera */
export function supplyLink(request: number, sku: string, index: number): string {
  const origin = typeof location === "undefined" ? "" : location.origin;
  return `${origin}${import.meta.env.BASE_URL}stores/supply?r=${request}&i=${encodeURIComponent(sku)}&s=${index}`;
}
export const supplyCode = (request: number, sku: string, index: number) => `T${request}-${sku}-${index}`;

export interface ScanContext {
  itemById: Map<string, StockItem>;
  /** product of a stock item (for كمية وحدة التخزين and the product code) */
  productByItem: Map<string, MfgProduct>;
  batchByNumber: (number: string) => MfgBatch | undefined;
}
export interface ScanHit { itemId: string; key: string; qty: number }

/** One scanned sticker against the request: which line it is, how much it holds, and a key so it counts once. */
export function matchScan(req: StockRequest, scanned: Record<string, string[]>, received: Record<string, number>, text: string, ctx: ScanContext): ScanHit | { error: string } {
  const s = parseSticker(text);
  if (!s) return { error: "الكود ده مش ملصق صلاحية ولا ملصق توريد" };
  const open = req.lines.filter(waitingToReceive);
  const left = (l: StockRequestLine) => Math.max(0, (l.sentQty ?? 0) - (received[l.itemId] ?? 0));
  if (s.type === "supply") {
    if (s.request !== req.number) return { error: `الملصق ده من طلب توريد رقم ${s.request}` };
    const line = open.find((l) => ctx.itemById.get(l.itemId)?.sku === s.sku);
    if (!line) return { error: "الخامة دي مش في الكميات اللي اتبعتت في الطلب ده" };
    const key = `r:${s.request}:${s.sku}:${s.index ?? `x${Date.now()}`}`;
    if (scanned[line.itemId]?.includes(key)) return { error: `ملصق ${line.name.ar} ده اتمسح قبل كده` };
    if (left(line) <= 0) return { error: `اتمسحت كل كمية ${line.name.ar} اللي اتبعتت` };
    return { itemId: line.itemId, key, qty: Math.min(1, left(line)) };
  }
  const batch = ctx.batchByNumber(s.number);
  if (!batch) return { error: `التشغيلة ${s.number} مش موجودة` };
  if (batch.status === "void") return { error: `التشغيلة ${s.number} ملغية` };
  const outs = batch.outputs.filter((o) => !s.product || ctx.productByItem.get(o.stockItemId)?.code === s.product);
  const line = open.find((l) => outs.some((o) => o.stockItemId === l.itemId));
  if (!line) return { error: "المنتج ده مش في الكميات اللي اتبعتت في الطلب ده" };
  const out = outs.find((o) => o.stockItemId === line.itemId)!;
  const key = `b:${s.number}:${s.product ?? out.productId}:${s.index ?? `x${Date.now()}`}`;
  if (scanned[line.itemId]?.includes(key)) return { error: `ملصق ${line.name.ar} ده اتمسح قبل كده` };
  if (left(line) <= 0) return { error: `اتمسحت كل كمية ${line.name.ar} اللي اتبعتت` };
  // one sticker = one storage unit of the product; without كمية وحدة التخزين one sticker is the whole batch
  const holds = ctx.productByItem.get(line.itemId)?.storageQty;
  const whole = out.unit === "pc" ? out.count ?? 0 : out.weightKg ?? 0;
  const qty = holds && holds > 0 ? holds : whole;
  return { itemId: line.itemId, key, qty: Math.min(qty || left(line), left(line)) };
}

/**
 * توثيق الاستلام: each scanned line, the quantity received and the branch warehouse it is stored in.
 * The received quantity leaves the warehouse it was sent from and enters that warehouse. When every sent line is
 * received the request is تم الاستلام.
 */
export async function receiveLines(db: Db, reqId: string, actor: Actor, got: Record<string, { qty: number; toLocationId: string; scans: string[] }>) {
  const req = await db.get("stockRequests", reqId);
  if (!req) throw new SupplyError("الطلب غير موجود");
  if (req.receivedAt) throw new SupplyError("الطلب اتستلم قبل كده");
  const items = new Map((await db.list("stockItems")).map((i) => [i.id, i] as [string, StockItem]));
  const locs = new Map((await db.list("storageLocations")).map((l) => [l.id, l] as [string, StorageLocation]));
  const todo = req.lines.filter((l) => waitingToReceive(l) && got[l.itemId]);
  if (!todo.length) throw new SupplyError("امسح ملصق منتج واحد على الأقل");
  const moves = todo.map((l) => {
    const g = got[l.itemId];
    const item = items.get(l.itemId);
    if (!item) throw new SupplyError(`الصنف ${l.name.ar} غير موجود`);
    if (!g.scans.length) throw new SupplyError(`امسح ملصق ${l.name.ar} الأول`);
    const qty = Math.round(g.qty * 1000) / 1000;
    if (!(qty > 0)) throw new SupplyError(`اكتب الكمية المستلمة من ${l.name.ar}`);
    if (qty > (l.sentQty ?? 0) + 1e-6) throw new SupplyError(`الكمية المستلمة من ${l.name.ar} أكبر من اللي اتبعت`);
    const from = locs.get(l.locationId ?? "");
    const to = locs.get(g.toLocationId);
    if (!from) throw new SupplyError(`المخزن اللي ${l.name.ar} خرج منه غير موجود`);
    if (!to) throw new SupplyError(`اختر المخزن اللي ${l.name.ar} هيتخزن فيه`);
    if (req.branchId && to.branchId !== req.branchId) throw new SupplyError(`${l.name.ar}: المخزن لازم يكون في الفرع اللي طالب`);
    if (to.id === from.id) throw new SupplyError(`${l.name.ar}: مخزن الخروج ومخزن الاستلام واحد`);
    return { line: l, item, from, to, qty, base: toBaseQty(qty, item), scans: g.scans };
  });
  for (const m of moves) {
    const have = (await db.get("stockLevels", levelId(db.restaurantId, m.from.id, m.item.id)))?.qty ?? 0;
    if (m.base > have + 1e-6) throw new SupplyError(`الرصيد في ${m.from.name.ar} من ${m.item.name.ar} أقل من الكمية المستلمة`);
  }
  const ref = { refType: "stock_request", refId: req.id, groupId: req.id };
  const out = await applyMoves(db, moves.map((m) => ({ itemId: m.item.id, locationId: m.from.id, branchId: m.from.branchId, kind: "transfer_out" as const, qty: -m.base, ...ref })), { items });
  await applyMoves(db, moves.map((m, i) => ({ itemId: m.item.id, locationId: m.to.id, branchId: m.to.branchId, kind: "transfer_in" as const, qty: m.base, value: Math.abs(out[i]?.value ?? 0), ...ref })), { items });
  const byItem = new Map(moves.map((m) => [m.line.itemId, m]));
  const lines = req.lines.map((l) => {
    const m = byItem.get(l.itemId);
    return m ? { ...l, receivedQty: m.qty, toLocationId: m.to.id, scans: m.scans } : l;
  });
  const settled = lines.every((l) => l.receivedQty != null || (l.sentQty != null && !l.sentQty));
  return db.update("stockRequests", req.id, {
    lines,
    ...(settled ? { status: "done" as const, receivedAt: nowIso() } : {}),
    history: [...(req.history ?? []), event(actor, "received", moves.map((m) => `${m.line.name.ar}: ${m.qty} ${m.line.unit}${m.qty < (m.line.sentQty ?? 0) ? ` من ${m.line.sentQty}` : ""}`).join("، "))],
  });
}
