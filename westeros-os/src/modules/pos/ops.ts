/**
 * POS ticket operations on the data layer. Every write goes through Db (scoped to the restaurant), so the floor, the
 * kitchen display and other tablets see each change live. Totals are always recomputed with @finance/tax.
 */
import { channelFor, levelPrice } from "@/data/channels";
import type { Db } from "@/data/hooks";
import { nextOrderNumber, recomputeCheck, setTableStatus } from "@/data/ops";
import type { Check, Discount, MenuCategory, MenuItem, Modifier, Order, OrderItem, OrderItemModifier, OrderMode, OrderSource } from "@/data/types";
import { nowIso } from "@/lib/time";
import { sameLine, sendableItems } from "./math";
import { deductForItems, onLineVoided } from "@/modules/inventory/deduct";
import { channelOf, priceFor } from "@/modules/menu/rules";
import { comboMods } from "@/modules/menu/sold";
import { listsOf } from "@/modules/cc/lib";
import { printOf } from "@/modules/cc/print/setup";
import { kitchenTimeOf, orderMinutes } from "@/modules/kitchen/autoTime";

export interface TicketDraft {
  mode: OrderMode;
  pickup: boolean;
  tableIds: string[];
  guests: number;
  customerId: string | null;
  deliveryFee: number;
  delivery: Order["delivery"];
  pickupAt: string | null;
  source?: OrderSource;
  /** قناة البيع اللي الطلب الجديد هيتسجل عليها */
  channelId?: string | null;
  /** كود الطلب في تطبيق التوصيل */
  externalRef?: string | null;
  /** مندوب التوصيل (مندوبو خدمة التوصيل) the order is put on for now */
  driverId?: string | null;
}

export interface Ticket {
  check: Check;
  orders: Order[];
  items: OrderItem[];
}

async function branchOf(db: Db) {
  if (db.branchId) return db.branchId;
  const [b] = await db.list("branches", { where: { isDefault: true } });
  if (!b) throw new Error("no branch");
  return b.id;
}

/** Opens a check with its first order (lazily, on the first item). */
export async function openTicket(db: Db, d: TicketDraft): Promise<{ check: Check; order: Order }> {
  const branchId = await branchOf(db);
  const now = nowIso();
  const check = await db.insert("checks", {
    branchId, tableIds: d.mode === "dine_in" ? d.tableIds : [], status: "open", guests: d.guests, reservationId: null, customerId: d.customerId,
    discount: null, discountApprovedBy: null, discountReason: null, splitFrom: null, subtotal: 0, discountTotal: 0, service: 0, vat: 0, total: 0, paid: 0,
    receiptNo: null, etaUuid: null, openedAt: now, closedAt: null,
  });
  const order = await db.insert("orders", {
    branchId, number: await nextOrderNumber(db, branchId), mode: d.mode, source: d.source ?? "pos", status: "open", tableIds: d.mode === "dine_in" ? d.tableIds : [],
    checkId: check.id, customerId: d.customerId, guests: d.guests, openedBy: db.actorId, waiterId: null, note: "", delivery: d.mode === "delivery" ? d.delivery : null,
    deliveryStatus: d.mode === "delivery" ? "pending" : null, driverId: d.mode === "delivery" ? d.driverId ?? null : null, deliveryFee: d.mode === "delivery" ? d.deliveryFee : 0, openedAt: now, closedAt: null,
    pickupAt: d.pickup ? d.pickupAt : null, ...(d.channelId ? { channelId: d.channelId } : {}), ...(d.externalRef ? { externalRef: d.externalRef } : {}),
  });
  if (d.mode === "dine_in") for (const t of d.tableIds) await setTableStatus(db, t, "seated");
  await db.audit("check.open", "checks", check.id, { mode: d.mode, tables: d.tableIds });
  return { check, order };
}

