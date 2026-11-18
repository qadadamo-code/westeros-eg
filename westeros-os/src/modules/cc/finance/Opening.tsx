/** الأرصدة الافتتاحية: the balance of every balance-sheet account on the first day, saved as one opening entry. */
import { useMemo, useState } from "react";
import { Scale } from "lucide-react";
import { useDb } from "@/data/hooks";
import type { FinLine } from "@/data/financeTypes";
import { cn } from "@/lib/cn";
import { major } from "@/lib/money";
import { Button, Card, Input, useToast } from "@/ui";
import { ExcelImport, type ImportPlan } from "../catalog/Import";
import { ExportButton } from "../ui";
import { sheetCode, sheetNumber } from "../xlsx";
import { periodStatus } from "./journal";
import { OPENING, saveOpening } from "./journalOps";
import { useActor, useFinPerms } from "./perms";
import { typeInfo } from "./tree";
import { fmt, fromText, toText, today } from "./ui";
import { useFinance } from "./useFinance";

export default function Opening() {
  const fin = useFinance();
  const db = useDb();
  const { toast } = useToast();
  const actor = useActor();
  const can = useFinPerms().has("journal.enter");
  const cur = fin.entries.find((e) => e.kind === "opening" && e.sourceType === OPENING && !e.reversedBy) ?? null;
  const leaves = useMemo(() => fin.ix.ordered().filter((a) => a.postable && typeInfo(a.type).statement === "balance" && (a.active || cur?.lines.some((l) => l.account === a.id))), [fin.ix, cur]);
  const [date, setDate] = useState(cur?.date ?? fin.settings.startDate ?? today());
  const [vals, setVals] = useState<Record<string, { debit: string; credit: string }>>(() => Object.fromEntries((cur?.lines ?? []).map((l) => [l.account, { debit: toText(l.debit), credit: toText(l.credit) }])));
  const [busy, setBusy] = useState(false);
  const lines: FinLine[] = leaves.map((a) => ({ account: a.id, debit: fromText(vals[a.id]?.debit ?? ""), credit: fromText(vals[a.id]?.credit ?? "") })).filter((l) => l.debit || l.credit);
  const debit = lines.reduce((s, l) => s + l.debit, 0);
  const credit = lines.reduce((s, l) => s + l.credit, 0);
  const diff = debit - credit;
  const locked = !!cur && periodStatus(fin.settings, cur.date) !== "open";
  const set = (id: string, side: "debit" | "credit", v: string) => setVals({ ...vals, [id]: { debit: side === "debit" ? v : v ? "" : vals[id]?.debit ?? "", credit: side === "credit" ? v : v ? "" : vals[id]?.credit ?? "" } });
  const contra = fin.ix.byCode.get(fin.settings.links.opening ?? "");
  const balance = () => {
    if (!contra) return toast({ tone: "error", title: "حساب الأرصدة الافتتاحية غير موجود في الشجرة" });
    const rest = lines.filter((l) => l.account !== contra.id);
    const d = rest.reduce((s, l) => s + l.debit - l.credit, 0);
    setVals({ ...vals, [contra.id]: d > 0 ? { debit: "", credit: toText(d) } : { debit: toText(-d), credit: "" } });
  };
  const save = async () => {
    setBusy(true);
    try { await saveOpening(db, date, lines, actor); toast({ tone: "success", title: "تم حفظ الأرصدة الافتتاحية" }); } catch (e) { toast({ tone: "error", title: "تعذر الحفظ", description: String((e as Error).message ?? e), duration: 9000 }); } finally { setBusy(false); }
  };
  // Excel: code + debit + credit; nothing is written to the database, the boxes are filled for review
  const fromSheet = async (sheet: Record<string, string>[], dry: boolean): Promise<ImportPlan> => {
    const plan: ImportPlan = { added: [], updated: [], skipped: 0 };
    const next = { ...vals };
    for (const r of sheet) {
      const a = fin.ix.byCode.get(sheetCode(r["كود الحساب"]));
      const d = sheetNumber(r["مدين"]), c = sheetNumber(r["دائن"]);
      if (!a || !leaves.includes(a) || (!d && !c)) { plan.skipped++; continue; }
      plan.added.push({ code: a.code, name: a.name.ar });
      next[a.id] = { debit: d ? toText(major(d)) : "", credit: c ? toText(major(c)) : "" };
    }
    if (!dry) setVals(next);
    return plan;
  };
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-end gap-2">
        <Input label="تاريخ الأرصدة الافتتاحية" type="date" dir="ltr" className="w-48" value={date} disabled={locked} onChange={(e) => setDate(e.target.value)} />
        {can && !locked ? <Button variant="secondary" icon={<Scale />} onClick={balance}>موازنة الفرق على حساب الأرصدة الافتتاحية</Button> : null}
        <span className="flex-1" />
        {can && !locked ? <ExcelImport fields={[{ key: "كود الحساب", aliases: ["الكود", "code"] }, { key: "مدين", aliases: ["debit"] }, { key: "دائن", aliases: ["credit"] }]} run={fromSheet} skipNote="كود غير موجود، حساب تجميعي، أو بدون مبلغ. الاعتماد يملأ الخانات فقط، والحفظ من زر الحفظ." /> : null}
        <ExportButton file="الأرصدة-الافتتاحية" head={["كود الحساب", "اسم الحساب", "مدين", "دائن"]} rows={() => leaves.map((a) => [a.code, a.name.ar, fromText(vals[a.id]?.debit ?? "") / 100000 || "", fromText(vals[a.id]?.credit ?? "") / 100000 || ""])} />
      </div>
      {locked ? <p className="rounded-xl border border-line px-3 py-2.5 text-[14px] text-muted">شهر الأرصدة الافتتاحية مقفول. افتح الشهر أولا لتعديلها.</p> : null}
      <Card className="overflow-hidden">
        <div className="overflow-x-auto thin-scrollbar">
          <table className="w-full text-[14px]">
            <thead><tr className="text-[12.5px] text-muted"><th className="border-b border-line px-3 py-2.5 text-start font-semibold">الكود</th><th className="border-b border-line px-3 py-2.5 text-start font-semibold">الحساب</th><th className="border-b border-line px-3 py-2.5 text-start font-semibold">النوع</th><th className="w-40 border-b border-line px-3 py-2.5 text-start font-semibold">مدين</th><th className="w-40 border-b border-line px-3 py-2.5 text-start font-semibold">دائن</th></tr></thead>
            <tbody>
              {leaves.map((a) => (
                <tr key={a.id} className="border-t border-line/60">
                  <td className="num px-3 py-1.5 text-muted" dir="ltr">{a.code}</td>
                  <td className="px-3 py-1.5">{a.name.ar}<span className="block text-[12px] text-muted">{fin.ix.path(a.code).slice(1, -1).map((p) => p.name.ar).join(" / ")}</span></td>
                  <td className="px-3 py-1.5 text-muted">{typeInfo(a.type).ar}</td>
                  <td className="px-3 py-1.5"><Input aria-label={`مدين ${a.name.ar}`} dir="ltr" inputMode="decimal" disabled={!can || locked} value={vals[a.id]?.debit ?? ""} onChange={(e) => set(a.id, "debit", e.target.value)} /></td>
                  <td className="px-3 py-1.5"><Input aria-label={`دائن ${a.name.ar}`} dir="ltr" inputMode="decimal" disabled={!can || locked} value={vals[a.id]?.credit ?? ""} onChange={(e) => set(a.id, "credit", e.target.value)} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <div className="sticky bottom-3 z-10 flex flex-wrap items-center gap-x-5 gap-y-2 rounded-2xl border border-line bg-surface px-4 py-3 text-[14px] shadow-lg">
        <span>مجموع المدين <b className="num" dir="ltr">{fmt(debit)}</b></span>
        <span>مجموع الدائن <b className="num" dir="ltr">{fmt(credit)}</b></span>
        <span className={cn("font-bold", diff ? "text-danger" : "text-ok")}>{diff ? <>الفرق <span className="num" dir="ltr">{fmt(Math.abs(diff))}</span></> : "متوازن"}</span>
        <span className="flex-1" />
        {can ? <Button loading={busy} disabled={!!diff || !lines.length || locked} onClick={save}>حفظ الأرصدة الافتتاحية</Button> : null}
      </div>
    </div>
  );
}
