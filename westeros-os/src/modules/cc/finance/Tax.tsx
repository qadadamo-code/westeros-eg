/** الضرائب: إقرار ضريبة القيمة المضافة شهر بشهر وتسويته، والخصم من المنبع وكسب العمل والتأمينات المستحقة. */
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Percent } from "lucide-react";
import { useDb } from "@/data/hooks";
import type { FinEntry } from "@/data/financeTypes";
import { cn } from "@/lib/cn";
import { Badge, Button, Card, Dialog, EmptyState, Input, Select, useToast } from "@/ui";
import { ExportButton } from "../ui";
import { entryRef, fiscalYear } from "./journal";
import { EntryView } from "./Journal";
import { useFinPerms } from "./perms";
import { MONEY_LABEL, moneyAccounts } from "./treasury";
import { fmt, PrintButton, printTable, today } from "./ui";
import { useFinance, type Fin } from "./useFinance";
import { liabilityByMonth, settleVat, vatRows, type VatRow } from "./vat";

const err = (e: unknown) => String((e as Error)?.message ?? e);
const label = (m: string) => m.split("-").reverse().join("/");
const OTHER = [{ key: "tax.withholding", title: "الخصم من المنبع", hint: "ما خصمناه من الموردين عند السداد ويتورد للضرائب" }, { key: "tax.payroll", title: "ضريبة كسب العمل", hint: "ما خصمناه من رواتب الموظفين" }, { key: "social.insurance", title: "التأمينات الاجتماعية", hint: "حصة الموظف وحصة الشركة" }] as const;

