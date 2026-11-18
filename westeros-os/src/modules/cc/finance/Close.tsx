/** الإقفال: قائمة مراجعة كل شهر، إقفاله وفتحه وقفله نهائيا، وقيد إقفال السنة. */
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, CircleAlert, Lock, LockOpen, ShieldCheck, TriangleAlert, XCircle } from "lucide-react";
import { useDb, useLive } from "@/data/hooks";
import type { FinEntry, FinPeriodStatus } from "@/data/financeTypes";
import { cn } from "@/lib/cn";
import { Badge, Button, Card, Select, useToast, type Tone } from "@/ui";
import { listsOf } from "../lib";
import { closeYear, monthChecks, monthsOfYear, PERIOD_LABEL, periodProblem, reopenYear, setPeriod, yearPlan, type CloseData } from "./close";
import { entryRef, fiscalYear, monthOf, periodStatus } from "./journal";
import { EntryView } from "./Journal";
import { useActor, useFinPerms } from "./perms";
import { incomeStatement } from "./statements";
import { monthEnd } from "./treasury";
import { Confirm, fmt, today, Toolbar } from "./ui";
import { useFinance } from "./useFinance";

const err = (e: unknown) => String((e as Error)?.message ?? e);
const label = (m: string) => m.split("-").reverse().join("/");
const TONE: Record<FinPeriodStatus, Tone> = { open: "ok", closed: "brass", locked: "neutral" };
const MONTHS = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];
const ACTION: Record<FinPeriodStatus, { title: string; text: string; button: string }> = {
  closed: { title: "إقفال الشهر", text: "بعد الإقفال لا يقبل الشهر قيود جديدة ولا تعديل، وأي حركة مخزنية متأخرة تتسجل في أول يوم مفتوح. تقدر تفتحه تاني لو احتجت.", button: "اقفل الشهر" },
  open: { title: "فتح الشهر", text: "الشهر يرجع يقبل قيود وتعديلات. اقفله تاني بعد ما تخلص.", button: "افتح الشهر" },
  locked: { title: "قفل نهائي", text: "القفل النهائي لا يفكه إلا صاحب صلاحية إقفال السنة. استخدمه بعد مراجعة المحاسب.", button: "اقفل نهائيا" },
};