export async function loadTicket(db: Db, checkId: string): Promise<Ticket | null> {
  const [check, orders] = await Promise.all([db.get("checks", checkId), db.list("orders", { where: { checkId }, orderBy: [{ field: "openedAt" }] })]);
  if (!check) return null;
  const items = orders.length ? await db.list("orderItems", { where: { orderId: orders.map((o) => o.id) }, orderBy: [{ field: "createdAt" }] }) : [];
  return { check, orders, items };
}

export const stationFor = (item: MenuItem, cats: MenuCategory[]) => item.stationId ?? cats.find((c) => c.id === item.categoryId)?.stationId ?? null;

export interface LineInput {
  item: MenuItem;
  modifiers: Modifier[];
  qty: number;
  notes: string;
  seat: number | null;
  course: number;
}

/** Adds a line (or bumps the qty of an identical unsent one). */
export async function addLine(db: Db, t: { orderId: string; checkId: string; items: OrderItem[]; tableId: string | null }, x: LineInput, cats: MenuCategory[], menu: MenuItem[] = []) {
  // the parts of a box first, then the chosen options; a part or an option that is a menu item carries its id (printed under the item, counted in its sales)
  const mods: OrderItemModifier[] = [...comboMods(x.item, menu), ...x.modifiers.map((m) => ({ groupId: m.groupId, modifierId: m.id, name: m.name, price: m.price, ...(m.menuItemId ? { itemId: m.menuItemId } : {}) }))];
  const probe = { itemId: x.item.id, modifiers: mods, notes: x.notes.trim(), seat: x.seat, course: x.course, status: "new" as const, discount: 0 };
  const same = t.items.find((i) => sameLine(i, probe));
  let row: OrderItem;
  // menu manager: price per channel (dine-in / takeaway / delivery / apps) and per branch
  const order = same ? null : await db.get("orders", t.orderId);
  // قنوات البيع: the order's channel picks the item's first, second or third price
  const ch = order ? channelFor((await db.list("settings"))[0], order) : null;
  const unitPrice = !order ? x.item.price : ch && ch.level !== 1 ? Math.max(0, levelPrice(x.item, ch.level) - (x.item.discount ?? 0)) : priceFor(x.item, channelOf(order.mode, order.source), order.branchId);
  if (same) row = await db.update("orderItems", same.id, { qty: same.qty + x.qty });
  else
    row = await db.insert("orderItems", {
      orderId: t.orderId, itemId: x.item.id, name: x.item.name, qty: x.qty, unitPrice, modifiers: mods, notes: probe.notes, seat: x.seat,
      course: x.course, status: "new", stationId: stationFor(x.item, cats), originTableId: t.tableId, discount: 0, firedAt: null, readyAt: null, servedAt: null,
      voidReason: null, voidedBy: null, createdBy: db.actorId,
    });
  await recomputeCheck(db, t.checkId);
  return row;
}

export async function setLineQty(db: Db, checkId: string, it: OrderItem, qty: number) {
  if (it.status !== "new") throw new Error("sent lines change through void");
  if (qty <= 0) await db.remove("orderItems", it.id);
  else await db.update("orderItems", it.id, { qty, discount: Math.min(it.discount, it.unitPrice * qty) });
  await recomputeCheck(db, checkId);
}

/** A line not sent yet, edited from the options sheet: its options, qty, notes, seat and course change in place. */
export async function replaceLine(db: Db, checkId: string, it: OrderItem, x: Omit<LineInput, "item"> & { item: MenuItem }, menu: MenuItem[] = []) {
  if (it.status !== "new") throw new Error("sent lines change through void");
  const mods: OrderItemModifier[] = [...comboMods(x.item, menu), ...x.modifiers.map((m) => ({ groupId: m.groupId, modifierId: m.id, name: m.name, price: m.price, ...(m.menuItemId ? { itemId: m.menuItemId } : {}) }))];
  const unit = it.unitPrice + mods.reduce((a, m) => a + m.price, 0);
  await db.update("orderItems", it.id, { modifiers: mods, qty: x.qty, notes: x.notes.trim(), seat: x.seat, course: x.course, discount: Math.min(it.discount, unit * x.qty) });
  await recomputeCheck(db, checkId);
}

