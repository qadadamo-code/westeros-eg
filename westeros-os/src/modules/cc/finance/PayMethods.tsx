/**
 * طرق الدفع (Mohammed 2026-11-24): تعريف طرق الدفع في البيع (بتظهر في دفع الكاشير) وفي الشراء والمصاريف،
 * وكل طريقة مربوطة بحساب خزينة أو بنك، وتتفعل أو تتقفل.
 */
import { useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { useDb } from "@/data/hooks";
import type { PayMethodDef } from "@/data/financeTypes";
import { uuid } from "@/lib/id";
import { Button, Card, IconButton, Input, Select, Switch, useToast } from "@/ui";
import { saveSettings } from "./ops";
import { BASE_LABEL, payMethodProblem, payMethodsOf, type PaySide } from "./payMethods";
import { MONEY_LABEL, moneyAccounts } from "./treasury";
import { useFinance } from "./useFinance";
import { BranchChips } from "./ui";

const err = (e: unknown) => String((e as Error)?.message ?? e);

export function PayMethods({ side, can }: { side: PaySide; can: boolean }) {
  const db = useDb();
  const fin = useFinance();
  const { toast } = useToast();
  const list = payMethodsOf(fin.settings, side);
  const money = useMemo(() => moneyAccounts(fin.ix.ordered()), [fin.ix]);
  const [d, setD] = useState({ name: "", base: "cash" as NonNullable<PayMethodDef["base"]>, accountId: "" });
  const save = async (next: PayMethodDef[]) => {
    try {
      await saveSettings(db, { payMethods: { ...(fin.settings.payMethods ?? {}), [side]: next } });
    } catch (e) {
      toast({ tone: "error", title: "تعذر الحفظ", description: err(e) });
    }
  };
  const edit = (m: PayMethodDef, p: Partial<PayMethodDef>) => {
    const n = { ...m, ...p };
    const problem = payMethodProblem(n, list, m.id);
    if (problem) return toast({ tone: "error", title: problem });
    void save(list.map((x) => (x.id === m.id ? n : x)));
  };
  const problem = payMethodProblem(d, list);
  const add = () => {
    if (problem) return toast({ tone: "error", title: problem });
    void save([...list, { id: uuid(), name: d.name.trim(), ...(side === "sales" ? { base: d.base } : {}), accountId: d.accountId, active: true }]);
    setD({ ...d, name: "" });
  };
  const accountOptions = [{ value: "", label: "اختر الخزينة أو البنك" }, ...money.map((a) => ({ value: a.id, label: `${a.name.ar} (${MONEY_LABEL[a.kind]})` }))];
  const baseOptions = (Object.keys(BASE_LABEL) as NonNullable<PayMethodDef["base"]>[]).map((k) => ({ value: k, label: BASE_LABEL[k] }));
  return (
    <Card className="grid gap-3 p-4">
      <p className="text-[14px] font-semibold">{side === "sales" ? "طرق الدفع في البيع" : "طرق الدفع في الشراء والمصاريف"}</p>
      <p className="text-[12.5px] text-muted">
        {side === "sales"
          ? "الطرق المفعلة بتظهر في شاشة الدفع في الكاشير، وفلوس كل طريقة بتروح على الخزينة أو البنك المربوط بيها."
          : "الطرق المفعلة بتظهر في فواتير الشراء النقدية وسداد الموردين والمصروفات، واختيار الطريقة بيختار الخزينة أو البنك بتاعها."}
      </p>
      {list.length ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-[13.5px]">
            <thead>
              <tr className="border-b border-line text-[12.5px] text-muted">
                <th className="p-2 text-start">الطريقة</th>{side === "sales" ? <th className="p-2 text-start">نوعها في الكاشير</th> : null}<th className="p-2 text-start">الخزينة أو البنك</th><th className="p-2 text-start">مفعلة</th>{side === "sales" ? <th className="p-2 text-start">الفروع</th> : null}<th />
              </tr>
            </thead>
            <tbody>
              {list.map((m) => (
                <tr key={m.id} className="border-b border-line/60">
                  <td className="p-2"><Input aria-label="اسم الطريقة" disabled={!can} defaultValue={m.name} onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== m.name) edit(m, { name: v }); }} /></td>
                  {side === "sales" ? <td className="p-2"><Select aria-label="النوع" disabled={!can} value={m.base ?? "card"} onChange={(e) => edit(m, { base: e.target.value as PayMethodDef["base"] })} options={baseOptions} /></td> : null}
                  <td className="p-2"><Select aria-label="الحساب" disabled={!can} value={m.accountId} onChange={(e) => edit(m, { accountId: e.target.value })} options={accountOptions} /></td>
                  <td className="p-2"><Switch checked={m.active} disabled={!can} onChange={(v) => edit(m, { active: v })} label="مفعلة" /></td>
                  {side === "sales" ? <td className="p-2"><BranchChips off={m.offBranches} disabled={!can} onChange={(off) => edit(m, { offBranches: off })} /></td> : null}
                  <td className="p-2 text-end">{can ? <IconButton size="sm" label="حذف الطريقة" onClick={() => void save(list.filter((x) => x.id !== m.id))}><Trash2 /></IconButton> : null}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <p className="rounded-xl border border-dashed border-line p-3 text-[13px] text-muted">{side === "sales" ? "مفيش طرق دفع متعرفة لسه، فالكاشير بيعرض الطرق العادية (كاش، فيزا، محفظة، انستاباي)." : "مفيش طرق دفع متعرفة لسه، فبتختار الخزينة أو البنك بإيدك."}</p>}
      {can ? (
        <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); add(); }}>
          <Input wrapClassName="min-w-48 flex-1" label="طريقة جديدة" placeholder={side === "sales" ? "مثلاً: كاش، فيزا البنك الأهلي، فودافون كاش" : "مثلاً: نقدي من الخزينة، تحويل بنكي"} value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} />
          {side === "sales" ? <Select label="نوعها في الكاشير" value={d.base} onChange={(e) => setD({ ...d, base: e.target.value as typeof d.base })} options={baseOptions} /> : null}
          <Select label="الخزينة أو البنك" value={d.accountId} onChange={(e) => setD({ ...d, accountId: e.target.value })} options={accountOptions} />
          <Button type="submit" variant="outline" icon={<Plus />}>إضافة</Button>
        </form>
      ) : null}
    </Card>
  );
}

/**
 * طريقة الدفع في الشراء والمصاريف: the active methods of الحسابات > المشتريات > طرق الدفع; picking one picks its till or bank.
 * Without methods defined it falls back to the plain list (or nothing when `fallback` is not given).
 */
export function BuyMethodSelect({ settings, value, onPick, fallback, label = "طريقة الدفع" }: { settings: Partial<import("@/data/financeTypes").FinSettingsData>; value: string; onPick: (name: string, accountId: string | null) => void; fallback?: string[]; label?: string }) {
  const list = payMethodsOf(settings, "buying").filter((m) => m.active);
  if (!list.length) return fallback ? <Select label={label} value={value} onChange={(e) => onPick(e.target.value, null)} options={fallback.map((m) => ({ value: m, label: m }))} /> : null;
  const cur = list.find((m) => m.name === value);
  return <Select label={label} value={cur?.id ?? ""} onChange={(e) => { const m = list.find((x) => x.id === e.target.value); if (m) onPick(m.name, m.accountId); }} options={[...(cur ? [] : [{ value: "", label: "اختر طريقة الدفع" }]), ...list.map((m) => ({ value: m.id, label: m.name }))]} />;
}
