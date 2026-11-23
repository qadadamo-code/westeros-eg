/** خدمة التوصيل (قائمة رئيسية في الإعدادات زي المستخدمين، 2026-11-23) (Mohammed, 2026-11-22): طرق التوصيل وتحصيل رسومها ونسبة التحصيل، ومندوبو التوصيل. */
import { useMemo, useState } from "react";
import { Bike, Pencil, Plus, Trash2, Truck } from "lucide-react";
import { useDb, useLive } from "@/data/hooks";
import type { DeliveryMethod, FinDoc } from "@/data/financeTypes";
import { uuid } from "@/lib/id";
import { Badge, Button, Card, CardHeader, Dialog, IconButton, Input, Select, Switch, Textarea, useToast } from "@/ui";
import { BENEFICIARIES, BENEFICIARY_LABEL, COLLECTION_LABEL, DRIVER, driverOf, feeAccountText, methodsOf, methodProblem, newMethod, removeDriver, removeMethod, ROLE_LABEL, saveDriver, saveMethod, TYPE_LABEL, type DriverData } from "../finance/delivery";
import { EMPLOYEE } from "../finance/payroll";
import { netByCode } from "../finance/statements";
import { BranchSelect, Confirm, fmt, fromText, toText } from "../finance/ui";
import { useFinance, type Fin } from "../finance/useFinance";

const err = (e: unknown) => String((e as Error)?.message ?? e);