export async function updateLine(db: Db, checkId: string, it: OrderItem, patch: Partial<Pick<OrderItem, "notes" | "seat" | "course" | "discount">>) {
  await db.update("orderItems", it.id, patch);
  await recomputeCheck(db, checkId);
}

/** Before the kitchen saw it: just remove. After: mark void with a reason (needs approval upstream). */
export async function voidLine(db: Db, checkId: string, it: OrderItem, reason: string, approvedBy: string | null, waste = true) {
  if (it.status === "new") {
    await db.remove("orderItems", it.id);
  } else {
    await db.update("orderItems", it.id, { status: "void", voidReason: reason, voidedBy: approvedBy ?? db.actorId });
    await db.audit("order.void", "orderItems", it.id, { item: it.name.en, qty: it.qty, reason, waste }, approvedBy);
    // inventory: wasted = its cost moves from cost of sales to waste; not wasted = the stock comes back
    await onLineVoided(db, { ...it, voidReason: reason }, { waste });
  }
  await recomputeCheck(db, checkId);
}

/**
 * الوقت المتوقع لتجهيز الأوردر (Saqr 2026-11-26, both kitchen modes): its place among the orders still cooking in the
 * branch (fired in the last 3 hours and not ready), plus one minute per distinct category. Never throws (null).
 */
export async function kitchenEstimate(db: Db, branchId: string, lines: Pick<OrderItem, "orderId" | "itemId">[], at = nowIso()): Promise<{ minutes: number; kitchenPrint: boolean } | null> {
  try {
    const [s] = await db.list("mfgSettings");
    const setup = printOf(listsOf(s), branchId);
    const since = new Date(Date.parse(at) - 3 * 3600_000).toISOString();
    // lines waiting in «مراجعة» are not cooking any more
    const cooking = (await db.list("orderItems", { where: { status: ["sent", "preparing"] }, gte: { firedAt: since } })).filter((i) => !(i.reviewAt && !i.reviewResult));
    const otherIds = [...new Set(cooking.map((i) => i.orderId).filter((id) => !lines.some((l) => l.orderId === id)))];
    const others = otherIds.length ? (await db.list("orders", { where: { id: otherIds } })).filter((o) => o.branchId === branchId).length : 0;
    const ids = [...new Set(lines.map((l) => l.itemId))];
    const menu = ids.length ? await db.list("menuItems", { where: { id: ids } }) : [];
    const cats = new Set(menu.map((m) => m.categoryId ?? m.id)).size;
    return { minutes: orderMinutes(others + 1, cats, kitchenTimeOf(setup.kitchenTime)), kitchenPrint: !!setup.kitchenPrint };
  } catch {
    return null;
  }
}

/** the time the sent lines are due (stored in both modes; only the printers mode marks them ready by itself) */
async function kitchenDueAt(db: Db, t: Ticket, lines: OrderItem[], at: string): Promise<string | null> {
  const e = await kitchenEstimate(db, t.check.branchId, lines, at);
  return e ? new Date(Date.parse(at) + e.minutes * 60_000).toISOString() : null;
}

