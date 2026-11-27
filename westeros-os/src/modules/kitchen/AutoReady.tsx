/**
 * Runs on every open screen of the restaurant (writing twice from two screens is harmless):
 *  - نظام طابعات المطبخ (Saqr 2026-11-26): a line whose time is up is marked ready by itself (the kitchen has no one
 *    tapping a screen).
 *  - شاشة المطبخ التفاعلية (Saqr 2026-11-27): a line still not ready `kitchenReviewMin` minutes after send goes to
 *    «مراجعة» (review.ts).
 * Only the lines of the signed-in branch's orders.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useSession } from "@/auth/session";
import { useDb, useLive } from "@/data/hooks";
import { listsOf } from "@/modules/cc/lib";
import { printOf } from "@/modules/cc/print/setup";
import { applyAction } from "./ops";
import { kitchenTimeOf } from "./autoTime";
import { dueForReview, reviewMinOf, sendToReview } from "./review";

export function useAutoReady() {
  const db = useDb();
  const { branchId } = useSession();
  const setup = printOf(listsOf(useLive("mfgSettings").data[0]), branchId);
  const auto = !!setup.kitchenPrint;
  const reviewMin = reviewMinOf(setup);
  const on = auto || reviewMin > 0;
  const all = useLive("orderItems", { where: { status: ["sent", "preparing"] } }, { enabled: on }).data;
  const allIds = useMemo(() => [...new Set(all.map((i) => i.orderId))], [all]);
  const orders = useLive("orders", { where: { id: allIds } }, { enabled: on && allIds.length > 0 }).data;
  const items = useMemo(() => {
    const mine = new Set(orders.filter((o) => !branchId || o.branchId === branchId).map((o) => o.id));
    return all.filter((i) => mine.has(i.orderId));
  }, [all, orders]);
  const done = useRef(new Set<string>());
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!on) return;
    const t = setInterval(() => setNow(Date.now()), 10_000);
    return () => clearInterval(t);
  }, [on]);
  useEffect(() => {
    if (!on) return;
    if (auto) {
      // lines sent before the time was stored (no due time) are due the usual order time after send
      const base = kitchenTimeOf(setup.kitchenTime).baseMin * 60_000;
      const dueOf = (i: (typeof items)[number]) => (i.dueAt ? Date.parse(i.dueAt) : Date.parse(i.firedAt ?? i.createdAt) + base);
      const due = items.filter((i) => dueOf(i) <= now && !done.current.has(i.id));
      if (!due.length) return;
      for (const i of due) done.current.add(i.id);
      void applyAction(db, due, "bump").catch(() => due.forEach((i) => done.current.delete(i.id)));
      return;
    }
    const late = dueForReview(items, reviewMin, now).filter((i) => !done.current.has(`r:${i.id}`));
    if (!late.length) return;
    for (const i of late) done.current.add(`r:${i.id}`);
    void sendToReview(db, late).catch(() => late.forEach((i) => done.current.delete(`r:${i.id}`)));
  }, [items, now, on, auto, reviewMin, db, setup.kitchenTime]);
}

export function AutoReady() {
  useAutoReady();
  return null;
}