export default function DeliveryList({ readOnly }: { readOnly: boolean }) {
  const fin = useFinance();
  const db = useDb();
  const { toast } = useToast();
  const docs = useLive("finDocs").data;
  const methods = methodsOf(fin.settings);
  const drivers = docs.filter((d) => d.kind === DRIVER).sort((a, b) => Number(b.status === "active") - Number(a.status === "active") || a.name.localeCompare(b.name, "ar"));
  const employees = docs.filter((d) => d.kind === "employee" || d.kind === EMPLOYEE);
  const balances = useMemo(() => netByCode(fin.accounts, fin.entries, {}), [fin.accounts, fin.entries]);
  const [method, setMethod] = useState<DeliveryMethod | null>(null);
  const [driver, setDriver] = useState<FinDoc | "new" | null>(null);
  const [drop, setDrop] = useState<{ kind: "method"; m: DeliveryMethod } | { kind: "driver"; d: FinDoc } | null>(null);
  const [busy, setBusy] = useState(false);
  const remove = async () => {
    if (!drop) return;
    setBusy(true);
    try {
      const r = drop.kind === "method" ? await removeMethod(db, drop.m.id) : await removeDriver(db, drop.d);
      toast({ tone: "success", title: r === "removed" ? "تم الحذف" : "اتوقف بدل الحذف", description: r === "stopped" ? "عليه حركات متسجلة، فبيفضل موجود موقوف عشان الحسابات ما تتلخبطش" : undefined });
      setDrop(null);
    } catch (e) { toast({ tone: "error", title: "تعذر الحذف", description: err(e) }); } finally { setBusy(false); }
  };
  return (
    <div className="grid items-start gap-5 lg:grid-cols-2">
      <Card>
        <CardHeader icon={<Truck />} title="طرق التوصيل" subtitle="لكل طريقة: مين بيوصل، إزاي الرسوم بتتحصل، الرسوم لصالح مين ونسبة التحصيل. الباقي بيروح لحساب الإيرادات." />
        <ul className="grid gap-2 px-5 pb-3">
          {methods.map((m) => (
            <li key={m.id} className="grid gap-1.5 rounded-xl border border-line p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-bold">{m.name}</span>
                <Badge size="sm" tone={m.type === "external" ? "info" : "brass"}>{TYPE_LABEL[m.type]}</Badge>
                {m.active ? null : <Badge size="sm" tone="neutral">موقوفة</Badge>}
                <span className="flex-1" />
                <IconButton label="تعديل" disabled={readOnly} onClick={() => setMethod(m)}><Pencil /></IconButton>
                <IconButton label="حذف" disabled={readOnly} onClick={() => setDrop({ kind: "method", m })}><Trash2 /></IconButton>
              </div>
              <p className="text-[13.5px] text-muted">
                {m.type === "external" ? `${m.company} · ${COLLECTION_LABEL[m.collection]}${m.collection === "monthly" ? ` · ${fmt(m.monthlyFee)} ج.م في الشهر` : ""}` : "تحصيل مع فاتورة الزبون"}
              </p>
              <p className="text-[13.5px]">{feeAccountText(m)}</p>
            </li>
          ))}
          {methods.length ? null : <li className="rounded-xl border border-dashed border-line px-3 py-4 text-center text-[14px] text-muted">لسه مفيش طرق توصيل. أضف طريقة التوصيل بتاعة المطعم أو شركة التوصيل اللي بتتعامل معاها.</li>}
        </ul>
        <div className="px-5 pb-5"><Button variant="outline" icon={<Plus />} disabled={readOnly} onClick={() => setMethod(newMethod(uuid()))}>طريقة توصيل جديدة</Button></div>
      </Card>

      <Card>
        <CardHeader icon={<Bike />} title="مندوبو التوصيل" subtitle="كل مندوب له حساب ذمم في الأصول المتداولة: الطلبات اللي استلمها وما حاسبش عليها بتتسجل عليه لحد ما يحاسب، ونصيبه من رسوم التوصيل بيتسجل لصالحه." />
        <ul className="grid gap-2 px-5 pb-3">
          {drivers.map((d) => {
            const x = driverOf(d);
            const acc = fin.byId.get(x.accountId);
            const bal = acc ? balances.get(acc.code) ?? 0 : 0;
            const where = x.affiliation === "employee" ? `موظف: ${employees.find((e) => e.id === x.employeeId)?.name ?? "—"}` : `شركة: ${methods.find((m) => m.id === x.companyMethodId)?.company ?? "—"}`;
            return (
              <li key={d.id} className="grid gap-1.5 rounded-xl border border-line p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-bold">{d.name}</span>
                  <Badge size="sm" tone={x.role === "supervisor" ? "primary" : "neutral"}>{ROLE_LABEL[x.role]}</Badge>
                  {d.status === "active" ? null : <Badge size="sm" tone="neutral">موقوف</Badge>}
                  <span className="flex-1" />
                  <IconButton label="تعديل" disabled={readOnly} onClick={() => setDriver(d)}><Pencil /></IconButton>
                  <IconButton label="حذف" disabled={readOnly} onClick={() => setDrop({ kind: "driver", d })}><Trash2 /></IconButton>
                </div>
                <p className="text-[13.5px] text-muted">{[x.title, where, x.bike ? `المكنة ${x.bike}` : "", x.nationalId ? `قومي ${x.nationalId}` : ""].filter(Boolean).join(" · ")}</p>
                {acc ? <p className="text-[13.5px]">{bal > 0 ? `عليه ${fmt(bal)} ج.م` : bal < 0 ? `ليه ${fmt(-bal)} ج.م` : "حسابه مسدد"} <span className="num text-muted" dir="ltr">({acc.code})</span></p> : null}
              </li>
            );
          })}
          {drivers.length ? null : <li className="rounded-xl border border-dashed border-line px-3 py-4 text-center text-[14px] text-muted">لسه مفيش مندوبين.</li>}
        </ul>
        <div className="px-5 pb-5"><Button variant="outline" icon={<Plus />} disabled={readOnly} onClick={() => setDriver("new")}>مندوب جديد</Button></div>
      </Card>

      {method ? <MethodDialog key={method.id} start={method} all={methods} employees={employees} onClose={() => setMethod(null)} /> : null}
      {driver ? <DriverDialog fin={fin} row={driver === "new" ? null : driver} methods={methods} employees={employees} onClose={() => setDriver(null)} /> : null}
      <Confirm open={!!drop} onClose={() => setDrop(null)} onConfirm={remove} loading={busy} danger confirmLabel="حذف"
        title={drop?.kind === "method" ? `حذف ${drop.m.name}` : drop?.kind === "driver" ? `حذف ${drop.d.name}` : ""}
        description="لو عليه حركات متسجلة بيتوقف بس، وحركاته القديمة تفضل زي ما هي." />
    </div>
  );
}