/** Fires every sendable line (course 1 + fired courses), or one held course. Kitchen displays pick them up live. */
export async function sendToKitchen(db: Db, t: Ticket, course?: number): Promise<number> {
  const list = course == null ? sendableItems(t.items) : t.items.filter((i) => i.status === "new" && i.course === course);
  const at = nowIso();
  const dueAt = list.length ? await kitchenDueAt(db, t, list, at) : null;
  // one round trip for all of them, not one per line (Saqr 2026-11-25: faster cashier)
  await Promise.all(list.map((i) => db.update("orderItems", i.id, { status: "sent", firedAt: at, ...(dueAt ? { dueAt } : {}) })));
  if (list.length) {
    const orderIds = new Set(list.map((i) => i.orderId));
    await Promise.all([
      ...t.orders.filter((o) => orderIds.has(o.id) && (o.status === "open" || o.status === "ready" || o.status === "served")).map((o) => db.update("orders", o.id, { status: "sent" })),
      ...t.check.tableIds.map((tid) => setTableStatus(db, tid, "ordered")),
    ]);
    await db.audit(course == null ? "order.send" : "order.fire_course", "checks", t.check.id, { items: list.length, course: course ?? null });
    // inventory: deduct recipes at send (never throws; see src/modules/inventory/deduct.ts)
    await deductForItems(db, list, { trigger: "send", branchId: t.check.branchId });
  }
  return list.length;
}

/** إعادة الإرسال للمطبخ (Saqr 2026-11-25): what already went goes again (the kitchen ticket prints again); no stock moves twice */
export async function resendToKitchen(db: Db, t: Ticket): Promise<number> {
  const list = t.items.filter((i) => i.status !== "void" && i.status !== "new" && i.firedAt);
  const at = nowIso();
  await Promise.all(list.map((i) => db.update("orderItems", i.id, { firedAt: at })));
  if (list.length) await db.audit("order.resend", "checks", t.check.id, { items: list.length });
  return list.length;
}

export async function setBillDiscount(db: Db, checkId: string, d: Discount | null, reason: string | null, approvedBy: string | null) {
  await db.update("checks", checkId, { discount: d, discountReason: d ? reason : null, discountApprovedBy: d ? approvedBy : null });
  await db.audit(d ? "check.discount" : "check.discount_removed", "checks", checkId, { discount: d, reason }, approvedBy);
  return recomputeCheck(db, checkId);
}

export async function setLineDiscount(db: Db, checkId: string, it: OrderItem, units: number, reason: string, approvedBy: string | null) {
  await db.update("orderItems", it.id, { discount: units });
  await db.audit("item.discount", "orderItems", it.id, { units, reason }, approvedBy);
  return recomputeCheck(db, checkId);
}

/** First order of a check, creating one when the check has none (e.g. a fresh split). */
async function orderFor(db: Db, check: Check, like: Order) {
  const [o] = await db.list("orders", { where: { checkId: check.id }, orderBy: [{ field: "openedAt" }], limit: 1 });
  if (o) return o;
  return db.insert("orders", {
    ...stripRow(like), number: await nextOrderNumber(db, like.branchId), checkId: check.id, tableIds: check.tableIds, status: "open", openedAt: nowIso(), closedAt: null, openedBy: db.actorId,
  });
}

const stripRow = <T extends { id: string; createdAt: string; updatedAt: string; restaurantId: string }>(r: T) => {
  const { id: _i, createdAt: _c, updatedAt: _u, restaurantId: _r, ...rest } = r;
  return rest;
};

/** Moves lines (optionally part of a line's qty) onto another check. */
export async function moveItems(db: Db, from: Ticket, to: Check, moves: { itemId: string; qty: number }[]) {
  const target = await orderFor(db, to, from.orders[0]);
  for (const mv of moves) {
    const it = from.items.find((i) => i.id === mv.itemId);
    if (!it || mv.qty <= 0) continue;
    if (mv.qty >= it.qty) await db.update("orderItems", it.id, { orderId: target.id });
    else {
      const share = Math.round((it.discount * mv.qty) / it.qty);
      await db.update("orderItems", it.id, { qty: it.qty - mv.qty, discount: it.discount - share });
      await db.insert("orderItems", { ...stripRow(it), orderId: target.id, qty: mv.qty, discount: share });
    }
  }
  await recomputeCheck(db, from.check.id);
  await recomputeCheck(db, to.id);
}

