/**
 * شاشة الكاشير (Saqr 2026-11-26): small chips next to «المغلقة», one per order in the kitchen now, with its number and
 * the time left (or جاهز), coloured by whether its check is still open or already paid. An open one opens on tap.
 */
import { useEffect, useMemo, useState } from "react";
import { useSession } from "@/auth/session";
import { useLive } from "@/data/hooks";
import type { Check } from "@/data/types";
import { cn } from "@/lib/cn";

/** a ready order stays on the strip this long */
const READY_SHOWN_MS = 15 * 60_000;

export function KitchenStrip({ onOpen }: { onOpen: (c: Check) => void }) {
  const { branchId } = useSession();
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(t);
  }, []);
  const since = useMemo(() => new Date(Date.now() - 3 * 3600_000).toISOString(), [Math.floor(now / 600_000)]); // eslint-disable-line react-hooks/exhaustive-deps
  const items = useLive("orderItems", { where: { status: ["sent", "preparing", "ready"] }, gte: { firedAt: since } }).data;
  const orderIds = useMemo(() => [...new Set(items.map((i) => i.orderId))], [items]);
  const orders = useLive("orders", { where: { id: orderIds } }, { enabled: orderIds.length > 0 }).data;
  const checkIds = useMemo(() => [...new Set(orders.map((o) => o.checkId).filter((x): x is string => !!x))], [orders]);
  const checks = useLive("checks", { where: { id: checkIds } }, { enabled: checkIds.length > 0 }).data;

  const chips = useMemo(() => {
    const out: { id: string; number: number | string; ready: boolean; left: number | null; check: Check | null; firedAt: string }[] = [];
    for (const o of orders) {
      if (branchId && o.branchId !== branchId) continue;
      const its = items.filter((i) => i.orderId === o.id);
      if (!its.length) continue;
      const ready = its.every((i) => i.status === "ready");
      if (ready && now - Math.max(...its.map((i) => Date.parse(i.readyAt ?? i.updatedAt))) > READY_SHOWN_MS) continue;
      const dues = its.filter((i) => i.status !== "ready" && i.dueAt).map((i) => Date.parse(i.dueAt!));
      out.push({ id: o.id, number: o.number ?? "—", ready, left: ready || !dues.length ? null : Math.max(...dues) - now, check: checks.find((c) => c.id === o.checkId) ?? null, firedAt: its.reduce((m, i) => (i.firedAt && i.firedAt < m ? i.firedAt : m), its[0].firedAt ?? o.openedAt) });
    }
    return out.sort((a, b) => Number(a.ready) - Number(b.ready) || a.firedAt.localeCompare(b.firedAt));
  }, [orders, items, checks, branchId, now]);

  if (!chips.length) return null;
  return (
    <div className="flex min-w-0 max-w-full items-center gap-1.5 overflow-x-auto thin-scrollbar" aria-label="الطلبات في المطبخ" data-kitchen-strip>
      {chips.map((c) => {
        const open = c.check ? c.check.status !== "paid" && c.check.status !== "void" : false;
        const late = c.left != null && c.left < 0;
        const mins = c.left != null ? Math.ceil(Math.abs(c.left) / 60_000) : null;
        return (
          <button key={c.id} type="button" disabled={!open} onClick={() => c.check && open && onOpen(c.check)}
            title={open ? "مفتوح" : "مغلق (اتدفع)"}
            className={cn(
              "flex shrink-0 items-center gap-1 whitespace-nowrap rounded-lg border px-2 py-1 text-[12px] font-bold",
              open ? "border-brass/60 bg-brass-soft text-brass-text hover:brightness-95" : "border-line bg-surface-2 text-ink-2",
              c.ready && "border-ok bg-ok/15 text-ok",
              late && "border-danger bg-danger-soft text-danger",
            )}>
            <span className="num">#{c.number}</span>
            <span className="opacity-80">·</span>
            <span className="num">{c.ready ? "جاهز" : mins == null ? "بيتحضر" : late ? `متأخر ${mins}د` : `${mins}د`}</span>
            <span className={cn("size-1.5 rounded-full", open ? "bg-brass" : "bg-muted")} aria-hidden />
          </button>
        );
      })}
    </div>
  );
}
