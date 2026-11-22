/**
 * What the ملخص tabs share (2026-11-22: a summary tab in every main menu): periods, a donut chart, a figure list,
 * and the stock figures read from the warehouses.
 */
import { useMemo, type ReactNode } from "react";
import { motion } from "motion/react";
import type { MfgBatch } from "@/data/types";
import { formatMoney } from "@/lib/money";
import { BarList } from "@/modules/marketing/ui";
import { Card, CardHeader, useReduced, type BarDatum } from "@/ui";
import type { Cc } from "../useCc";

export type Span = "day" | "week" | "month";
export const SPAN_OPTIONS: { value: Span; label: string }[] = [
  { value: "day", label: "يومي" },
  { value: "week", label: "اسبوعي" },
  { value: "month", label: "شهري" },
];
export const dayOf = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
export const money = (u: number) => formatMoney(u, { lang: "ar", whole: true });

/** the periods of a chart: the last 14 days, 8 weeks or 6 months, oldest first */
export function periods(span: Span, now = new Date()): { key: string; label: string; from: string; to: string }[] {
  const out: { key: string; label: string; from: string; to: string }[] = [];
  if (span === "day")
    for (let i = 13; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
      out.push({ key: dayOf(d), label: `${d.getDate()}/${d.getMonth() + 1}`, from: dayOf(d), to: dayOf(d) });
    }
  else if (span === "week")
    for (let i = 7; i >= 0; i--) {
      const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i * 7);
      const start = new Date(end.getFullYear(), end.getMonth(), end.getDate() - 6);
      out.push({ key: dayOf(start), label: `${start.getDate()}/${start.getMonth() + 1}`, from: dayOf(start), to: dayOf(end) });
    }
  else
    for (let i = 5; i >= 0; i--) {
      const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 0);
      out.push({ key: dayOf(start), label: `${start.getMonth() + 1}/${start.getFullYear()}`, from: dayOf(start), to: dayOf(end) });
    }
  return out;
}

/** production per period: number of batches, with the production cost in the tip */
export function batchSeries(batches: MfgBatch[], span: Span, now = new Date()): BarDatum[] {
  return periods(span, now).map((p) => {
    const b = batches.filter((x) => x.day >= p.from && x.day <= p.to);
    return { key: p.key, label: p.label, value: b.length, tip: `${b.length} تشغيلة · ${money(b.reduce((a, x) => a + x.totalCost, 0))}` };
  });
}

const PALETTE = ["var(--sf-primary)", "var(--sf-brass)", "var(--sf-info)", "var(--sf-ok)", "var(--sf-warn)", "var(--sf-danger)", "var(--sf-faint)"];

