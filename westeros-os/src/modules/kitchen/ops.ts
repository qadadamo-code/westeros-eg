/** Kitchen writes (KDS + waiter "mark served"). Pure rules live in kds.ts. */
import type { Db } from "@/data/hooks";
import type { OrderItem, OrderPriority } from "@/data/types";
import { nowIso } from "@/lib/time";
import { deriveOrderStatus, patchesFor, type KdsAction } from "./kds";

/** Apply a KDS action to some items; returns the ids that changed. Order statuses follow. */
export async function applyAction(db: Db, items: Pick<OrderItem, "id" | "status" | "firedAt" | "orderId">[], action: KdsAction): Promise<string[]> {
  const at = nowIso();
  const patches = patchesFor(items, action, at);
  if (!patches.length) return [];
  await Promise.all(patches.map((p) => db.update("orderItems", p.id, p.patch)));
  const orderIds = [...new Set(items.filter((i) => patches.some((p) => p.id === i.id)).map((i) => i.orderId))];
  await syncOrders(db, orderIds);
  if (action === "recall") void db.audit("kitchen.recall", "orderItems", null, { items: patches.map((p) => p.id) });
  return patches.map((p) => p.id);
}

/** Recompute order.status from its items (sent → ready → served); a served order whose check is paid is closed. */
export async function syncOrders(db: Db, orderIds: string[]) {
  if (!orderIds.length) return;
  const [orders, items] = await Promise.all([db.list("orders", { where: { id: orderIds } }), db.list("orderItems", { where: { orderId: orderIds } })]);
  const checkIds = [...new Set(orders.map((o) => o.checkId).filter((x): x is string => !!x))];
  const paid = new Set(checkIds.length ? (await db.list("checks", { where: { id: checkIds } })).filter((c) => c.status === "paid").map((c) => c.id) : []);
  await Promise.all(
    orders.map((o) => {
      let next = deriveOrderStatus(
        items.filter((i) => i.orderId === o.id),
        o.status,
      );
      if (next === "served" && o.checkId && paid.has(o.checkId)) next = "closed";
      return next !== o.status ? db.update("orders", o.id, next === "closed" ? { status: next, closedAt: nowIso() } : { status: next }) : null;
    }),
  );
}

/**
 * طلبات اندفعت وضلت شغالة (Saqr 2026-11-24): an order whose check is paid and that has nothing sent to the kitchen
 * still cooking is closed. Safe to run again.
 */
export async function closePaidOrders(db: Db, orders: { id: string; checkId: string | null; status: string; mode: string }[]): Promise<number> {
  const live = orders.filter((o) => o.checkId && o.status !== "closed" && o.status !== "void");
  if (!live.length) return 0;
  const checkIds = [...new Set(live.map((o) => o.checkId!))];
  const [checks, items] = await Promise.all([db.list("checks", { where: { id: checkIds } }), db.list("orderItems", { where: { orderId: live.map((o) => o.id) } })]);
  const paid = new Set(checks.filter((c) => c.status === "paid").map((c) => c.id));
  const done = live.filter((o) => paid.has(o.checkId!) && !items.some((i) => i.orderId === o.id && (i.status === "sent" || i.status === "preparing")));
  const at = nowIso();
  await Promise.all(done.map((o) => db.update("orders", o.id, { status: "closed", closedAt: at })));
  return done.length;
}

/** 86 / un-86: the item disappears from POS, waiter app and QR menu everywhere, live. */
export async function setAvailability(db: Db, menuItemId: string, available: boolean) {
  await db.update("menuItems", menuItemId, { available });
  void db.audit(available ? "menu.un86" : "menu.86", "menuItems", menuItemId, {});
}

export async function setPriority(db: Db, orderId: string, priority: OrderPriority) {
  await db.update("orders", orderId, { priority });
}