export default function Close() {
  const fin = useFinance();
  const db = useDb();
  const { toast } = useToast();
  const perms = useFinPerms();
  const actor = useActor();
  const docs = useLive("finDocs").data;
  const moves = useLive("stockMoves").data;
  const itemRows = useLive("stockItems").data;
  const locRows = useLive("storageLocations").data;
  const lists = listsOf(useLive("mfgSettings").data[0]);
  const s = fin.settings;
  const thisYear = fiscalYear(today(), s.yearStartMonth);
  const years = useMemo(() => [...new Set([thisYear, ...fin.entries.map((e) => fiscalYear(e.date, s.yearStartMonth))])].sort((a, b) => b - a), [fin.entries, s.yearStartMonth, thisYear]);
  const [year, setYear] = useState(thisYear);
  const months = useMemo(() => monthsOfYear(year, s.yearStartMonth), [year, s.yearStartMonth]);
  const [month, setMonth] = useState(() => (months.includes(monthOf(today())) ? monthOf(today()) : months[0]));
  const sel = months.includes(month) ? month : months[0];
  const [ask, setAsk] = useState<FinPeriodStatus | "year" | "reopen" | null>(null);
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState<FinEntry | null>(null);

  const data: CloseData = useMemo(() => ({ accounts: fin.accounts, entries: fin.entries, settings: s, docs, moves, items: new Map(itemRows.map((i) => [i.id, i])), locations: new Map(locRows.map((l) => [l.id, l])), lists, branches: fin.branches }), [fin.accounts, fin.entries, s, docs, moves, itemRows, locRows, lists, fin.branches]);
  const checks = useMemo(() => monthChecks(data, sel), [data, sel]);
  const status = periodStatus(s, `${sel}-01`);
  const cards = useMemo(() => months.map((m) => {
    const r = incomeStatement(fin.accounts, fin.entries, [{ from: `${m}-01`, to: monthEnd(m) }], 1);
    return { m, status: periodStatus(s, `${m}-01`), count: fin.entries.filter((e) => e.status === "posted" && monthOf(e.date) === m).length, sales: r.revenue[0], net: r.net[0] };
  }), [months, fin.accounts, fin.entries, s]);
  const plan = useMemo(() => yearPlan({ accounts: fin.accounts, entries: fin.entries, settings: s }, year, today()), [fin.accounts, fin.entries, s, year]);
  const can = (to: FinPeriodStatus) => periodProblem({ settings: s, checks, canMonth: perms.has("close.month"), canYear: perms.has("close.year") }, sel, to);
  const failed = checks.filter((c) => !c.ok);

  const run = async () => {
    if (!ask) return;
    setBusy(true);
    try {
      if (ask === "year") { const e = await closeYear(db, year, actor, today()); toast({ tone: "success", title: `تم إقفال السنة ${year}`, description: `قيد الإقفال ${entryRef(e)}` }); }
      else if (ask === "reopen") { await reopenYear(db, year, actor); toast({ tone: "success", title: `تم فتح السنة ${year}` }); }
      else { const p = can(ask); if (p) throw new Error(p); await setPeriod(db, sel, ask); toast({ tone: "success", title: `شهر ${label(sel)}: ${PERIOD_LABEL[ask]}` }); }
      setAsk(null);
    } catch (e) { toast({ tone: "error", title: "تعذر", description: err(e), duration: 9000 }); } finally { setBusy(false); }
  };

  return (
    <div className="grid gap-4">
      <Toolbar>
        <Select label="السنة المالية" className="w-44" value={String(year)} onChange={(e) => setYear(Number(e.target.value))} options={years.map((y) => ({ value: String(y), label: s.yearStartMonth === 1 ? String(y) : `${y}/${y + 1}` }))} />
      </Toolbar>
      <p className="text-[13.5px] text-muted">اختار الشهر، راجع القائمة، ثم اقفله. الشهر المقفول لا يقبل قيود، فأرقام تقاريره تثبت.</p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6" role="radiogroup" aria-label="شهور السنة">
        {cards.map((c) => (
          <button key={c.m} type="button" role="radio" aria-checked={c.m === sel} onClick={() => setMonth(c.m)} className={cn("grid gap-1 rounded-2xl border p-3 text-start transition-colors", c.m === sel ? "border-primary bg-primary/10" : "border-line hover:bg-surface-2")}>
            <span className="flex items-center justify-between gap-2"><span className="font-bold">{MONTHS[Number(c.m.slice(5)) - 1]}</span><Badge size="sm" tone={TONE[c.status]} icon={c.status === "open" ? undefined : <Lock />}>{PERIOD_LABEL[c.status]}</Badge></span>
            <span className="num text-[12px] text-muted" dir="ltr">{label(c.m)}</span>
            <span className="text-[12.5px] text-muted">{c.count ? `${c.count} قيد` : "بدون قيود"}</span>
            {perms.has("profit") && c.count ? <span className={cn("num text-[13px] font-semibold", c.net < 0 && "text-danger")} dir="ltr">{fmt(c.net)}</span> : null}
          </button>
        ))}
      </div>

      <Card className="grid gap-3 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="min-w-0 flex-1 text-[16px] font-bold">قائمة مراجعة {MONTHS[Number(sel.slice(5)) - 1]} <span className="num text-muted" dir="ltr">{label(sel)}</span></h2>
          <Badge tone={TONE[status]}>{PERIOD_LABEL[status]}</Badge>
        </div>
        <div className="grid">
          {checks.map((c) => (
            <div key={c.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line/60 py-2.5 text-[14px] first:border-t-0">
              {c.ok ? <CheckCircle2 className="size-5 shrink-0 text-ok" /> : c.required ? <XCircle className="size-5 shrink-0 text-danger" /> : <TriangleAlert className="size-5 shrink-0 text-brass" />}
              <span className="min-w-0 flex-1"><span className="font-semibold">{c.label}</span>{c.ok ? null : <span className="block text-[13px] text-muted">{c.detail}{c.required ? "" : " (تنبيه لا يمنع الإقفال)"}</span>}</span>
              {c.ok ? null : <Link to={c.to} className="text-[13.5px] font-semibold text-primary hover:underline">افتح</Link>}
            </div>
          ))}
        </div>
        {perms.has("close.month") ? (
          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line/60 pt-3">
            {status === "open" && can("closed") ? <span className="me-auto flex items-center gap-1.5 text-[13px] text-danger"><CircleAlert className="size-4" />{can("closed")}</span> : null}
            {status === "open" ? <Button icon={<Lock />} disabled={!!can("closed")} onClick={() => setAsk("closed")}>إقفال الشهر</Button> : null}
            {status === "closed" ? <><Button variant="outline" icon={<LockOpen />} disabled={!!can("open")} title={can("open")} onClick={() => setAsk("open")}>فتح الشهر</Button>{perms.has("close.year") ? <Button variant="secondary" icon={<ShieldCheck />} onClick={() => setAsk("locked")}>قفل نهائي</Button> : null}</> : null}
            {status === "locked" && perms.has("close.year") && !plan.closed ? <Button variant="outline" icon={<LockOpen />} onClick={() => setAsk("closed")}>فك القفل النهائي</Button> : null}
            {status === "locked" && plan.closed ? <span className="text-[13px] text-muted">الشهر ضمن سنة مقفولة. افتح السنة أولا.</span> : null}
          </div>
        ) : null}
      </Card>

      <Card className="grid gap-3 p-4">
        <h2 className="text-[16px] font-bold">إقفال السنة المالية {s.yearStartMonth === 1 ? year : `${year}/${year + 1}`}</h2>
        <p className="text-[13.5px] text-muted">قيد واحد في آخر يوم من السنة يصفر حسابات الإيرادات والتكلفة والمصروفات، ويرحل الصافي إلى أرباح العام. أرباح العام السابق تنتقل قبلها إلى الأرباح المرحلة. قوائم الدخل تفضل تعرض السنة كما كانت.</p>
        {plan.closed ? (
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-line p-3 text-[14px]">
            <CheckCircle2 className="size-5 text-ok" /><span className="min-w-0 flex-1">السنة مقفولة بالقيد <button type="button" className="num font-semibold text-primary hover:underline" dir="ltr" onClick={() => setView(plan.closed)}>{entryRef(plan.closed)}</button></span>
            {perms.has("close.year") ? <Button variant="outline" icon={<LockOpen />} onClick={() => setAsk("reopen")}>فتح السنة</Button> : null}
          </div>
        ) : (
          <>
            {perms.has("profit") ? (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 max-sm:[&>*:last-child:nth-child(odd)]:col-span-2">
                {[[plan.profit >= 0 ? "صافي ربح السنة" : "صافي خسارة السنة", Math.abs(plan.profit)], ["أرباح العام السابق تنتقل للمرحلة", plan.carried], ["سطور قيد الإقفال", null]].map(([l, v]) => <div key={l as string} className="rounded-xl border border-line p-3"><div className="text-[12.5px] text-muted">{l}</div><div className="num text-[18px] font-bold" dir="ltr">{v == null ? plan.lines.length : fmt(v as number)}</div></div>)}
              </div>
            ) : null}
            {plan.problem ? <p className="rounded-xl border border-line px-3 py-2.5 text-[14px] text-muted">{plan.problem}</p> : null}
            {perms.has("close.year") ? <div className="flex justify-end"><Button icon={<ShieldCheck />} disabled={!!plan.problem} onClick={() => setAsk("year")}>إقفال السنة</Button></div> : null}
          </>
        )}
      </Card>

      {ask === "year" || ask === "reopen" ? (
        <Confirm open onClose={() => setAsk(null)} onConfirm={run} loading={busy} title={ask === "year" ? `إقفال السنة ${year}` : `فتح السنة ${year}`} confirmLabel={ask === "year" ? "اقفل السنة" : "افتح السنة"}
          description={ask === "year" ? `يترحل قيد الإقفال بتاريخ ${plan.to.split("-").reverse().join("/")} وتتقفل شهور السنة نهائيا. تقدر تفتح السنة لاحقا من نفس الشاشة.` : "يتعكس قيد الإقفال وترجع شهور السنة مقفولة (غير نهائي)، فتقدر تفتح الشهر اللي تحتاجه."} />
      ) : ask ? (
        <Confirm open onClose={() => setAsk(null)} onConfirm={run} loading={busy} title={status === "locked" ? "فك القفل النهائي" : ACTION[ask].title} confirmLabel={status === "locked" ? "فك القفل" : ACTION[ask].button}
          description={status === "locked" ? "الشهر يرجع مقفول عادي، وتقدر تفتحه بعدها." : ACTION[ask].text}>
          {ask === "closed" && status === "open" && failed.length ? <ul className="mt-2 grid gap-1 text-[13.5px] text-muted">{failed.map((c) => <li key={c.id}>• {c.label}: {c.detail}</li>)}</ul> : null}
        </Confirm>
      ) : null}
      {view ? <EntryView key={view.id} fin={fin} entry={fin.entries.find((x) => x.id === view.id) ?? view} onClose={() => setView(null)} onOpen={setView} /> : null}
    </div>
  );
}