/** a ring of shares with its legend; more than six slices fold into "أخرى" */
export function Donut({ rows, format, empty = "لا توجد بيانات بعد.", center }: { rows: { key: string; label: string; value: number }[]; format?: (v: number) => ReactNode; empty?: string; center?: ReactNode }) {
  const reduced = useReduced();
  const sorted = rows.filter((r) => r.value > 0).sort((a, b) => b.value - a.value);
  const slices = sorted.length > 7 ? [...sorted.slice(0, 6), { key: "other", label: "أخرى", value: sorted.slice(6).reduce((a, r) => a + r.value, 0) }] : sorted;
  const total = slices.reduce((a, r) => a + r.value, 0);
  if (!total) return <p className="text-[14px] text-muted">{empty}</p>;
  const R = 40, C = 2 * Math.PI * R;
  let start = 0;
  return (
    <div className="grid items-center gap-4 sm:grid-cols-[150px_minmax(0,1fr)]">
      <div className="relative mx-auto size-[150px]">
        <svg viewBox="0 0 100 100" className="size-full -rotate-90" role="img" aria-label="رسم دائري">
          <circle cx="50" cy="50" r={R} fill="none" stroke="var(--sf-surface-3, rgba(127,127,127,.15))" strokeWidth="14" />
          {slices.map((s, i) => {
            const len = (s.value / total) * C;
            const el = (
              <motion.circle key={s.key} cx="50" cy="50" r={R} fill="none" stroke={PALETTE[i % PALETTE.length]} strokeWidth="14"
                strokeDasharray={`${len} ${C - len}`} strokeDashoffset={-start}
                initial={reduced ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: reduced ? 0 : i * 0.05 }} />
            );
            start += len;
            return el;
          })}
        </svg>
        {center ? <div className="absolute inset-0 grid place-items-center text-center text-[13px] font-bold leading-tight">{center}</div> : null}
      </div>
      <ul className="grid gap-1.5 text-[13.5px]">
        {slices.map((s, i) => (
          <li key={s.key} className="flex items-center gap-2">
            <span className="size-2.5 shrink-0 rounded-full" style={{ background: PALETTE[i % PALETTE.length] }} />
            <span className="min-w-0 flex-1 truncate font-semibold text-ink-2">{s.label}</span>
            <span className="num font-semibold">{format ? format(s.value) : s.value}</span>
            <span className="num w-11 text-end text-[12px] text-muted">{Math.round((s.value / total) * 100)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** a card with a title and a bar list (or a line saying there is nothing yet) */
export function ListCard({ icon, title, subtitle, rows, format, empty = "لا توجد بيانات بعد.", className }: { icon: ReactNode; title: string; subtitle?: string; rows: { key: string; label: ReactNode; value: number; tone?: string }[]; format?: (v: number) => ReactNode; empty?: string; className?: string }) {
  return (
    <Card className={className}>
      <CardHeader icon={icon} title={title} subtitle={subtitle} />
      <div className="px-5 pb-5">{rows.length ? <BarList rows={rows} format={format} /> : <p className="text-[14px] text-muted">{empty}</p>}</div>
    </Card>
  );
}

/** a card holding a donut */
export function DonutCard({ icon, title, subtitle, ...rest }: { icon: ReactNode; title: string; subtitle?: string } & Parameters<typeof Donut>[0]) {
  return (
    <Card>
      <CardHeader icon={icon} title={title} subtitle={subtitle} />
      <div className="px-5 pb-5"><Donut {...rest} /></div>
    </Card>
  );
}

/** the stock figures: value on hand per warehouse, per branch, per raw category and per item; items under their reorder point */
export function useStockFigures(cc: Cc) {
  return useMemo(() => {
    const byLoc = new Map<string, number>();
    const byItem = new Map<string, number>();
    const qtyByItem = new Map<string, number>();
    for (const l of cc.levels) {
      byLoc.set(l.locationId, (byLoc.get(l.locationId) ?? 0) + l.value);
      byItem.set(l.itemId, (byItem.get(l.itemId) ?? 0) + l.value);
      qtyByItem.set(l.itemId, (qtyByItem.get(l.itemId) ?? 0) + l.qty);
    }
    const total = [...byLoc.values()].reduce((a, v) => a + v, 0);
    const locName = (id: string) => cc.locations.find((l) => l.id === id)?.name.ar ?? "—";
    const byBranch = new Map<string, number>();
    for (const [loc, v] of byLoc) {
      const b = cc.locations.find((l) => l.id === loc)?.branchId ?? "";
      byBranch.set(b, (byBranch.get(b) ?? 0) + v);
    }
    const rawValue = cc.raws.reduce((a, i) => a + (byItem.get(i.id) ?? 0), 0);
    const madeValue = cc.made.reduce((a, i) => a + (byItem.get(i.id) ?? 0), 0);
    const low = cc.all.filter((i) => i.active && (i.levels?.min ?? 0) > 0 && (qtyByItem.get(i.id) ?? 0) < i.levels.min);
    const empty = cc.raws.filter((i) => i.active && (qtyByItem.get(i.id) ?? 0) <= 0).length;
    return {
      total,
      rawValue,
      madeValue,
      low,
      empty,
      byLoc: [...byLoc.entries()].filter(([, v]) => v > 0).map(([id, v]) => ({ key: id, label: locName(id), value: v })),
      byBranch: [...byBranch.entries()].filter(([, v]) => v > 0).map(([id, v]) => ({ key: id || "none", label: cc.branchName(id), value: v })),
      topItems: [...byItem.entries()].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([id, v]) => ({ key: id, label: cc.itemById.get(id)?.name.ar ?? "—", value: v })),
      qtyByItem,
    };
  }, [cc]);
}
