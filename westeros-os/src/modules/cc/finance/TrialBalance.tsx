/** ميزان المراجعة: opening, movement and closing of every account, at any level of the tree. */
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CheckCircle2, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/cn";
import { Card, Select, Switch } from "@/ui";
import { ExportButton } from "../ui";
import { trialBalance } from "./journal";
import { MAX_LEVEL } from "./tree";
import { Amount, BranchSelect, fmt, periodLabel, periodOf, PeriodPicker, PrintButton, printTable, type Period } from "./ui";
import { useFinance } from "./useFinance";

export default function TrialBalance() {
  const fin = useFinance();
  const nav = useNavigate();
  const [period, setPeriod] = useState<Period>(periodOf("year", fin.settings.yearStartMonth));
  const [branch, setBranch] = useState("");
  const [level, setLevel] = useState("leaves");
  const [mode, setMode] = useState<"full" | "balances" | "totals">("full");
  const [hideZero, setHideZero] = useState(true);
  const t = useMemo(() => trialBalance(fin.accounts, fin.entries, { from: period.from, to: period.to, branchId: branch || null, hideZero, ...(level === "leaves" ? { leavesOnly: true } : { level: Number(level) }) }), [fin.accounts, fin.entries, period, branch, level, hideZero]);
  const cols = mode === "balances" ? (["closeDebit", "closeCredit"] as const) : mode === "totals" ? (["moveDebit", "moveCredit"] as const) : (["openDebit", "openCredit", "moveDebit", "moveCredit", "closeDebit", "closeCredit"] as const);
  const HEAD: Record<(typeof cols)[number], string> = { openDebit: "افتتاحي مدين", openCredit: "افتتاحي دائن", moveDebit: "حركة مدين", moveCredit: "حركة دائن", closeDebit: "ختامي مدين", closeCredit: "ختامي دائن" };
  const head = ["الكود", "الحساب", ...cols.map((c) => HEAD[c])];
  const sub = `${periodLabel(period)} · ${branch ? fin.branchName(branch) : "كل الفروع"}`;
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-end gap-2">
        <PeriodPicker value={period} onChange={setPeriod} startMonth={fin.settings.yearStartMonth} />
        <BranchSelect fin={fin} value={branch} onChange={setBranch} />
        <Select label="المستوى" className="w-48" value={level} onChange={(e) => setLevel(e.target.value)} options={[{ value: "leaves", label: "الحسابات النهائية فقط" }, ...Array.from({ length: MAX_LEVEL }, (_, i) => ({ value: String(i + 1), label: `حتى المستوى ${i + 1}` }))]} />
        <Select label="العرض" className="w-44" value={mode} onChange={(e) => setMode(e.target.value as typeof mode)} options={[{ value: "full", label: "افتتاحي وحركة وختامي" }, { value: "balances", label: "بالأرصدة" }, { value: "totals", label: "بالمجاميع" }]} />
        <div className="pb-1"><Switch checked={hideZero} onChange={setHideZero} label="إخفاء الحسابات بدون حركة" /></div>
        <span className="flex-1" />
        <ExportButton file="ميزان-المراجعة" head={head} rows={() => t.rows.map((r) => [r.account.code, r.account.name.ar, ...cols.map((c) => Math.round(r[c] / 1000) / 100)])} />
        <PrintButton onClick={() => printTable("ميزان المراجعة", sub, head, t.rows.map((r) => [r.account.code, { text: r.account.name.ar, indent: level === "leaves" ? 0 : r.level - 1, bold: !r.account.postable }, ...cols.map((c) => ({ text: r[c] ? fmt(r[c]) : "", align: "end" as const }))]), ["", "الإجمالي", ...cols.map((c) => ({ text: fmt(t.sum[c]), align: "end" as const }))])} />
      </div>
      <div className={cn("flex items-center gap-2 rounded-xl border px-3 py-2.5 text-[14px] font-semibold", t.balanced ? "border-ok/40 text-ok" : "border-danger/50 text-danger")}>
        {t.balanced ? <CheckCircle2 className="size-4.5" /> : <TriangleAlert className="size-4.5" />}
        {t.balanced ? "الميزان متوازن: مجموع المدين يساوي مجموع الدائن" : "الميزان غير متوازن، راجع القيود"}
      </div>
      <Card className="overflow-hidden">
        <div className="overflow-x-auto thin-scrollbar">
          <table className="w-full text-[14px]">
            <thead><tr className="text-[12.5px] text-muted">{head.map((h, i) => <th key={h} className={cn("border-b border-line px-3 py-2.5 font-semibold", i > 1 ? "text-end" : "text-start")}>{h}</th>)}</tr></thead>
            <tbody>
              {t.rows.map((r) => (
                <tr key={r.account.id} className="cursor-pointer border-t border-line/60 hover:bg-surface-2" onClick={() => nav(`/finance/ledger?account=${r.account.id}`)}>
                  <td className="num px-3 py-2 text-muted" dir="ltr">{r.account.code}</td>
                  <td className={cn("px-3 py-2", !r.account.postable && "font-bold")} style={{ paddingInlineStart: level === "leaves" ? 12 : 12 + (r.level - 1) * 18 }}>{r.account.name.ar}</td>
                  {cols.map((c) => <td key={c} className={cn("px-3 py-2 text-end", !r.account.postable && "font-bold")}><Amount value={r[c]} zero="" /></td>)}
                </tr>
              ))}
              {!t.rows.length ? <tr><td colSpan={head.length} className="px-3 py-8 text-center text-muted">لا توجد حركات في هذه الفترة</td></tr> : null}
              <tr className="border-t border-line bg-surface-2 font-bold"><td className="px-3 py-2.5" colSpan={2}>الإجمالي</td>{cols.map((c) => <td key={c} className="px-3 py-2.5 text-end"><Amount value={t.sum[c]} zero="0.00" /></td>)}</tr>
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
