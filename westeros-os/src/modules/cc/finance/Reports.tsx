/** التقارير المالية: every report under one roof, each with its period, branch, level, comparison, drill-down, Excel and print. */
import { useMemo, useState, type ReactNode } from "react";
import { Navigate, NavLink, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { CheckCircle2, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/cn";
import { Card, Input, Select, Switch } from "@/ui";
import { fmtDay } from "../lib";
import { ExportButton } from "../ui";
import { dayBefore, entryRef, statement } from "./journal";
import Ledger from "./Ledger";
import { useFinPerms } from "./perms";
import { balanceSheet, cashFlow, cashMovement, incomeStatement, type StRow } from "./statements";
import StockRecon from "./StockRecon";
import { moneyAccounts } from "./treasury";
import { isDebit, MAX_LEVEL } from "./tree";
import TrialBalance from "./TrialBalance";
import { Amount, BranchSelect, fmt, periodLabel, periodOf, PeriodPicker, PrintButton, printTable, today, type Period } from "./ui";
import { useFinance, type Fin } from "./useFinance";

export const REPORTS: { id: string; label: string; hint: string; profit?: boolean }[] = [
  { id: "income", label: "قائمة الدخل", hint: "إيرادات، تكلفة، مجمل ربح، مصروفات، صافي ربح", profit: true },
  { id: "balance", label: "المركز المالي", hint: "أصول والتزامات وحقوق ملكية في تاريخ", profit: true },
  { id: "cashflow", label: "التدفقات النقدية", hint: "تشغيلي واستثماري وتمويلي" },
  { id: "branches", label: "قائمة دخل الفروع", hint: "كل فرع في عمود والإجمالي", profit: true },
  { id: "centres", label: "تقرير مراكز التكلفة", hint: "إيرادات ومصروفات كل مركز", profit: true },
  { id: "trial", label: "ميزان المراجعة", hint: "بالأرصدة أو بالمجاميع على أي مستوى" },
  { id: "ledger", label: "كشف حساب", hint: "حركات حساب برصيد متحرك" },
  { id: "gl", label: "دفتر الأستاذ العام", hint: "كل الحسابات بحركاتها في فترة" },
  { id: "cash", label: "حركة الخزائن والبنوك", hint: "وارد ومنصرف ورصيد كل يوم" },
  { id: "stock", label: "مطابقة المخزون", hint: "المخازن ضد الدفتر وبضاعة بالطريق" },
];

export default function Reports() {
  const perms = useFinPerms();
  const list = REPORTS.filter((r) => !r.profit || perms.has("profit"));
  return (
    <div className="grid gap-4">
      <nav aria-label="التقارير" className="flex gap-1.5 overflow-x-auto pb-1 no-scrollbar">
        {list.map((r) => <NavLink key={r.id} to={`/finance/reports/${r.id}`} title={r.hint} className={({ isActive }) => cn("whitespace-nowrap rounded-full border px-3.5 py-1.5 text-[13.5px] font-semibold transition-colors", isActive ? "border-primary bg-primary/10 text-primary" : "border-line text-muted hover:bg-surface-2")}>{r.label}</NavLink>)}
      </nav>
      <Routes>
        <Route index element={<Navigate to={list[0]?.id ?? "trial"} replace />} />
        {perms.has("profit") ? <><Route path="income" element={<Income mode="period" />} /><Route path="balance" element={<Balance />} /><Route path="branches" element={<Income mode="branches" />} /><Route path="centres" element={<Income mode="centres" />} /></> : null}
        <Route path="cashflow" element={<CashFlow />} />
        <Route path="trial" element={<TrialBalance />} />
        <Route path="ledger" element={<Ledger />} />
        <Route path="gl" element={<GeneralLedger />} />
        <Route path="cash" element={<CashMovement />} />
        <Route path="stock" element={<StockRecon />} />
        <Route path="*" element={<Navigate to="/finance/reports" replace />} />
      </Routes>
    </div>
  );
}
/** old addresses keep working */
export function ReportRedirect({ to }: { to: string }) {
  const { search } = useLocation();
  return <Navigate to={`/finance/reports/${to}${search}`} replace />;
}

const shift = (day: string, years: number) => `${Number(day.slice(0, 4)) + years}${day.slice(4)}`;
/** the period just before, of the same length */
export function previousPeriod(p: { from: string | null; to: string | null }): { from: string | null; to: string | null } {
  if (!p.from || !p.to) return { from: null, to: null };
  const to = dayBefore(p.from);
  const len = Math.round((Date.parse(p.to) - Date.parse(p.from)) / 86_400_000);
  const d = new Date(Date.parse(to) - len * 86_400_000);
  return { from: d.toISOString().slice(0, 10), to };
}
const COMPARE = [{ value: "", label: "بدون مقارنة" }, { value: "prev", label: "الفترة السابقة" }, { value: "year", label: "نفس الفترة من السنة الماضية" }];
const levels = Array.from({ length: MAX_LEVEL - 1 }, (_, i) => ({ value: String(i + 2), label: `حتى المستوى ${i + 2}` }));
const pct = (v: number, base: number) => (base ? `${((v / base) * 100).toFixed(1)}%` : "");
const change = (now: number, was: number) => (was ? `${now >= was ? "+" : ""}${(((now - was) / Math.abs(was)) * 100).toFixed(1)}%` : now ? "جديد" : "");

/** The table every statement shares: headings, indented accounts, totals; a click on an account opens its statement. */
function StatementTable({ title, sub, cols, rows, extra, onOpen, file }: { title: string; sub: string; cols: string[]; rows: StRow[]; extra?: { head: string; cell: (r: StRow) => string }[]; onOpen?: (r: StRow, col: number) => void; file: string }) {
  const head = ["الحساب", ...cols, ...(extra ?? []).map((x) => x.head)];
  const text = (r: StRow) => (r.kind === "section" ? [] : r.values.map((v) => fmt(v)));
  return (
    <>
      <div className="flex flex-wrap items-center justify-end gap-2">
        <ExportButton file={file} head={["الكود", ...head]} rows={() => rows.map((r) => [r.code ?? "", r.label, ...(r.kind === "section" ? [] : r.values.map((v) => v / 100000)), ...(r.kind === "section" ? [] : (extra ?? []).map((x) => x.cell(r)))])} />
        <PrintButton onClick={() => printTable(title, sub, head, rows.map((r) => [{ text: r.label, bold: r.kind !== "account", indent: r.level }, ...(r.kind === "section" ? head.slice(1).map(() => "") : [...text(r).map((t) => ({ text: t, align: "end" as const, bold: r.kind === "total" })), ...(extra ?? []).map((x) => ({ text: x.cell(r), align: "end" as const }))])]))} />
      </div>
      <Card className="overflow-hidden">
        <div className="overflow-x-auto thin-scrollbar">
          <table className="w-full text-[14px]">
            <thead><tr className="text-[12.5px] text-muted">{head.map((h, i) => <th key={i} className={cn("border-b border-line px-3 py-2.5 font-semibold", i ? "text-end" : "text-start")}>{h}</th>)}</tr></thead>
            <tbody>
              {rows.map((r) => r.kind === "section" ? (
                <tr key={r.id} className="bg-surface-2"><td colSpan={head.length} className="px-3 py-2 text-[14.5px] font-bold text-primary">{r.label}</td></tr>
              ) : (
                <tr key={r.id} className={cn("border-t border-line/60", r.kind === "total" && "bg-surface-2/60 font-bold", r.accountId && onOpen && "hover:bg-surface-2")}>
                  <td className={cn("px-3 py-2", r.kind === "account" && !r.postable && r.accountId && "font-semibold")} style={{ paddingInlineStart: 12 + r.level * 18 }}>{r.code ? <span className="num me-2 text-[12.5px] text-muted" dir="ltr">{r.code}</span> : null}{r.label}</td>
                  {r.values.map((v, i) => <td key={i} className={cn("px-3 py-2 text-end", r.accountId && onOpen && "cursor-pointer")} onClick={() => r.accountId && onOpen?.(r, i)}><Amount value={v} zero={r.kind === "total" ? "0.00" : "—"} tone="auto" /></td>)}
                  {(extra ?? []).map((x, i) => <td key={`x${i}`} className="num px-3 py-2 text-end text-muted" dir="ltr">{x.cell(r)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}

function Income({ mode }: { mode: "period" | "branches" | "centres" }) {
  const fin = useFinance();
  const nav = useNavigate();
  const [period, setPeriod] = useState<Period>(periodOf("month", fin.settings.yearStartMonth));
  const [branch, setBranch] = useState("");
  const [centre, setCentre] = useState("");
  const [level, setLevel] = useState("3");
  const [compare, setCompare] = useState("");
  const centres = fin.centres.filter((c) => c.active);
  const base = { from: period.from, to: period.to };
  const cols = useMemo(() => {
    if (mode === "branches") return [...fin.branches.map((b) => ({ label: b.name.ar, f: { ...base, branchId: b.id } })), { label: "الإجمالي", f: base }];
    if (mode === "centres") return [...centres.map((c) => ({ label: c.name.ar, f: { ...base, branchId: branch || null, centreId: c.id } })), { label: "الإجمالي", f: { ...base, branchId: branch || null } }];
    const cur = { ...base, branchId: branch || null, centreId: centre || null };
    const other = compare === "prev" ? previousPeriod(base) : compare === "year" && base.from && base.to ? { from: shift(base.from, -1), to: shift(base.to, -1) } : null;
    return [{ label: periodLabel(period), f: cur }, ...(other ? [{ label: periodLabel({ preset: "custom", ...other }), f: { ...cur, ...other } }] : [])];
  }, [mode, fin.branches, centres, period, branch, centre, compare]); // eslint-disable-line react-hooks/exhaustive-deps
  const r = useMemo(() => incomeStatement(fin.accounts, fin.entries, cols.map((c) => c.f), Number(level)), [fin.accounts, fin.entries, cols, level]);
  const main = mode === "period" ? 0 : cols.length - 1;
  const extra = mode === "period" ? [{ head: "% من المبيعات", cell: (x: StRow) => pct(x.values[0], r.revenue[0]) }, ...(cols.length > 1 ? [{ head: "التغير", cell: (x: StRow) => change(x.values[0], x.values[1]) }] : [])] : [{ head: "% من المبيعات", cell: (x: StRow) => pct(x.values[main], r.revenue[main]) }];
  const title = mode === "branches" ? "قائمة دخل الفروع" : mode === "centres" ? "تقرير مراكز التكلفة" : "قائمة الدخل";
  const open = (x: StRow, i: number) => { const f = cols[i].f as { from?: string | null; to?: string | null; branchId?: string | null }; nav(`/finance/reports/ledger?account=${x.accountId}${f.from ? `&from=${f.from}` : ""}${f.to ? `&to=${f.to}` : ""}${f.branchId ? `&branch=${f.branchId}` : ""}`); };
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-end gap-2">
        <PeriodPicker value={period} onChange={setPeriod} startMonth={fin.settings.yearStartMonth} />
        {mode !== "branches" ? <BranchSelect fin={fin} value={branch} onChange={setBranch} /> : null}
        {mode === "period" && centres.length ? <Select label="مركز التكلفة" className="w-44" value={centre} onChange={(e) => setCentre(e.target.value)} options={[{ value: "", label: "كل المراكز" }, ...centres.map((c) => ({ value: c.id, label: c.name.ar }))]} /> : null}
        <Select label="التفصيل" className="w-40" value={level} onChange={(e) => setLevel(e.target.value)} options={levels} />
        {mode === "period" ? <Select label="مقارنة" className="w-56" value={compare} onChange={(e) => setCompare(e.target.value)} options={COMPARE} /> : null}
      </div>
      {mode === "centres" && !centres.length ? <p className="rounded-xl border border-line px-3 py-3 text-[14px] text-muted">لا توجد مراكز تكلفة. عرّفها من تبويب مراكز التكلفة، ثم اختر المركز على سطور القيود والسندات.</p> : null}
      <div className="grid gap-2 sm:grid-cols-4">
        {[["المبيعات", r.revenue[main]], ["مجمل الربح", r.gross[main]], ["المصروفات", r.expenses[main]], ["صافي الربح", r.net[main]]].map(([l, v]) => <Card key={l as string} className="p-3"><div className="text-[12.5px] text-muted">{l}</div><div className="text-[18px] font-bold"><Amount value={v as number} zero="0.00" tone="auto" /></div><div className="num text-[12.5px] text-muted" dir="ltr">{l === "المبيعات" ? "" : pct(v as number, r.revenue[main])}</div></Card>)}
      </div>
      <StatementTable title={title} sub={`${periodLabel(period)}${branch ? ` · ${fin.branchName(branch)}` : ""}`} file={title.replace(/ /g, "-")} cols={cols.map((c) => c.label)} rows={r.rows} extra={extra} onOpen={open} />
    </div>
  );
}

function Balance() {
  const fin = useFinance();
  const nav = useNavigate();
  const [to, setTo] = useState(today());
  const [other, setOther] = useState("");
  const [branch, setBranch] = useState("");
  const [level, setLevel] = useState("3");
  const cols = [{ to, branchId: branch || null }, ...(other ? [{ to: other, branchId: branch || null }] : [])];
  const r = useMemo(() => balanceSheet(fin.accounts, fin.entries, cols, Number(level)), [fin.accounts, fin.entries, to, other, branch, level]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-end gap-2">
        <Input label="في تاريخ" type="date" dir="ltr" className="w-44" value={to} onChange={(e) => setTo(e.target.value || today())} />
        <Input label="مقارنة بتاريخ (اختياري)" type="date" dir="ltr" className="w-48" value={other} onChange={(e) => setOther(e.target.value)} />
        <BranchSelect fin={fin} value={branch} onChange={setBranch} />
        <Select label="التفصيل" className="w-40" value={level} onChange={(e) => setLevel(e.target.value)} options={levels} />
      </div>
      {!branch ? <Banner ok={r.balanced} yes="المركز المالي متوازن: الأصول تساوي الالتزامات وحقوق الملكية" no="المركز المالي غير متوازن، راجع ميزان المراجعة" /> : <p className="text-[13.5px] text-muted">مركز مالي لفرع واحد قد لا يتوازن، لأن جزء من القيد قد يكون على فرع آخر.</p>}
      <StatementTable title="المركز المالي" sub={`في ${fmtDay(to)}${branch ? ` · ${fin.branchName(branch)}` : ""}`} file="المركز-المالي" cols={cols.map((c) => fmtDay(c.to))} rows={r.rows}
        extra={other ? [{ head: "التغير", cell: (x) => change(x.values[0], x.values[1]) }] : undefined} onOpen={(x, i) => nav(`/finance/reports/ledger?account=${x.accountId}&to=${cols[i].to}${branch ? `&branch=${branch}` : ""}`)} />
    </div>
  );
}

function Banner({ ok, yes, no }: { ok: boolean; yes: ReactNode; no: ReactNode }) {
  return <div className={cn("flex items-center gap-2 rounded-xl border px-3 py-2.5 text-[14px] font-semibold", ok ? "border-ok/40 text-ok" : "border-danger/50 text-danger")}>{ok ? <CheckCircle2 className="size-4.5" /> : <TriangleAlert className="size-4.5" />}{ok ? yes : no}</div>;
}

function CashFlow() {
  const fin = useFinance();
  const nav = useNavigate();
  const [period, setPeriod] = useState<Period>(periodOf("month", fin.settings.yearStartMonth));
  const [branch, setBranch] = useState("");
  const r = useMemo(() => cashFlow(fin.accounts, fin.entries, { from: period.from, to: period.to, branchId: branch || null }), [fin.accounts, fin.entries, period, branch]);
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-end gap-2"><PeriodPicker value={period} onChange={setPeriod} startMonth={fin.settings.yearStartMonth} /><BranchSelect fin={fin} value={branch} onChange={setBranch} /></div>
      <div className="grid gap-2 sm:grid-cols-5">
        {[["رصيد أول الفترة", r.opening], ["التشغيل", r.operating], ["الاستثمار", r.investing], ["التمويل", r.financing], ["رصيد آخر الفترة", r.closing]].map(([l, v]) => <Card key={l as string} className="p-3"><div className="text-[12.5px] text-muted">{l}</div><div className="text-[18px] font-bold"><Amount value={v as number} zero="0.00" tone="auto" /></div></Card>)}
      </div>
      {r.unexplained ? <p className="text-[13.5px] text-muted">يوجد <span className="num" dir="ltr">{fmt(Math.abs(r.unexplained))}</span> حركة نقدية طرفها الآخر على فرع مختلف، تظهر عند اختيار كل الفروع.</p> : null}
      <StatementTable title="التدفقات النقدية" sub={`${periodLabel(period)}${branch ? ` · ${fin.branchName(branch)}` : ""}`} file="التدفقات-النقدية" cols={["المبلغ"]} rows={r.rows} onOpen={(x) => nav(`/finance/reports/ledger?account=${x.accountId}${period.from ? `&from=${period.from}` : ""}${period.to ? `&to=${period.to}` : ""}`)} />
    </div>
  );
}

function CashMovement() {
  const fin = useFinance();
  const [period, setPeriod] = useState<Period>(periodOf("month", fin.settings.yearStartMonth));
  const [account, setAccount] = useState("");
  const money = useMemo(() => moneyAccounts(fin.ix.ordered()), [fin.ix]);
  const r = useMemo(() => cashMovement(account ? [account] : money.map((a) => a.id), fin.entries, { from: period.from, to: period.to }), [account, money, fin.entries, period]);
  const head = ["اليوم", "رصيد أول اليوم", "وارد", "منصرف", "رصيد آخر اليوم"];
  const name = account ? fin.byId.get(account)?.name.ar ?? "" : "كل الخزائن والبنوك";
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-end gap-2">
        <PeriodPicker value={period} onChange={setPeriod} startMonth={fin.settings.yearStartMonth} />
        <Select label="الخزينة أو البنك" className="w-64" value={account} onChange={(e) => setAccount(e.target.value)} options={[{ value: "", label: "كل الخزائن والبنوك" }, ...money.map((a) => ({ value: a.id, label: a.name.ar }))]} />
        <span className="flex-1" />
        <ExportButton file="حركة-الخزائن" head={head} rows={() => r.rows.map((d) => [d.date, d.opening / 100000, d.in / 100000, d.out / 100000, d.closing / 100000])} />
        <PrintButton onClick={() => printTable("حركة الخزائن والبنوك", `${name} · ${periodLabel(period)}`, head, r.rows.map((d) => [fmtDay(d.date), ...[d.opening, d.in, d.out, d.closing].map((v) => ({ text: fmt(v), align: "end" as const }))]), ["الإجمالي", { text: fmt(r.opening), align: "end" }, { text: fmt(r.in), align: "end" }, { text: fmt(r.out), align: "end" }, { text: fmt(r.closing), align: "end" }])} />
      </div>
      <Card className="overflow-hidden">
        <div className="overflow-x-auto thin-scrollbar">
          <table className="w-full text-[14px]">
            <thead><tr className="text-[12.5px] text-muted">{head.map((h, i) => <th key={h} className={cn("border-b border-line px-3 py-2.5 font-semibold", i ? "text-end" : "text-start")}>{h}</th>)}</tr></thead>
            <tbody>
              {r.rows.map((d) => <tr key={d.date} className="border-t border-line/60"><td className="num px-3 py-2">{fmtDay(d.date)}</td><td className="px-3 py-2 text-end"><Amount value={d.opening} zero="0.00" tone="auto" /></td><td className="px-3 py-2 text-end text-ok"><Amount value={d.in} zero="—" /></td><td className="px-3 py-2 text-end text-danger"><Amount value={d.out} zero="—" /></td><td className="px-3 py-2 text-end font-semibold"><Amount value={d.closing} zero="0.00" tone="auto" /></td></tr>)}
              {!r.rows.length ? <tr><td colSpan={5} className="px-3 py-8 text-center text-muted">لا توجد حركة في هذه الفترة</td></tr> : null}
              <tr className="border-t border-line bg-surface-2 font-bold"><td className="px-3 py-2.5">الإجمالي</td><td className="px-3 py-2.5 text-end"><Amount value={r.opening} zero="0.00" /></td><td className="px-3 py-2.5 text-end"><Amount value={r.in} zero="0.00" /></td><td className="px-3 py-2.5 text-end"><Amount value={r.out} zero="0.00" /></td><td className="px-3 py-2.5 text-end"><Amount value={r.closing} zero="0.00" tone="auto" /></td></tr>
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function GeneralLedger() {
  const fin = useFinance();
  const nav = useNavigate();
  const [period, setPeriod] = useState<Period>(periodOf("month", fin.settings.yearStartMonth));
  const [branch, setBranch] = useState("");
  const [zero, setZero] = useState(false);
  const f = { from: period.from, to: period.to, branchId: branch || null };
  const blocks = useMemo(() => fin.ix.ordered().filter((a) => a.postable).map((a) => ({ a, s: statement(a, fin.entries, f) })).filter((x) => x.s.rows.length || (zero && x.s.opening)), [fin.ix, fin.entries, period, branch, zero]); // eslint-disable-line react-hooks/exhaustive-deps
  const head = ["التاريخ", "القيد", "البيان", "مدين", "دائن", "الرصيد"];
  const flat = () => blocks.flatMap(({ a, s }) => [[`${a.code} · ${a.name.ar}`, "", "رصيد أول الفترة", "", "", s.opening / 100000], ...s.rows.map((r) => [r.entry.date, entryRef(r.entry), r.line.memo ?? r.entry.memo, r.debit / 100000, r.credit / 100000, r.balance / 100000])]);
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-end gap-2">
        <PeriodPicker value={period} onChange={setPeriod} startMonth={fin.settings.yearStartMonth} /><BranchSelect fin={fin} value={branch} onChange={setBranch} />
        <div className="pb-1"><Switch checked={zero} onChange={setZero} label="إظهار حسابات برصيد بدون حركة" /></div>
        <span className="flex-1" />
        <ExportButton file="دفتر-الأستاذ" head={head} rows={flat} />
        <PrintButton onClick={() => printTable("دفتر الأستاذ العام", periodLabel(period), head, blocks.flatMap(({ a, s }) => [[{ text: `${a.code} · ${a.name.ar}`, bold: true }, "", "رصيد أول الفترة", "", "", { text: fmt(s.opening), align: "end" as const, bold: true }], ...s.rows.map((r) => [fmtDay(r.entry.date), entryRef(r.entry), r.line.memo ?? r.entry.memo, { text: r.debit ? fmt(r.debit) : "", align: "end" as const }, { text: r.credit ? fmt(r.credit) : "", align: "end" as const }, { text: fmt(r.balance), align: "end" as const }])]))} />
      </div>
      {blocks.map(({ a, s }) => (
        <Card key={a.id} className="overflow-hidden">
          <button type="button" className="flex w-full flex-wrap items-center gap-x-4 gap-y-1 bg-surface-2 px-3 py-2.5 text-start" onClick={() => nav(`/finance/reports/ledger?account=${a.id}${period.from ? `&from=${period.from}` : ""}${period.to ? `&to=${period.to}` : ""}`)}>
            <b><span className="num me-2 text-muted" dir="ltr">{a.code}</span>{a.name.ar}</b><span className="flex-1" />
            <span className="text-[13.5px] text-muted">أول الفترة <Amount value={s.opening} zero="0.00" tone="auto" /></span><span className="text-[13.5px]">آخر الفترة <b><Amount value={s.closing} zero="0.00" tone="auto" /></b> {s.closing ? (s.closing > 0 === isDebit(a.type) ? "" : "") : ""}</span>
          </button>
          <div className="overflow-x-auto thin-scrollbar">
            <table className="w-full text-[13.5px]"><tbody>
              {s.rows.map((r, i) => <tr key={i} className="border-t border-line/60"><td className="num w-28 px-3 py-1.5">{fmtDay(r.entry.date)}</td><td className="num w-24 px-3 py-1.5 text-muted" dir="ltr">{entryRef(r.entry)}</td><td className="px-3 py-1.5">{r.line.memo ?? r.entry.memo}</td><td className="w-28 px-3 py-1.5 text-end"><Amount value={r.debit} zero="" /></td><td className="w-28 px-3 py-1.5 text-end"><Amount value={r.credit} zero="" /></td><td className="w-32 px-3 py-1.5 text-end font-semibold"><Amount value={r.balance} zero="0.00" tone="auto" /></td></tr>)}
            </tbody></table>
          </div>
        </Card>
      ))}
      {!blocks.length ? <Card className="px-3 py-8 text-center text-muted">لا توجد حركات في هذه الفترة</Card> : null}
    </div>
  );
}
export type { Fin };