export default function Tax() {
  const fin = useFinance();
  const perms = useFinPerms();
  const nav = useNavigate();
  const can = perms.has("journal.approve");
  const rows = useMemo(() => vatRows(fin.accounts, fin.entries, fin.settings), [fin.accounts, fin.entries, fin.settings]);
  const years = useMemo(() => [...new Set([fiscalYear(today(), fin.settings.yearStartMonth), ...rows.map((r) => fiscalYear(`${r.month}-01`, fin.settings.yearStartMonth))])].sort((a, b) => b - a), [rows, fin.settings.yearStartMonth]);
  const [year, setYear] = useState(years[0]);
  const [settle, setSettle] = useState<VatRow | null>(null);
  const [view, setView] = useState<FinEntry | null>(null);
  const list = rows.filter((r) => fiscalYear(`${r.month}-01`, fin.settings.yearStartMonth) === year);
  const firstOpen = rows.find((r) => !r.settled)?.month;
  const sum = list.reduce((s, r) => ({ output: s.output + r.output, input: s.input + r.input, payable: s.payable + r.payable }), { output: 0, input: 0, payable: 0 });
  const credit = rows.length ? rows[rows.length - 1].carryOut : 0;
  const other = useMemo(() => OTHER.map((o) => ({ ...o, account: fin.accounts.find((a) => a.code === fin.settings.links[o.key]), ...liabilityByMonth(fin.accounts, fin.entries, fin.settings.links[o.key]) })), [fin.accounts, fin.entries, fin.settings.links]);
  const head = ["الشهر", "ضريبة المخرجات", "ضريبة المدخلات", "الصافي", "رصيد دائن مرحل", "المستحق سداده", "الحالة"];
  const cells = (r: VatRow) => [label(r.month), r.output, r.input, r.net, r.carryIn, r.payable, r.settled ? "متسوي" : "مفتوح"] as const;
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-end gap-2">
        <Select label="السنة" className="w-36" value={String(year)} onChange={(e) => setYear(Number(e.target.value))} options={years.map((y) => ({ value: String(y), label: String(y) }))} />
        <span className="flex-1" />
        <ExportButton file={`ضريبة-القيمة-المضافة-${year}`} head={[...head]} rows={() => list.map((r) => cells(r).map((c, i) => (i >= 1 && i <= 5 ? (c as number) / 100000 : c)))} />
        <PrintButton onClick={() => printTable("إقرار ضريبة القيمة المضافة", String(year), [...head], list.map((r) => cells(r).map((c, i) => (i >= 1 && i <= 5 ? { text: fmt(c as number, "—"), align: "end" as const } : String(c)))), ["الإجمالي", { text: fmt(sum.output), align: "end", bold: true }, { text: fmt(sum.input), align: "end", bold: true }, { text: fmt(sum.output - sum.input), align: "end", bold: true }, "", { text: fmt(sum.payable), align: "end", bold: true }, ""])} />
      </div>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {[["ضريبة المخرجات (على المبيعات)", sum.output, ""], ["ضريبة المدخلات (على المشتريات)", sum.input, ""], ["المستحق عن السنة", sum.payable, sum.payable ? "text-brass" : ""], ["رصيد دائن للشهر القادم", credit, credit ? "text-ok" : ""]].map(([l, v, c]) => <Card key={l as string} className="p-3"><div className="text-[12.5px] text-muted">{l}</div><div className={cn("num text-[18px] font-bold", c as string)} dir="ltr">{fmt(v as number)}</div></Card>)}
      </div>
      {list.length ? (
        <Card className="overflow-hidden"><div className="overflow-x-auto thin-scrollbar"><table className="w-full text-[14px]">
          <thead><tr className="text-[12.5px] text-muted">{[...head, ""].map((h, i) => <th key={i} className={cn("border-b border-line px-3 py-2.5 font-semibold", i >= 1 && i <= 5 ? "text-end" : "text-start")}>{h}</th>)}</tr></thead>
          <tbody>{list.map((r) => (
            <tr key={r.month} className="border-t border-line/60">
              <td className="num px-3 py-2 font-semibold" dir="ltr">{label(r.month)}</td>
              <td className="num px-3 py-2 text-end" dir="ltr">{fmt(r.output, "—")}</td><td className="num px-3 py-2 text-end" dir="ltr">{fmt(r.input, "—")}</td>
              <td className={cn("num px-3 py-2 text-end", r.net < 0 && "text-ok")} dir="ltr">{fmt(r.net, "—")}</td><td className="num px-3 py-2 text-end text-muted" dir="ltr">{fmt(r.carryIn, "—")}</td>
              <td className="num px-3 py-2 text-end font-bold" dir="ltr">{fmt(r.payable, "—")}</td>
              <td className="px-3 py-2"><Badge size="sm" tone={r.settled ? "ok" : "brass"}>{r.settled ? "متسوي" : "مفتوح"}</Badge></td>
              <td className="px-3 py-2 text-end">{r.settled ? <button type="button" className="num font-semibold text-primary hover:underline" dir="ltr" onClick={() => setView(r.settled)}>{entryRef(r.settled)}</button> : can && r.month === firstOpen && r.month < today().slice(0, 7) ? <Button size="sm" onClick={() => setSettle(r)}>تسوية</Button> : null}</td>
            </tr>))}</tbody>
        </table></div></Card>
      ) : <Card><EmptyState compact icon={<Percent />} title="لا توجد ضريبة قيمة مضافة في هذه السنة" body="الضريبة تتجمع هنا لوحدها من ملخصات المبيعات وفواتير الشراء والمصروفات، وكل شهر يتسوى بقيد بعد ما يخلص." /></Card>}

      <div className="grid gap-3 lg:grid-cols-3">
        {other.map((o) => (
          <Card key={o.key} className="grid content-start gap-2 p-4">
            <div className="flex items-start gap-2"><div className="min-w-0 flex-1"><h3 className="text-[15px] font-bold">{o.title}</h3><p className="text-[12.5px] text-muted">{o.hint}</p></div>{o.account ? <Button size="sm" variant="outline" onClick={() => nav(`/finance/reports/ledger?account=${o.account!.id}`)}>كشف حساب</Button> : null}</div>
            <div className={cn("num text-[20px] font-bold", o.balance > 0 && "text-brass")} dir="ltr">{fmt(o.balance)}</div>
            {o.rows.length ? <table className="w-full text-[13px]"><thead><tr className="text-[12px] text-muted"><th className="py-1 text-start font-semibold">الشهر</th><th className="py-1 text-end font-semibold">المستحق</th><th className="py-1 text-end font-semibold">المسدد</th></tr></thead>
              <tbody>{o.rows.slice(-6).map((r) => <tr key={r.month} className="border-t border-line/60"><td className="num py-1" dir="ltr">{label(r.month)}</td><td className="num py-1 text-end" dir="ltr">{fmt(r.added, "—")}</td><td className="num py-1 text-end" dir="ltr">{fmt(r.paid, "—")}</td></tr>)}</tbody></table> : <p className="text-[13px] text-muted">لا توجد حركة.</p>}
            {o.balance > 0 ? <p className="text-[12.5px] text-muted">السداد يتسجل بسند صرف من الخزينة والبنوك على نفس الحساب.</p> : null}
          </Card>
        ))}
      </div>
      {settle ? <SettleDialog fin={fin} row={settle} onClose={() => setSettle(null)} onSaved={(e) => { setSettle(null); setView(e); }} /> : null}
      {view ? <EntryView key={view.id} fin={fin} entry={fin.entries.find((x) => x.id === view.id) ?? view} onClose={() => setView(null)} onOpen={setView} /> : null}
    </div>
  );
}