/** Split: each group becomes a new check (same mode/table), the rest stays. */
export async function splitIntoChecks(db: Db, t: Ticket, groups: { itemId: string; qty: number }[][]): Promise<Check[]> {
  const out: Check[] = [];
  for (const g of groups) {
    if (!g.length) continue;
    const c = await db.insert("checks", {
      ...stripRow(t.check), status: "open", discount: t.check.discount, discountApprovedBy: t.check.discountApprovedBy, discountReason: t.check.discountReason ?? null,
      splitFrom: t.check.id, subtotal: 0, discountTotal: 0, service: 0, vat: 0, total: 0, paid: 0, receiptNo: null, etaUuid: null, openedAt: nowIso(), closedAt: null,
    });
    const fresh = (await loadTicket(db, t.check.id))!;
    await moveItems(db, fresh, c, g);
    out.push(c);
  }
  await db.audit("check.split", "checks", t.check.id, { into: out.map((c) => c.id) });
  return out;
}

/** Merge `from` into `into`: orders move, tables join, `from` is voided. */
export async function mergeChecks(db: Db, into: Check, from: Check) {
  const orders = await db.list("orders", { where: { checkId: from.id } });
  const tables = [...new Set([...into.tableIds, ...from.tableIds])];
  for (const o of orders) await db.update("orders", o.id, { checkId: into.id, ...(o.mode === "dine_in" && !o.tableIds.length ? { tableIds: from.tableIds } : {}) });
  // tenders already taken on the merged-away check follow it
  const pays = await db.list("payments", { where: { checkId: from.id } });
  for (const p of pays) await db.update("payments", p.id, { checkId: into.id });
  const paid = (await db.list("payments", { where: { checkId: into.id, status: "captured" } })).reduce((a, p) => a + p.amount, 0);
  await db.update("checks", into.id, { tableIds: tables, guests: into.guests + from.guests, paid });
  // merged-away checks are void with no tables (same convention as the floor)
  await db.update("checks", from.id, { status: "void", tableIds: [], paid: 0, closedAt: nowIso() });
  await recomputeCheck(db, into.id);
  await db.audit("check.merge", "checks", into.id, { from: from.id });
}

/** Move a whole check to another table. */
export async function moveCheckToTable(db: Db, t: Ticket, tableId: string) {
  const old = t.check.tableIds;
  await db.update("checks", t.check.id, { tableIds: [tableId] });
  for (const o of t.orders) await db.update("orders", o.id, { tableIds: [tableId] });
  for (const tid of old) if (tid !== tableId) await setTableStatus(db, tid, "dirty");
  await setTableStatus(db, tableId, t.items.some((i) => i.status !== "new") ? "ordered" : "seated");
  await db.audit("check.transfer_table", "checks", t.check.id, { from: old, to: tableId });
}

export async function setTicketMeta(db: Db, t: Ticket, patch: { guests?: number; customerId?: string | null; delivery?: Order["delivery"]; deliveryFee?: number; note?: string; driverId?: string | null; externalRef?: string | null }) {
  if (patch.guests != null || patch.customerId !== undefined) await db.update("checks", t.check.id, { ...(patch.guests != null ? { guests: patch.guests } : {}), ...(patch.customerId !== undefined ? { customerId: patch.customerId } : {}) });
  for (const o of t.orders)
    await db.update("orders", o.id, {
      ...(patch.guests != null ? { guests: patch.guests } : {}),
      ...(patch.customerId !== undefined ? { customerId: patch.customerId } : {}),
      ...(patch.delivery !== undefined ? { delivery: patch.delivery } : {}),
      ...(patch.deliveryFee != null ? { deliveryFee: patch.deliveryFee } : {}),
      ...(patch.note != null ? { note: patch.note } : {}),
      ...(patch.driverId !== undefined ? { driverId: patch.driverId } : {}),
      ...(patch.externalRef !== undefined ? { externalRef: patch.externalRef } : {}),
    });
  await recomputeCheck(db, t.check.id);
}

