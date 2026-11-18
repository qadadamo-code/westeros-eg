/** الموازنة التقديرية: إعداد موازنة السنة لكل حساب وشهر، ومقارنة الفعلي بها. */
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Copy, Save } from "lucide-react";
import { useDb, useLive } from "@/data/hooks";
import type { FinAccount } from "@/data/financeTypes";
import { cn } from "@/lib/cn";
import { Button, Card, Input, Segmented, Select, useToast } from "@/ui";
import { ExportButton } from "../ui";
import { actualByMonth, budgetOf, budgetVsActual, findBudget, fromActual, isBudgeted, saveBudget, spread, yearTotal, type BudgetData } from "./budget";
import { monthsOfYear } from "./close";
import { fiscalYear } from "./journal";
import { useFinPerms } from "./perms";
import { monthEnd } from "./treasury";
import { MAX_LEVEL } from "./tree";
import { BranchSelect, Confirm, fmt, fromText, PrintButton, printTable, today, toText, Toolbar } from "./ui";
import { useFinance, type Fin } from "./useFinance";

const err = (e: unknown) => String((e as Error)?.message ?? e);
const label = (m: string) => m.split("-").reverse().join("/");
const TYPE_LABEL: Partial<Record<FinAccount["type"], string>> = { revenue: "الإيرادات", cogs: "تكلفة المبيعات", expense: "المصروفات" };
const pct = (v: number, base: number) => (base ? `${((v / base) * 100).toFixed(1)}%` : "");

export default function Budget() {
  const fin = useFinance();
  const perms = useFinPerms();
  const docs = useLive("finDocs").data;
  const thisYear = fiscalYear(today(), fin.settings.yearStartMonth);
  const [tab, setTab] = useState<"versus" | "edit">("versus");
  const [year, setYear] = useState(thisYear);
  const [branch, setBranch] = useState("");
  const months = useMemo(() => monthsOfYear(year, fin.settings.yearStartMonth), [year, fin.settings.yearStartMonth]);
  const doc = useMemo(() => findBudget(docs, year, branch || null), [docs, year, branch]);
  const years = [thisYear + 1, thisYear, thisYear - 1, thisYear - 2];
  return (
    <div className="grid gap-4">
      <Toolbar lead={<Segmented size="sm" className="max-sm:grid max-sm:w-full max-sm:grid-cols-2 max-sm:[&>button]:h-10" label="الموازنة" value={tab} onChange={setTab} options={[{ value: "versus", label: "الفعلي مقابل الموازنة" }, ...(perms.has("budget") ? [{ value: "edit" as const, label: "إعداد الموازنة" }] : [])]} />}>
        <Select label="السنة المالية" className="w-40" value={String(year)} onChange={(e) => setYear(Number(e.target.value))} options={years.map((y) => ({ value: String(y), label: fin.settings.yearStartMonth === 1 ? String(y) : `${y}/${y + 1}` }))} />
        <BranchSelect fin={fin} value={branch} onChange={setBranch} label="موازنة" all="المطعم كله" />
      </Toolbar>
      {tab === "edit" && perms.has("budget") ? <Editor key={`${year}|${branch}|${doc?.id ?? ""}`} fin={fin} year={year} branch={branch || null} months={months} data={budgetOf(doc)} row={doc} /> : <Versus fin={fin} year={year} branch={branch || null} months={months} data={doc ? budgetOf(doc) : null} onEdit={perms.has("budget") ? () => setTab("edit") : undefined} />}
    </div>
  );
}

/* ───────── الفعلي مقابل الموازنة ───────── */