function SettleDialog({ fin, row, onClose, onSaved }: { fin: Fin; row: VatRow; onClose: () => void; onSaved: (e: FinEntry) => void }) {
  const db = useDb();
  const { toast } = useToast();
  const money = useMemo(() => moneyAccounts(fin.ix.ordered()), [fin.ix]);
  const [d, setD] = useState({ date: today(), moneyId: money.find((a) => a.kind === "bank")?.id ?? money[0]?.id ?? "" });
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try { const e = await settleVat(db, row.month, { date: d.date, moneyId: row.payable ? d.moneyId : null }); toast({ tone: "success", title: `تمت تسوية ضريبة ${label(row.month)}` }); onSaved(e); }
    catch (e) { toast({ tone: "error", title: "تعذر", description: err(e), duration: 9000 }); } finally { setBusy(false); }
  };
  return (
    <Dialog open onClose={onClose} title={`تسوية ضريبة القيمة المضافة عن ${label(row.month)}`} footer={<div className="flex justify-end gap-2"><Button variant="ghost" onClick={onClose}>إلغاء</Button><Button loading={busy} disabled={!!row.payable && !d.moneyId} onClick={save}>{row.payable ? `سدد ${fmt(row.payable)} وسجل التسوية` : "سجل التسوية"}</Button></div>}>
      <div className="grid gap-3 text-[14px]">
        <div className="rounded-xl border border-line">{[["ضريبة المخرجات", row.output], ["ضريبة المدخلات", -row.input], ["رصيد دائن مرحل من قبل", -row.carryIn], [row.payable ? "المستحق سداده" : "رصيد دائن يرحل للشهر القادم", row.payable || row.carryOut]].map(([l, v], i) => <div key={l as string} className={cn("flex justify-between border-line/60 px-3 py-1.5", i && "border-t", i === 3 && "bg-surface-2/60 font-bold")}><span>{l}</span><span className="num" dir="ltr">{fmt(v as number, "—")}</span></div>)}</div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Input label="تاريخ التسوية" type="date" dir="ltr" value={d.date} onChange={(e) => setD({ ...d, date: e.target.value })} />
          {row.payable ? <Select label="السداد من خزينة أو بنك" value={d.moneyId} onChange={(e) => setD({ ...d, moneyId: e.target.value })} options={[{ value: "", label: "اختر" }, ...money.map((a) => ({ value: a.id, label: `${a.name.ar} (${MONEY_LABEL[a.kind]})` }))]} /> : null}
        </div>
        <p className="text-[13px] text-muted">التسوية قيد واحد يقفل ضريبة الشهر. لو اتسجل غلط، اعكسه من القيود والشهر يرجع مفتوح.</p>
      </div>
    </Dialog>
  );
}