function MethodDialog({ start, all, employees, onClose }: { start: DeliveryMethod; all: DeliveryMethod[]; employees: FinDoc[]; onClose: () => void }) {
  const db = useDb();
  const { toast } = useToast();
  const [m, setM] = useState<DeliveryMethod>(start);
  const [pct, setPct] = useState(start.sharePct ? String(start.sharePct) : "");
  const [monthly, setMonthly] = useState(toText(start.monthlyFee || undefined));
  const [busy, setBusy] = useState(false);
  const isNew = !all.some((x) => x.id === start.id);
  const v: DeliveryMethod = { ...m, sharePct: Number(pct) || 0, monthlyFee: fromText(monthly) };
  const problem = methodProblem(v, all);
  const setType = (type: DeliveryMethod["type"]) => setM({ ...m, type, beneficiary: BENEFICIARIES[type].includes(m.beneficiary) ? m.beneficiary : BENEFICIARIES[type][0] });
  const save = async () => {
    setBusy(true);
    try { await saveMethod(db, v); toast({ tone: "success", title: "تم الحفظ" }); onClose(); }
    catch (e) { toast({ tone: "error", title: "تعذر الحفظ", description: err(e) }); } finally { setBusy(false); }
  };
  return (
    <Dialog open onClose={onClose} size="lg" title={isNew ? "طريقة توصيل جديدة" : `تعديل ${start.name}`}
      footer={<div className="flex flex-wrap items-center justify-end gap-2">{problem ? <span className="me-auto text-[13px] font-semibold text-danger">{problem}</span> : <span className="me-auto text-[13.5px]">{feeAccountText(v)}</span>}<Button variant="ghost" onClick={onClose}>إلغاء</Button><Button loading={busy} disabled={!!problem} onClick={save}>حفظ</Button></div>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Input label="اسم الطريقة" autoFocus placeholder="مثلا: توصيل المطعم، مرسول" value={m.name} onChange={(e) => setM({ ...m, name: e.target.value })} />
        <Select label="مين بيوصل" value={m.type} onChange={(e) => setType(e.target.value as DeliveryMethod["type"])} options={(Object.keys(TYPE_LABEL) as DeliveryMethod["type"][]).map((k) => ({ value: k, label: TYPE_LABEL[k] }))} />
        {m.type === "external" ? (
          <>
            <Input label="اسم شركة التوصيل" value={m.company} onChange={(e) => setM({ ...m, company: e.target.value })} />
            <Select label="طريقة تحصيل الرسوم" value={m.collection} onChange={(e) => setM({ ...m, collection: e.target.value as DeliveryMethod["collection"] })} options={(Object.keys(COLLECTION_LABEL) as DeliveryMethod["collection"][]).map((k) => ({ value: k, label: COLLECTION_LABEL[k] }))} />
            {m.collection === "monthly" ? <Input label="الرسوم الشهرية الثابتة للشركة" dir="ltr" inputMode="decimal" placeholder="0" value={monthly} onChange={(e) => setMonthly(e.target.value)} hint="بتتدفع للشركة كل شهر بسند صرف من الخزينة" /> : null}
          </>
        ) : null}
        {m.type === "external" && m.collection === "outside" ? null : (
          <>
            <Select label="الرسوم لصالح مين" value={m.beneficiary} onChange={(e) => setM({ ...m, beneficiary: e.target.value as DeliveryMethod["beneficiary"] })} options={BENEFICIARIES[m.type].map((k) => ({ value: k, label: BENEFICIARY_LABEL[k] }))} />
            {m.beneficiary === "restaurant" ? null : <Input label="نسبة التحصيل لصالحه" dir="ltr" inputMode="decimal" placeholder="100" value={pct} onChange={(e) => setPct(e.target.value)} end={<span className="text-muted">%</span>} hint="الباقي بيتضاف لحساب الإيرادات" />}
          </>
        )}
        {m.beneficiary === "employees" && m.type === "own" ? (
          <div className="grid gap-2 sm:col-span-2">
            <span className="text-[13.5px] font-semibold">الموظفين اللي ليهم الرسوم</span>
            <div className="flex flex-wrap gap-2">
              {employees.filter((e) => e.status === "active" || m.employeeIds.includes(e.id)).map((e) => {
                const on = m.employeeIds.includes(e.id);
                return <Button key={e.id} size="sm" variant={on ? "primary" : "outline"} onClick={() => setM({ ...m, employeeIds: on ? m.employeeIds.filter((x) => x !== e.id) : [...m.employeeIds, e.id] })}>{e.name}</Button>;
              })}
              {employees.length ? null : <span className="text-[13.5px] text-muted">سجل الموظفين الأول من الحسابات &gt; الرواتب.</span>}
            </div>
          </div>
        ) : null}
        <div className="sm:col-span-2"><Switch checked={m.active} onChange={(a) => setM({ ...m, active: a })} label="شغالة" description="الطريقة الموقوفة ما بتظهرش في مبيعات اليوم، وحركاتها القديمة تفضل." /></div>
      </div>
    </Dialog>
  );
}

function DriverDialog({ fin, row, methods, employees, onClose }: { fin: Fin; row: FinDoc | null; methods: DeliveryMethod[]; employees: FinDoc[]; onClose: () => void }) {
  const db = useDb();
  const { toast } = useToast();
  const x = row ? driverOf(row) : null;
  const companies = methods.filter((m) => m.type === "external" && (m.active || m.id === x?.companyMethodId));
  const [name, setName] = useState(row?.name ?? "");
  const [branchId, setBranchId] = useState(row ? row.branchId ?? "" : fin.branchId ?? "");
  const [active, setActive] = useState(row ? row.status === "active" : true);
  const [d, setD] = useState<Omit<DriverData, "accountId">>({ role: x?.role ?? "driver", title: x?.title ?? "", nationalId: x?.nationalId ?? "", bike: x?.bike ?? "", phone: x?.phone ?? "", affiliation: x?.affiliation ?? (companies.length && !employees.length ? "company" : "employee"), companyMethodId: x?.companyMethodId ?? "", employeeId: x?.employeeId ?? "", note: x?.note ?? "" });
  const [busy, setBusy] = useState(false);
  const pickEmployee = (id: string) => { const e = employees.find((y) => y.id === id); setD({ ...d, employeeId: id, nationalId: d.nationalId || ((e?.data as { nationalId?: string })?.nationalId ?? ""), phone: d.phone || ((e?.data as { phone?: string })?.phone ?? "") }); if (e && !name.trim()) setName(e.name); };
  const save = async () => {
    setBusy(true);
    try { await saveDriver(db, row, { name, branchId: branchId || null, active, data: d }); toast({ tone: "success", title: "تم الحفظ" }); onClose(); }
    catch (e) { toast({ tone: "error", title: "تعذر الحفظ", description: err(e) }); } finally { setBusy(false); }
  };
  return (
    <Dialog open onClose={onClose} size="lg" title={row ? `تعديل ${row.name}` : "مندوب جديد"}
      footer={<div className="flex justify-end gap-2"><Button variant="ghost" onClick={onClose}>إلغاء</Button><Button loading={busy} disabled={!name.trim()} onClick={save}>حفظ</Button></div>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Select label="الصفة" value={d.role} onChange={(e) => setD({ ...d, role: e.target.value as DriverData["role"] })} options={(Object.keys(ROLE_LABEL) as DriverData["role"][]).map((k) => ({ value: k, label: ROLE_LABEL[k] }))} />
        <Select label="تابع لـ" value={d.affiliation} onChange={(e) => setD({ ...d, affiliation: e.target.value as DriverData["affiliation"] })} options={[{ value: "employee", label: "موظف في المطعم" }, { value: "company", label: "شركة توصيل خارجية" }]} />
        {d.affiliation === "employee"
          ? <Select label="الموظف المسجل في النظام" value={d.employeeId} onChange={(e) => pickEmployee(e.target.value)} options={[{ value: "", label: employees.length ? "اختر الموظف" : "سجل الموظفين الأول من الحسابات > الرواتب" }, ...employees.filter((e) => e.status === "active" || e.id === d.employeeId).map((e) => ({ value: e.id, label: e.name }))]} />
          : <Select label="شركة التوصيل" value={d.companyMethodId} onChange={(e) => setD({ ...d, companyMethodId: e.target.value })} options={[{ value: "", label: companies.length ? "اختر الشركة" : "أضف شركة في طرق التوصيل الأول" }, ...companies.map((m) => ({ value: m.id, label: m.company }))]} />}
        <Input label="الاسم" value={name} onChange={(e) => setName(e.target.value)} />
        <Input label="اللقب" placeholder="اختياري" value={d.title} onChange={(e) => setD({ ...d, title: e.target.value })} />
        <Input label="الرقم القومي" dir="ltr" inputMode="numeric" maxLength={14} value={d.nationalId} onChange={(e) => setD({ ...d, nationalId: e.target.value.replace(/\D/g, "") })} />
        <Input label="رقم المكنة" value={d.bike} onChange={(e) => setD({ ...d, bike: e.target.value })} />
        <Input label="التليفون" dir="ltr" inputMode="tel" value={d.phone} onChange={(e) => setD({ ...d, phone: e.target.value })} />
        <BranchSelect fin={fin} label="الفرع" className="w-full" all="كل الفروع" value={branchId} onChange={setBranchId} />
        <div className="sm:col-span-2"><Textarea label="ملاحظات" rows={2} value={d.note} onChange={(e) => setD({ ...d, note: e.target.value })} /></div>
        <div className="sm:col-span-2"><Switch checked={active} onChange={setActive} label="شغال" description="المندوب الموقوف ما بيظهرش في مبيعات اليوم، وحسابه وحركاته تفضل." /></div>
      </div>
    </Dialog>
  );
}
