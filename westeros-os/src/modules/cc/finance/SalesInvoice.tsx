/** فاتورة مبيعات (Mohammed 2026-11-24): بيع خامات ومنتجات مصنعة من المخزن للموظفين بس، بتكلفة الصنف ظاهرة وسعر بيع بيتكتب. */
import { useMemo, useState } from "react";
import { Plus, ReceiptText, Trash2 } from "lucide-react";
import { useDb, useLive } from "@/data/hooks";
import type { StockItem } from "@/data/inventoryTypes";
import { Badge, Button, Card, Dialog, EmptyState, IconButton, Input, Segmented, Select, Textarea, useToast } from "@/ui";
import { lineUnit } from "../lib";
import { fmtDay } from "../lib";
import { EMPLOYEE } from "./payroll";
import { useActor, useFinPerms } from "./perms";
import { postStaffSale, saleTotal, STAFF_SALE, staffSaleOf, staffSaleProblem, type StaffSaleInput } from "./staffSale";
import { MONEY_LABEL, moneyAccounts } from "./treasury";
import { AccountSelect, fmt, fromText, today, useBalanceHint } from "./ui";
import { useFinance, type Fin } from "./useFinance";

const err = (e: unknown) => String((e as Error)?.message ?? e);

export default function SalesInvoice() {
  const fin = useFinance();
  const perms = useFinPerms();
  const can = perms.has("vouchers");
  const docs = useLive("finDocs").data;
  const [add, setAdd] = useState(false);
  const list = useMemo(() => docs.filter((d) => d.kind === STAFF_SALE).sort((a, b) => (b.date ?? "").localeCompare(a.date ?? "") || Number(b.code) - Number(a.code)), [docs]);
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-[13px] text-muted">بيع خامات أو منتجات مصنعة من المخزن لموظف. التكلفة بتظهر جنب كل صنف، وسعر البيع بتكتبه انت. المبلغ بيتسجل على حساب الموظف (بيتخصم من المرتب) أو بيتدفع نقدي.</p>
        {can ? <Button className="ms-auto" icon={<Plus />} onClick={() => setAdd(true)}>فاتورة مبيعات جديدة</Button> : null}
      </div>
      {list.length ? (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-[14px]">
            <thead><tr className="text-[12.5px] text-muted">{["رقم", "التاريخ", "الموظف", "الدفع", "التكلفة", "البيع", ""].map((h) => <th key={h} className="border-b border-line px-3 py-2.5 text-start font-semibold">{h}</th>)}</tr></thead>
            <tbody>{list.map((d) => { const x = staffSaleOf(d); return (
              <tr key={d.id} className="border-t border-line/60">
                <td className="num px-3 py-2 font-semibold" dir="ltr">{d.code}</td>
                <td className="px-3 py-2">{fmtDay(d.date ?? "")}</td>
                <td className="px-3 py-2">{d.name}</td>
                <td className="px-3 py-2">{x.payment === "cash" ? fin.byId.get(x.moneyId ?? "")?.name.ar ?? "نقدي" : "على حساب الموظف"}</td>
                <td className="num px-3 py-2" dir="ltr">{fmt(x.cost)}</td>
                <td className="num px-3 py-2 font-semibold" dir="ltr">{fmt(x.total)}</td>
                <td className="px-3 py-2"><Badge size="sm" tone="ok">{x.lines.length} صنف</Badge></td>
              </tr>); })}</tbody>
          </table>
        </Card>
      ) : <EmptyState icon={<ReceiptText />} title="مفيش فواتير مبيعات لسه" />}
      {add ? <InvoiceDialog fin={fin} onClose={() => setAdd(false)} /> : null}
    </div>
  );
}

type Row = { key: number; itemId: string; locationId: string; qty: string; price: string };
let seq = 0;
const blank = (locationId = ""): Row => ({ key: ++seq, itemId: "", locationId, qty: "", price: "" });

