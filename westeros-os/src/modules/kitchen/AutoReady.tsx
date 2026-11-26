/**
 * نظام طابعات المطبخ (Saqr 2026-11-26): a line whose time is up is marked ready by itself, from any open screen of the
 * restaurant (the kitchen has no one tapping a screen). Writing twice from two screens is harmless.
 */
import { useEffect, useRef, useState } from "react";
import { useSession } from "@/auth/session";
import { useDb, useLive } from "@/data/hooks";
import { listsOf } from "@/modules/cc/lib";
import { printOf } from "@/modules/cc/print/setup";
import { applyAction } from "./ops";

export function useAutoReady() {
  const db = useDb();
  const { branchId } = useSession();
  const on = !!printOf(listsOf(useLive("mfgSettings").data[0]), branchId).kitchenPrint;
  const items = useLive("orderItems", { where: { status: ["sent", "preparing"] } }, { enabled: on }).data;
  const done = useRef(new Set<string>());
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!on) return;
    const t = setInterval(() => setNow(Date.now()), 10_000);
    return () => clearInterval(t);
  }, [on]);
  useEffect(() => {
    if (!on) return;
    const due = items.filter((i) => i.dueAt && Date.parse(i.dueAt) <= now && (i.status === "sent" || i.status === "preparing") && !done.current.has(i.id));
    if (!due.length) return;
    for (const i of due) done.current.add(i.id);
    void applyAction(db, due, "bump").catch(() => due.forEach((i) => done.current.delete(i.id)));
  }, [items, now, on, db]);
}

export function AutoReady() {
  useAutoReady();
  return null;
}