/**
 * تحويل الطلب من قناة بيع لتانية (Saqr 2026-11-25): the order takes the channel's type, and every line not voided takes
 * the channel's price. What belongs to the old type goes (a table off a non dine-in order, the address off a non delivery
 * one, the app code off a non app one).
 */
export async function changeChannel(db: Db, t: Ticket, ch: { id: string; kind: "dine_in" | "takeaway" | "delivery" | "aggregator"; level: 1 | 2 | 3 }, menu: MenuItem[]) {
  const mode: OrderMode = ch.kind === "aggregator" ? "takeaway" : ch.kind;
  const source: OrderSource | undefined = ch.kind === "aggregator" ? "aggregator" : undefined;
  for (const o of t.orders) {
    await db.update("orders", o.id, {
      mode, channelId: ch.id, pickupAt: null,
      ...(source ? { source } : o.source === "aggregator" ? { source: "pos" as OrderSource } : {}),
      ...(mode !== "dine_in" ? { tableIds: [] } : {}),
      ...(mode !== "delivery" ? { delivery: null, deliveryFee: 0, deliveryStatus: null, driverId: null } : { deliveryStatus: o.deliveryStatus ?? "pending" }),
      ...(ch.kind !== "aggregator" ? { externalRef: null } : {}),
    });
    const next = { ...o, mode, channelId: ch.id, source: source ?? (o.source === "aggregator" ? "pos" : o.source) } as Order;
    for (const i of t.items.filter((x) => x.orderId === o.id && x.status !== "void")) {
      const item = menu.find((m) => m.id === i.itemId);
      if (!item) continue;
      const unitPrice = ch.level !== 1 ? Math.max(0, levelPrice(item, ch.level) - (item.discount ?? 0)) : priceFor(item, channelOf(next.mode, next.source), next.branchId);
      if (unitPrice !== i.unitPrice) await db.update("orderItems", i.id, { unitPrice, discount: Math.min(i.discount, unitPrice * i.qty) });
    }
  }
  if (mode !== "dine_in" && t.check.tableIds.length) {
    await db.update("checks", t.check.id, { tableIds: [] });
    for (const tid of t.check.tableIds) await setTableStatus(db, tid, "free");
  }
  await db.audit("check.channel", "checks", t.check.id, { channel: ch.id });
  await recomputeCheck(db, t.check.id);
}

/** Cancel an empty (or never-sent) check. */
/** إلغاء طلب دخل المطبخ (Saqr 2026-11-26): every line the kitchen got is voided with the reason (cost goes to waste, audit log), then the check is cancelled */
export async function cancelSentTicket(db: Db, t: Ticket, reason: string, approvedBy: string | null, waste = true) {
  const sent = t.items.filter((i) => i.status !== "new" && i.status !== "void");
  for (const it of sent) await voidLine(db, t.check.id, it, reason, approvedBy, waste);
  await db.audit("order.cancel", "checks", t.check.id, { items: sent.length, reason, waste }, approvedBy);
  await discardTicket(db, { ...t, items: t.items.map((i) => (sent.some((x) => x.id === i.id) ? { ...i, status: "void" as const } : i)) });
}

export async function discardTicket(db: Db, t: Ticket) {
  if (t.items.some((i) => i.status !== "new" && i.status !== "void")) throw new Error("sent items need a void first");
  for (const i of t.items.filter((x) => x.status === "new")) await db.remove("orderItems", i.id); // voided lines stay as the record of what was cancelled
  for (const o of t.orders) await db.update("orders", o.id, { status: "void", closedAt: nowIso() });
  await db.update("checks", t.check.id, { status: "void", closedAt: nowIso() });
  for (const tid of t.check.tableIds) await setTableStatus(db, tid, "free");
}