function Versus({ fin, year, branch, months, data, onEdit }: { fin: Fin; year: number; branch: string | null; months: string[]; data: BudgetData | null; onEdit?: () => void }) {
  const nav = useNavigate();
  const now = today().slice(0, 7);
  const [from, setFrom] = useState(months[0]);
  const [to, setTo] = useState(months.includes(now) ? now : months[11]);
  const [level, setLevel] = useState("3");
  useEffect(() => { setFrom(months[0]); setTo(months.includes(now) ? now : months[11]); }, [months, now]);
  const range = months.filter((m) => m >= from && m <= to);
  const r = useMemo(() => budgetVsActual(fin.accounts, fin.entries, data ?? { year, lines: {} }, range, branch, Number(level)), [fin.accounts, fin.entries, data, year, range.join(), branch, level]); // eslint-disable-line react-hooks/exhaustive-deps
  const head = ["الحساب", "الموازنة", "الفعلي", "الفرق", "نسبة التنفيذ"];
  const title = "الفعلي مقابل الموازنة", sub = `${label(from)} إلى ${label(to)} · ${branch ? fin.branchName(branch) : "المطعم كله"}`;
  const totals: [string, { budget: number; actual: number }, boolean][] = [["إجمالي الإيرادات", r.total.revenue, true], ["إجمالي تكلفة المبيعات", r.total.cogs, false], ["إجمالي المصروفات", r.total.expense, false], ["صافي الربح", r.net, true]];
  const opts = months.map((m) => ({ value: m, label: label(m) }));
  if (!data) return <Card className="grid gap-2 p-6 text-center"><p className="text-[15px] font-semibold">لا توجد موازنة لهذه السنة</p><p className="text-[13.5px] text-muted">اعمل موازنة السنة من تبويب إعداد الموازنة، وبعدها تظهر المقارنة هنا شهر بشهر.</p>{onEdit ? <div><Button onClick={onEdit}>إعداد الموازنة</Button></div> : null}</Card>;
  return (
    <>
      <Toolbar more={<><ExportButton file="الفعلي-مقابل-الموازنة" head={["الكود", ...head]} rows={() => [...r.rows.map((x) => [x.code, x.label, x.budget / 100000, x.actual / 100000, x.diff / 100000, pct(x.actual, x.budget)]), ...totals.map(([l, t]) => ["", l, t.budget / 100000, t.actual / 100000, (t.actual - t.budget) / 100000, pct(t.actual, t.budget)])]} /><PrintButton onClick={() => printTable(title, sub, head, [...r.rows.map((x) => [{ text: `${x.code} ${x.label}`, indent: x.level - 1, bold: !x.postable }, ...[fmt(x.budget), fmt(x.actual), fmt(x.diff), pct(x.actual, x.budget)].map((t) => ({ text: t, align: "end" as const }))]), ...totals.map(([l, t]) => [{ text: l, bold: true }, ...[fmt(t.budget), fmt(t.actual), fmt(t.actual - t.budget), pct(t.actual, t.budget)].map((x) => ({ text: x, align: "end" as const, bold: true }))])])} /></>}>
        <Select label="من شهر" className="w-36" value={from} onChange={(e) => setFrom(e.target.value)} options={opts} />
        <Select label="إلى شهر" className="w-36" value={to} onChange={(e) => setTo(e.target.value)} options={opts.filter((o) => o.value >= from)} />
        <Select label="التفصيل" className="w-40" value={level} onChange={(e) => setLevel(e.target.value)} options={Array.from({ length: MAX_LEVEL - 1 }, (_, i) => ({ value: String(i + 2), label: `حتى المستوى ${i + 2}` }))} />
      </Toolbar>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {totals.map(([l, t, more]) => { const diff = t.actual - t.budget, good = more ? diff >= 0 : diff <= 0; return <Card key={l} className="p-3"><div className="text-[12.5px] text-muted">{l}</div><div className="num text-[18px] font-bold" dir="ltr">{fmt(t.actual)}</div><div className={cn("num text-[12.5px]", !t.budget ? "text-muted" : good ? "text-ok" : "text-danger")} dir="ltr">{t.budget ? `${diff >= 0 ? "+" : ""}${fmt(diff)} عن ${fmt(t.budget)}` : "بدون موازنة"}</div></Card>; })}
      </div>
      <Card className="overflow-hidden">
        <div className="overflow-x-auto thin-scrollbar">
          <table className="w-full text-[14px]">
            <thead><tr className="text-[12.5px] text-muted">{head.map((h, i) => <th key={h} className={cn("border-b border-line px-3 py-2.5 font-semibold", i ? "text-end" : "text-start")}>{h}</th>)}</tr></thead>
            <tbody>
              {r.rows.length ? r.rows.map((x) => (
                <tr key={x.id} className={cn("border-t border-line/60", x.level === 1 ? "bg-surface-2 font-bold text-primary" : !x.postable && "font-semibold", x.postable && "cursor-pointer hover:bg-surface-2")} onClick={() => x.postable && nav(`/finance/reports/ledger?account=${x.id}&from=${from}-01&to=${monthEnd(to)}${branch ? `&branch=${branch}` : ""}`)}>
                  <td className="px-3 py-2" style={{ paddingInlineStart: 12 + (x.level - 1) * 18 }}><span className="num me-2 text-[12.5px] text-muted" dir="ltr">{x.code}</span>{x.label}</td>
                  <td className="num px-3 py-2 text-end" dir="ltr">{fmt(x.budget, "—")}</td>
                  <td className="num px-3 py-2 text-end" dir="ltr">{fmt(x.actual, "—")}</td>
                  <td className={cn("num px-3 py-2 text-end", x.budget && x.diff ? (x.good ? "text-ok" : "text-danger") : "text-muted")} dir="ltr">{x.diff > 0 ? "+" : ""}{fmt(x.diff, "—")}</td>
                  <td className="px-3 py-2"><Bar actual={x.actual} budget={x.budget} good={x.good} /></td>
                </tr>
              )) : <tr><td colSpan={5} className="px-3 py-8 text-center text-muted">لا توجد أرقام في هذه الفترة</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
function Bar({ actual, budget, good }: { actual: number; budget: number; good: boolean }) {
  if (!budget) return <span className="block text-end text-[12.5px] text-muted">—</span>;
  const p = Math.max(0, actual / budget);
  return (
    <span className="flex items-center justify-end gap-2">
      <span className="h-1.5 w-20 overflow-hidden rounded-full bg-line"><span className={cn("block h-full rounded-full", good ? "bg-ok" : "bg-danger")} style={{ width: `${Math.min(100, p * 100)}%` }} /></span>
      <span className="num w-14 text-end text-[12.5px]" dir="ltr">{(p * 100).toFixed(0)}%</span>
    </span>
  );
}

/* ───────── إعداد الموازنة ───────── */

function Editor({ fin, year, branch, months, data, row }: { fin: Fin; year: number; branch: string | null; months: string[]; data: BudgetData; row: ReturnType<typeof findBudget> }) {
  const db = useDb();
  const { toast } = useToast();
  const [lines, setLines] = useState<BudgetData["lines"]>(data.lines);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [percent, setPercent] = useState("10");
  const [ask, setAsk] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const accounts = useMemo(() => (fin.ix.ordered() as FinAccount[]).filter((a) => a.active && isBudgeted(a)), [fin.ix]);
  const set = (id: string, m: Record<string, number>) => { setLines((l) => ({ ...l, [id]: m })); setDirty(true); };
  const total = (type: FinAccount["type"]) => accounts.filter((a) => a.type === type).reduce((s, a) => s + yearTotal(lines[a.id]), 0);
  const net = total("revenue") - total("cogs") - total("expense");
  const save = async () => {
    setBusy(true);
    try { await saveBudget(db, row, { year, branchId: branch, lines }); setDirty(false); toast({ tone: "success", title: "تم حفظ الموازنة" }); } catch (e) { toast({ tone: "error", title: "تعذر الحفظ", description: err(e) }); } finally { setBusy(false); }
  };
  const copy = () => {
    const last = monthsOfYear(year - 1, fin.settings.yearStartMonth);
    const made = fromActual(actualByMonth(fin.accounts, fin.entries, last, branch), 12, Number(percent) || 0);
    setAsk(false);
    if (!Object.keys(made).length) { toast({ tone: "error", title: "لا توجد أرقام فعلية في السنة الماضية" }); return; }
    setLines(made); setDirty(true);
    toast({ tone: "success", title: "اتملت الموازنة من فعلي السنة الماضية", description: "راجع الأرقام ثم احفظ." });
  };
  return (
    <>
      <Toolbar actions={<><Button variant="outline" icon={<Copy />} onClick={() => setAsk(true)}>من فعلي السنة الماضية</Button><Button icon={<Save />} loading={busy} disabled={!dirty} onClick={save}>حفظ الموازنة</Button></>} more={<><ExportButton file={`موازنة-${year}`} head={["الكود", "الحساب", "السنة", ...months.map(label)]} rows={() => accounts.map((a) => [a.code, a.name.ar, yearTotal(lines[a.id]) / 100000, ...months.map((m) => (lines[a.id]?.[m] ?? 0) / 100000)])} /></>}>
        <Input label="زيادة %" dir="ltr" inputMode="decimal" className="w-24" value={percent} onChange={(e) => setPercent(e.target.value)} />
      </Toolbar>
      <p className="text-[13.5px] text-muted">اكتب رقم السنة للحساب ويتوزع على الشهور بالتساوي، أو افتح الحساب واكتب كل شهر لوحده. الإيرادات تكتب بالموجب.</p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[["الإيرادات", total("revenue")], ["تكلفة المبيعات", total("cogs")], ["المصروفات", total("expense")], ["صافي الربح المتوقع", net]].map(([l, v]) => <Card key={l as string} className="p-3"><div className="text-[12.5px] text-muted">{l}</div><div className={cn("num text-[18px] font-bold", (v as number) < 0 && "text-danger")} dir="ltr">{fmt(v as number)}</div></Card>)}
      </div>
      {accounts.length ? (["revenue", "cogs", "expense"] as const).map((type) => (
        <Card key={type} className="overflow-hidden">
          <h3 className="flex justify-between bg-surface-2 px-4 py-2.5 text-[15px] font-bold text-primary"><span>{TYPE_LABEL[type]}</span><span className="num" dir="ltr">{fmt(total(type))}</span></h3>
          <div className="grid">
            {accounts.filter((a) => a.type === type).map((a) => {
              const m = lines[a.id] ?? {};
              return (
                <div key={a.id} className="border-t border-line/60 px-3 py-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <button type="button" className="min-w-0 flex-1 truncate text-start text-[14px]" aria-expanded={open === a.id} onClick={() => setOpen(open === a.id ? null : a.id)}><span className="num me-2 text-[12.5px] text-muted" dir="ltr">{a.code}</span>{a.name.ar}<span className="ms-2 text-[12.5px] text-primary">{open === a.id ? "إخفاء الشهور" : "شهر بشهر"}</span></button>
                    <Input aria-label={`موازنة السنة: ${a.name.ar}`} dir="ltr" inputMode="decimal" className="w-36" placeholder="السنة" value={toText(yearTotal(m))} onChange={(e) => set(a.id, spread(fromText(e.target.value), months))} />
                  </div>
                  {open === a.id ? (
                    <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
                      {months.map((mo) => <Input key={mo} label={label(mo)} dir="ltr" inputMode="decimal" placeholder="0" value={toText(m[mo])} onChange={(e) => set(a.id, { ...m, [mo]: fromText(e.target.value) })} />)}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </Card>
      )) : <Card className="p-6 text-center text-[14px] text-muted">حمّل شجرة الحسابات أولا، ثم ارجع لإعداد الموازنة.</Card>}
      <Confirm open={ask} onClose={() => setAsk(false)} onConfirm={copy} title="موازنة من فعلي السنة الماضية" confirmLabel="املأ الموازنة" description={`أرقام كل حساب في شهور السنة الماضية تتنقل لنفس الشهور هنا${Number(percent) ? ` بزيادة ${percent}%` : ""}، وتستبدل المكتوب حاليا. لا يتحفظ شيء قبل ما تضغط حفظ.`} />
    </>
  );
}
