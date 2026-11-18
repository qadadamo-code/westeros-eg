/** كشف حساب: one account's lines over a period with the running balance; a parent account shows everything under it. */
import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { FileText } from "lucide-react";
import type { FinEntry } from "@/data/financeTypes";
import { Card, EmptyState, Select, StatTile } from "@/ui";
import { ExportButton } from "../ui";
import { fmtDay } from "../lib";
import { SOURCE_LABEL } from "./Journal";
import { entryRef, KIND_LABEL, statement } from "./journal";
import { isDebit, typeInfo } from "./tree";
import { AccountSelect, Amount, BranchSelect, fmt, periodLabel, periodOf, PeriodPicker, PrintButton, printTable, type Period } from "./ui";
import { useFinance } from "./useFinance";

export default function Ledger() {
  const fin = useFinance();
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const id = params.get("account") ?? "";
  const [period, setPeriod] = useState<Period>(() => (params.get("from") || params.get("to") ? { preset: "custom", from: params.get("from"), to: params.get("to") } : periodOf("year", fin.settings.yearStartMonth)));
  const [branch, setBranch] = useState(params.get("branch") ?? "");
  const [centre, setCentre] = useState("");
  const acc = fin.byId.get(id);
  // a parent: its statement is the statement of all the leaves under it
  const s = useMemo(() => {
    if (!acc) return null;
    const ids = new Set([acc.id, ...fin.ix.descendants(acc.code).map((d) => d.id)]);
    const view: FinEntry[] = ids.size === 1 ? fin.entries : fin.entries.map((e) => ({ ...e, lines: e.lines.map((l) => (ids.has(l.account) ? { ...l, memo: l.memo ?? fin.byId.get(l.account)?.name.ar, account: acc.id } : l)) }));
    return statement(acc, view, { from: period.from, to: period.to, branchId: branch || null, centreId: centre || null });
  }, [acc, fin.entries, fin.ix, fin.byId, period, branch, centre]);
  const head = ["التاريخ", "رقم القيد", "النوع", "البيان", "مدين", "دائن", "الرصيد"];
  const text = (r: NonNullable<typeof s>["rows"][number]) => r.line.memo ? `${r.entry.memo}${r.entry.memo ? " · " : ""}${r.line.memo}` : r.entry.memo;
  const kind = (e: FinEntry) => (e.sourceType && SOURCE_LABEL[e.sourceType]) || KIND_LABEL[e.kind];
  const sub = acc ? `${acc.code} · ${acc.name.ar} · ${periodLabel(period)}${branch ? ` · ${fin.branchName(branch)}` : ""}` : "";
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-end gap-2">
        <AccountSelect fin={fin} label="الحساب" leaf={false} className="w-72" value={id} onChange={(v) => setParams(v ? { account: v } : {}, { replace: true })} />
        <PeriodPicker value={period} onChange={setPeriod} startMonth={fin.settings.yearStartMonth} />
        <BranchSelect fin={fin} value={branch} onChange={setBranch} />
        {fin.centres.length ? <BranchSelectLike label="مركز التكلفة" value={centre} onChange={setCentre} options={fin.centres.map((c) => ({ value: c.id, label: c.name.ar }))} /> : null}
        <span className="flex-1" />
        {s && acc ? <>
          <ExportButton file={`كشف-حساب-${acc.code}`} head={head} rows={() => [[period.from ?? "", "", "", "رصيد افتتاحي", "", "", Math.round(s.opening / 1000) / 100], ...s.rows.map((r) => [r.entry.date, entryRef(r.entry), kind(r.entry), text(r), Math.round(r.debit / 1000) / 100, Math.round(r.credit / 1000) / 100, Math.round(r.balance / 1000) / 100])]} />
          <PrintButton onClick={() => printTable("كشف حساب", sub, head, [["", "", "", "رصيد افتتاحي", "", "", { text: fmt(s.opening), align: "end" }], ...s.rows.map((r) => [fmtDay(r.entry.date), entryRef(r.entry), kind(r.entry), text(r), { text: r.debit ? fmt(r.debit) : "", align: "end" as const }, { text: r.credit ? fmt(r.credit) : "", align: "end" as const }, { text: fmt(r.balance), align: "end" as const }])], ["", "", "", "الإجمالي والرصيد الختامي", { text: fmt(s.debit), align: "end" }, { text: fmt(s.credit), align: "end" }, { text: fmt(s.closing), align: "end" }])} />
        </> : null}
      </div>
      {!acc || !s ? <Card className="p-6"><EmptyState icon={<FileText />} title="اختر حساب لعرض كشفه" body="اختر أي حساب من القائمة، أو اضغط على الحساب من شجرة الحسابات." /></Card> : (
        <>
          <div className="grid gap-3 sm:grid-cols-4">
            <StatTile label="رصيد افتتاحي" value={<Amount value={s.opening} tone="auto" zero="0.00" />} />
            <StatTile label="إجمالي المدين" value={<Amount value={s.debit} zero="0.00" />} />
            <StatTile label="إجمالي الدائن" value={<Amount value={s.credit} zero="0.00" />} />
            <StatTile label={`الرصيد الختامي (${isDebit(acc.type) ? "مدين" : "دائن"})`} value={<Amount value={s.closing} tone="auto" zero="0.00" />} sub={typeInfo(acc.type).ar} />
          </div>
          <Card className="overflow-hidden">
            <div className="overflow-x-auto thin-scrollbar">
              <table className="w-full text-[14px]">
                <thead><tr className="text-[12.5px] text-muted">{head.map((h, i) => <th key={h} className={`border-b border-line px-3 py-2.5 font-semibold ${i > 3 ? "text-end" : "text-start"}`}>{h}</th>)}</tr></thead>
                <tbody>
                  <tr className="bg-surface-2"><td className="px-3 py-2" colSpan={6}>رصيد افتتاحي</td><td className="px-3 py-2 text-end font-semibold"><Amount value={s.opening} tone="auto" zero="0.00" /></td></tr>
                  {s.rows.map((r, i) => (
                    <tr key={`${r.entry.id}-${i}`} className="cursor-pointer border-t border-line/60 hover:bg-surface-2" onClick={() => nav(`/finance/journal?entry=${r.entry.id}`)}>
                      <td className="num px-3 py-2">{fmtDay(r.entry.date)}</td>
                      <td className="num px-3 py-2 font-semibold" dir="ltr">{entryRef(r.entry)}</td>
                      <td className="px-3 py-2 text-muted">{kind(r.entry)}</td>
                      <td className="px-3 py-2">{text(r) || "—"}</td>
                      <td className="px-3 py-2 text-end"><Amount value={r.debit} zero="" /></td>
                      <td className="px-3 py-2 text-end"><Amount value={r.credit} zero="" /></td>
                      <td className="px-3 py-2 text-end font-semibold"><Amount value={r.balance} tone="auto" zero="0.00" /></td>
                    </tr>
                  ))}
                  {!s.rows.length ? <tr><td colSpan={7} className="px-3 py-8 text-center text-muted">لا توجد حركات في هذه الفترة</td></tr> : null}
                  <tr className="border-t border-line bg-surface-2 font-bold"><td className="px-3 py-2" colSpan={4}>الإجمالي والرصيد الختامي</td><td className="px-3 py-2 text-end"><Amount value={s.debit} zero="0.00" /></td><td className="px-3 py-2 text-end"><Amount value={s.credit} zero="0.00" /></td><td className="px-3 py-2 text-end"><Amount value={s.closing} tone="auto" zero="0.00" /></td></tr>
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}

function BranchSelectLike({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return <Select label={label} className="w-44" value={value} onChange={(e) => onChange(e.target.value)} options={[{ value: "", label: "الكل" }, ...options]} />;
}