function InvoiceDialog({ fin, onClose }: { fin: Fin; onClose: () => void }) {
  const db = useDb();
  const { toast } = useToast();
  const actor = useActor();
  const docs = useLive("finDocs").data;
  const items = useLive("stockItems").data;
  const locs = useLive("storageLocations").data;
  const levels = useLive("stockLevels").data;
  const staff = useMemo(() => docs.filter((d) => d.kind === EMPLOYEE && d.status !== "stopped").sort((a, b) => a.name.localeCompare(b.name, "ar")), [docs]);
  const money = useMemo(() => moneyAccounts(fin.ix.ordered()), [fin.ix]);
  const itemById = useMemo(() => new Map(items.map((i) => [i.id, i] as [string, StockItem])), [items]);
  // the revenue the sale goes to: other income first (إيرادات أخرى)
  const revenue = useMemo(() => fin.ix.ordered().filter((a) => a.type === "revenue" && a.postable && a.active), [fin.ix]);
  const [d, setD] = useState({ employeeId: "", date: today(), payment: "employee" as "employee" | "cash", moneyId: money[0]?.id ?? "", revenueId: revenue.find((a) => a.code.startsWith("42"))?.id ?? revenue[0]?.id ?? "", note: "" });
  const [rows, setRows] = useState<Row[]>(() => [blank(locs.find((l) => l.active)?.id ?? "")]);
  const [busy, setBusy] = useState(false);
  const moneyHint = useBalanceHint(fin, d.payment === "cash" ? d.moneyId : null);
  const set = (key: number, p: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...p } : r)));
  /** cost of one line unit in a warehouse: the warehouse's average */
  const unitCost = (itemId: string, locationId: string) => {
    const it = itemById.get(itemId);
    const lv = levels.find((l) => l.itemId === itemId && l.locationId === locationId);
    if (!it || !lv || !(lv.qty > 0)) return null;
    return Math.round((lv.value / lv.qty) * lineUnit(it).factor);
  };
  const have = (itemId: string, locationId: string) => {
    const it = itemById.get(itemId);
    const lv = levels.find((l) => l.itemId === itemId && l.locationId === locationId);
    return it && lv ? lv.qty / lineUnit(it).factor : 0;
  };
  const input: StaffSaleInput = { employeeId: d.employeeId, date: d.date, payment: d.payment, moneyId: d.payment === "cash" ? d.moneyId : null, revenueId: d.revenueId, note: d.note, lines: rows.filter((r) => r.itemId).map((r) => ({ itemId: r.itemId, locationId: r.locationId, qty: Number(r.qty) || 0, price: fromText(r.price) })) };
  const total = saleTotal(input.lines);
  const cost = input.lines.reduce((s, l) => s + Math.round((unitCost(l.itemId, l.locationId) ?? 0) * l.qty), 0);
  const problem = staffSaleProblem(input);
  const itemOptions = useMemo(() => [{ value: "", label: "اختر الخام أو المنتج" }, ...items.filter((i) => i.active !== false).sort((a, b) => a.name.ar.localeCompare(b.name.ar, "ar")).map((i) => ({ value: i.id, label: `${i.name.ar}${i.sku ? ` · ${i.sku}` : ""}` }))], [items]);
  const locOptions = useMemo(() => [{ value: "", label: "اختر المخزن" }, ...locs.filter((l) => l.active).map((l) => ({ value: l.id, label: l.name.ar }))], [locs]);
  const save = async () => {
    setBusy(true);
    try {
      const doc = await postStaffSale(db, input, actor);
      toast({ tone: "success", title: `تم تسجيل فاتورة المبيعات ${doc.code}` });
      onClose();
    } catch (e) { toast({ tone: "error", title: "تعذر الحفظ", description: err(e), duration: 9000 }); } finally { setBusy(false); }
  };
  return (
    <Dialog open onClose={onClose} size="xl" title="فاتورة مبيعات للموظفين"
      footer={<div className="flex flex-wrap items-center justify-end gap-2">
        {problem ? <span className="me-auto text-[13px] font-semibold text-danger">{problem}</span> : <span className="me-auto text-[14px]">التكلفة <b className="num" dir="ltr">{fmt(cost)}</b> · البيع <b className="num" dir="ltr">{fmt(total)}</b> ج.م</span>}
        <Button variant="ghost" onClick={onClose}>إلغاء</Button><Button loading={busy} disabled={!!problem} onClick={save}>حفظ وترحيل</Button>
      </div>}>
      <div className="grid gap-3">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Select label="الموظف" value={d.employeeId} onChange={(e) => setD({ ...d, employeeId: e.target.value })} options={[{ value: "", label: staff.length ? "اختر الموظف" : "مفيش موظفين متسجلين في الحسابات" }, ...staff.map((s) => ({ value: s.id, label: s.name }))]} />
          <Input label="التاريخ" type="date" dir="ltr" value={d.date} onChange={(e) => setD({ ...d, date: e.target.value })} />
          <div className="grid gap-1"><span className="text-[13px] font-semibold text-muted">الدفع</span><Segmented label="الدفع" value={d.payment} onChange={(p) => setD({ ...d, payment: p })} options={[{ value: "employee", label: "على حساب الموظف" }, { value: "cash", label: "نقدي" }]} /></div>
          {d.payment === "cash" ? <Select label="إلى خزينة أو بنك" value={d.moneyId} hint={moneyHint} onChange={(e) => setD({ ...d, moneyId: e.target.value })} options={[{ value: "", label: "اختر" }, ...money.map((a) => ({ value: a.id, label: `${a.name.ar} (${MONEY_LABEL[a.kind]})` }))]} /> : null}
          <AccountSelect fin={fin} label="حساب الإيراد" value={d.revenueId} onChange={(v) => setD({ ...d, revenueId: v })} filter={(a) => a.type === "revenue"} />
        </div>
        <div className="grid gap-2">
          {rows.map((r, i) => {
            const it = itemById.get(r.itemId);
            const uc = r.itemId && r.locationId ? unitCost(r.itemId, r.locationId) : null;
            const unit = it ? lineUnit(it).label : "";
            return (
              <div key={r.key} className="grid items-end gap-2 rounded-xl border border-line p-2 sm:grid-cols-[2fr_1.3fr_.8fr_1fr_1fr_auto]">
                <Select label={i ? undefined : "الصنف"} value={r.itemId} onChange={(e) => set(r.key, { itemId: e.target.value })} options={itemOptions} />
                <Select label={i ? undefined : "من مخزن"} value={r.locationId} onChange={(e) => set(r.key, { locationId: e.target.value })} options={locOptions} hint={r.itemId && r.locationId ? `المتوفر ${Math.round(have(r.itemId, r.locationId) * 100) / 100} ${unit}` : undefined} />
                <Input label={i ? undefined : "الكمية"} dir="ltr" inputMode="decimal" className="num" value={r.qty} onChange={(e) => set(r.key, { qty: e.target.value })} hint={unit || undefined} />
                <div className="grid gap-1.5">{i ? null : <span className="text-[13px] font-semibold text-ink-2">التكلفة</span>}<div className="num flex h-11 items-center rounded-xl bg-surface-2 px-3 text-muted" dir="ltr">{uc == null ? "—" : fmt(uc)}</div>{unit ? <span className="text-[12.5px] text-muted">لكل {unit}</span> : null}</div>
                <Input label={i ? undefined : "سعر البيع"} dir="ltr" inputMode="decimal" className="num" placeholder="اكتب السعر" value={r.price} onChange={(e) => set(r.key, { price: e.target.value })} hint={unit ? `لكل ${unit}` : undefined} />
                <IconButton label="شيل السطر" disabled={rows.length <= 1} onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}><Trash2 /></IconButton>
              </div>
            );
          })}
          <div><Button size="sm" variant="soft" icon={<Plus />} onClick={() => setRows((rs) => [...rs, blank(rs[rs.length - 1]?.locationId ?? "")])}>إضافة صنف</Button></div>
        </div>
        <Textarea label="ملاحظة" rows={2} value={d.note} onChange={(e) => setD({ ...d, note: e.target.value })} />
      </div>
    </Dialog>
  );
}
