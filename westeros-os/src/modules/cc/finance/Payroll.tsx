/** الرواتب: الموظفون وسلفهم، كشف رواتب الشهر بقيد استحقاق واحد، وصرفه من خزينة أو بنك. */
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Banknote, HandCoins, Pencil, Plus, Trash2, Users } from "lucide-react";
import { useDb, useLive } from "@/data/hooks";
import type { FinDoc, FinEntry } from "@/data/financeTypes";
import { cn } from "@/lib/cn";
import { Badge, Button, Card, Dialog, EmptyState, Input, Segmented, Select, Switch, Textarea, useToast } from "@/ui";
import { fmtDay } from "../lib";
import { ExportButton } from "../ui";
import { EntryView } from "./Journal";
import { advanceBalances, cancelPayroll, EMPLOYEE, employeeOf, giveAdvance, grossOf, lineOf, netOf, payPayroll, PAYROLL, payrollOf, payrollProblem, payrollTotals, runPayroll, saveEmployee, type PayLine } from "./payroll";
import { useActor, useFinPerms } from "./perms";
import { MONEY_LABEL, moneyAccounts } from "./treasury";
import { BranchSelect, Confirm, fmt, fromText, PrintButton, printTable, toText, today, Toolbar } from "./ui";
import { useFinance, type Fin } from "./useFinance";

const err = (e: unknown) => String((e as Error)?.message ?? e);
const label = (m: string) => m.split("-").reverse().join("/");
type Tab = "runs" | "staff";
const STATUS: Record<string, { text: string; tone: "ok" | "brass" | "neutral" }> = { posted: { text: "مستحق لم يصرف", tone: "brass" }, paid: { text: "مصروف", tone: "ok" }, cancelled: { text: "ملغي", tone: "neutral" } };

export default function Payroll() {
  const fin = useFinance();
  const perms = useFinPerms();
  const can = perms.has("vouchers");
  const nav = useNavigate();
  const docs = useLive("finDocs").data;
  const [tab, setTab] = useState<Tab>("runs");
  const [edit, setEdit] = useState<FinDoc | "new" | null>(null);
  const [advance, setAdvance] = useState<FinDoc | null>(null);
  const [run, setRun] = useState(false);
  const [show, setShow] = useState<FinDoc | null>(null);
  const [view, setView] = useState<FinEntry | null>(null);
  const staff = useMemo(() => docs.filter((d) => d.kind === EMPLOYEE).sort((a, b) => a.name.localeCompare(b.name, "ar")), [docs]);
  const runs = useMemo(() => docs.filter((d) => d.kind === PAYROLL).sort((a, b) => payrollOf(b).month.localeCompare(payrollOf(a).month) || Number(b.code) - Number(a.code)), [docs]);
  const advances = useMemo(() => advanceBalances(staff, fin.entries), [staff, fin.entries]);
  const active = staff.filter((d) => d.status === "active");
  const monthly = active.reduce((s, d) => { const e = employeeOf(d); return s + e.salary + e.allowances + e.insEmployer; }, 0);
  const unpaid = runs.filter((d) => d.status === "posted").reduce((s, d) => s + payrollOf(d).net, 0);
  const owed = [...advances.values()].reduce((s, v) => s + v, 0);
  return (
    <div className="grid gap-4">
      <Toolbar lead={<Segmented size="sm" className="max-sm:grid max-sm:w-full max-sm:grid-cols-2 max-sm:[&>button]:h-10" label="الرواتب" value={tab} onChange={setTab} options={[{ value: "runs", label: "كشوف الرواتب" }, { value: "staff", label: "الموظفون والسلف" }]} />} actions={<>{can ? <><Button icon={<HandCoins />} disabled={!active.length} onClick={() => setRun(true)}>كشف رواتب شهر</Button><Button variant="outline" icon={<Plus />} onClick={() => setEdit("new")}>موظف جديد</Button></> : null}</>} />
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        {[["موظفون على رأس العمل", String(active.length), ""], ["تكلفة الرواتب في الشهر", fmt(monthly), ""], ["رواتب مستحقة لم تصرف", fmt(unpaid), unpaid ? "text-brass" : ""], ["سلف على الموظفين", fmt(owed), ""]].map(([l, v, c]) => <Card key={l} className="p-3"><div className="text-[12.5px] text-muted">{l}</div><div className={cn("num text-[18px] font-bold", c)} dir="ltr">{v}</div></Card>)}
      </div>

      {tab === "runs" ? (
        runs.length ? (
          <Card className="overflow-hidden"><div className="overflow-x-auto thin-scrollbar"><table className="w-full text-[14px]">
            <thead><tr className="text-[12.5px] text-muted">{["رقم", "الشهر", "الموظفون", "الإجمالي", "الصافي", "الحالة"].map((h, i) => <th key={h} className={cn("border-b border-line px-3 py-2.5 font-semibold", i === 3 || i === 4 ? "text-end" : "text-start")}>{h}</th>)}</tr></thead>
            <tbody>{runs.map((d) => { const p = payrollOf(d); const st = STATUS[d.status] ?? STATUS.posted; return (
              <tr key={d.id} className={cn("cursor-pointer border-t border-line/60 hover:bg-surface-2", d.status === "cancelled" && "text-muted")} onClick={() => setShow(d)}>
                <td className="num px-3 py-2 font-semibold" dir="ltr">{d.code}</td><td className="num px-3 py-2" dir="ltr">{label(p.month)}</td><td className="num px-3 py-2" dir="ltr">{p.lines.length}</td>
                <td className="num px-3 py-2 text-end" dir="ltr">{fmt(p.gross)}</td><td className="num px-3 py-2 text-end font-semibold" dir="ltr">{fmt(p.net)}</td>
                <td className="px-3 py-2"><Badge size="sm" tone={st.tone}>{st.text}</Badge></td>
              </tr>); })}</tbody>
          </table></div></Card>
        ) : <Card><EmptyState compact icon={<HandCoins />} title="لا توجد كشوف رواتب" body={active.length ? "اعمل كشف رواتب الشهر: السيستم يجهز سطر لكل موظف براتبه، وتزود الإضافي والحوافز والخصومات، وبعدها يسجل قيد الاستحقاق." : "أضف الموظفين أولا برواتبهم، وبعدها اعمل كشف رواتب كل شهر."} /></Card>
      ) : null}

      {tab === "staff" ? (
        staff.length ? (
          <Card className="overflow-hidden"><div className="overflow-x-auto thin-scrollbar"><table className="w-full text-[14px]">
            <thead><tr className="text-[12.5px] text-muted">{["الموظف", "الوظيفة", "الفرع", "الراتب", "بدلات", "رصيد السلفة", ""].map((h, i) => <th key={i} className={cn("border-b border-line px-3 py-2.5 font-semibold", i >= 3 && i <= 5 ? "text-end" : "text-start")}>{h}</th>)}</tr></thead>
            <tbody>{staff.map((d) => { const e = employeeOf(d); const adv = advances.get(d.id) ?? 0; return (
              <tr key={d.id} className={cn("border-t border-line/60", d.status !== "active" && "text-muted")}>
                <td className="px-3 py-2 font-semibold">{d.name}{d.status !== "active" ? <Badge size="sm" tone="neutral" className="ms-2">موقوف</Badge> : null}</td><td className="px-3 py-2">{e.job || "—"}</td><td className="px-3 py-2">{fin.branchName(d.branchId)}</td>
                <td className="num px-3 py-2 text-end" dir="ltr">{fmt(e.salary, "—")}</td><td className="num px-3 py-2 text-end" dir="ltr">{fmt(e.allowances, "—")}</td><td className={cn("num px-3 py-2 text-end font-semibold", adv > 0 && "text-brass")} dir="ltr">{fmt(adv, "—")}</td>
                <td className="px-3 py-2"><div className="flex flex-wrap justify-end gap-1">
                  {can && d.status === "active" ? <Button size="sm" variant="soft" icon={<Banknote />} onClick={() => setAdvance(d)}>سلفة</Button> : null}
                  {e.accountId && fin.byId.has(e.accountId) ? <Button size="sm" variant="outline" onClick={() => nav(`/finance/reports/ledger?account=${e.accountId}`)}>كشف حساب</Button> : null}
                  {can ? <Button size="sm" variant="ghost" icon={<Pencil />} aria-label="تعديل" onClick={() => setEdit(d)} /> : null}
                </div></td>
              </tr>); })}</tbody>
          </table></div></Card>
        ) : <Card><EmptyState compact icon={<Users />} title="لا يوجد موظفون" body="كل موظف يتفتح له حساب سلف لوحده، وراتبه وتأميناته يدخلوا كشف الرواتب تلقائي." /></Card>
      ) : null}

      {edit ? <EmployeeDialog fin={fin} row={edit === "new" ? null : edit} onClose={() => setEdit(null)} /> : null}
      {advance ? <AdvanceDialog fin={fin} emp={advance} balance={advances.get(advance.id) ?? 0} onClose={() => setAdvance(null)} onSaved={(e) => { setAdvance(null); setView(e); }} /> : null}
      {run ? <RunDialog fin={fin} staff={active} runs={runs} advances={advances} onClose={() => setRun(false)} onSaved={(d) => { setRun(false); setTab("runs"); setShow(d); }} /> : null}
      {show ? <RunView fin={fin} doc={docs.find((d) => d.id === show.id) ?? show} can={can} canCancel={perms.has("journal.approve")} onClose={() => setShow(null)} onEntry={(id) => { const e = fin.entries.find((x) => x.id === id); if (e) setView(e); }} /> : null}
      {view ? <EntryView key={view.id} fin={fin} entry={fin.entries.find((x) => x.id === view.id) ?? view} onClose={() => setView(null)} onOpen={setView} /> : null}
    </div>
  );
}

function EmployeeDialog({ fin, row, onClose }: { fin: Fin; row: FinDoc | null; onClose: () => void }) {
  const db = useDb();
  const { toast } = useToast();
  const x = row ? employeeOf(row) : null;
  const [d, setD] = useState({ name: row?.name ?? "", job: x?.job ?? "", phone: x?.phone ?? "", nationalId: x?.nationalId ?? "", hired: x?.hired ?? "", salary: toText(x?.salary), allowances: toText(x?.allowances), insEmployee: toText(x?.insEmployee), insEmployer: toText(x?.insEmployer), tax: toText(x?.tax), branchId: row ? row.branchId ?? "" : fin.branchId ?? "", centreId: x?.centreId ?? "", note: x?.note ?? "", active: row ? row.status === "active" : true });
  const [busy, setBusy] = useState(false);
  const centres = fin.centres.filter((c) => c.active);
  const save = async () => {
    setBusy(true);
    try {
      await saveEmployee(db, row, { name: d.name, branchId: d.branchId || null, active: d.active, data: { job: d.job.trim(), phone: d.phone.trim(), nationalId: d.nationalId.trim(), hired: d.hired, salary: fromText(d.salary), allowances: fromText(d.allowances), insEmployee: fromText(d.insEmployee), insEmployer: fromText(d.insEmployer), tax: fromText(d.tax), centreId: d.centreId || null, note: d.note.trim() } });
      toast({ tone: "success", title: "تم الحفظ" }); onClose();
    } catch (e) { toast({ tone: "error", title: "تعذر الحفظ", description: err(e) }); } finally { setBusy(false); }
  };
  const money = (label: string, key: "salary" | "allowances" | "insEmployee" | "insEmployer" | "tax", hint?: string) => <Input label={label} dir="ltr" inputMode="decimal" placeholder="0" value={d[key]} onChange={(e) => setD({ ...d, [key]: e.target.value })} hint={hint} />;
  return (
    <Dialog open onClose={onClose} size="lg" title={row ? "تعديل موظف" : "موظف جديد"} footer={<div className="flex justify-end gap-2"><Button variant="ghost" onClick={onClose}>إلغاء</Button><Button loading={busy} disabled={!d.name.trim()} onClick={save}>حفظ</Button></div>}>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Input label="اسم الموظف" autoFocus value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} />
        <Input label="الوظيفة" value={d.job} onChange={(e) => setD({ ...d, job: e.target.value })} />
        <BranchSelect fin={fin} label="الفرع" className="w-full" all="كل الفروع" value={d.branchId} onChange={(v) => setD({ ...d, branchId: v })} />
        {money("الراتب الأساسي في الشهر", "salary")}
        {money("بدلات ثابتة", "allowances")}
        {money("ضريبة كسب العمل في الشهر", "tax")}
        {money("تأمينات حصة الموظف", "insEmployee", "تخصم من راتبه")}
        {money("تأمينات حصة الشركة", "insEmployer", "مصروف على الشركة فوق الراتب")}
        {centres.length ? <Select label="مركز التكلفة" value={d.centreId} onChange={(e) => setD({ ...d, centreId: e.target.value })} options={[{ value: "", label: "بدون مركز تكلفة" }, ...centres.map((c) => ({ value: c.id, label: c.name.ar }))]} /> : null}
        <Input label="التليفون" dir="ltr" value={d.phone} onChange={(e) => setD({ ...d, phone: e.target.value })} />
        <Input label="الرقم القومي" dir="ltr" value={d.nationalId} onChange={(e) => setD({ ...d, nationalId: e.target.value })} />
        <Input label="تاريخ التعيين" type="date" dir="ltr" value={d.hired} onChange={(e) => setD({ ...d, hired: e.target.value })} />
        <div className="sm:col-span-2 lg:col-span-3"><Textarea label="ملاحظات" rows={2} value={d.note} onChange={(e) => setD({ ...d, note: e.target.value })} /></div>
        <div className="sm:col-span-2 lg:col-span-3"><Switch checked={d.active} onChange={(v) => setD({ ...d, active: v })} label="على رأس العمل" description="الموظف الموقوف لا يدخل كشوف الرواتب الجديدة، وحسابه وحركاته تبقى." /></div>
      </div>
    </Dialog>
  );
}

function AdvanceDialog({ fin, emp, balance, onClose, onSaved }: { fin: Fin; emp: FinDoc; balance: number; onClose: () => void; onSaved: (e: FinEntry) => void }) {
  const db = useDb();
  const { toast } = useToast();
  const actor = useActor();
  const money = useMemo(() => moneyAccounts(fin.ix.ordered()), [fin.ix]);
  const [d, setD] = useState({ date: today(), moneyId: money[0]?.id ?? "", amount: "", memo: "" });
  const [busy, setBusy] = useState(false);
  const amount = fromText(d.amount);
  const problem = !d.moneyId ? "اختر الخزينة أو البنك" : !(amount > 0) ? "اكتب المبلغ" : "";
  const save = async () => {
    setBusy(true);
    try { const e = await giveAdvance(db, { employeeId: emp.id, date: d.date, moneyId: d.moneyId, amount, memo: d.memo, branchId: emp.branchId }, actor); toast({ tone: "success", title: e.status === "pending" ? "السند في انتظار الاعتماد" : `تم ترحيل سند الصرف رقم ${e.meta.voucherNo}` }); onSaved(e); }
    catch (e) { toast({ tone: "error", title: "تعذر الحفظ", description: err(e), duration: 9000 }); } finally { setBusy(false); }
  };
  return (
    <Dialog open onClose={onClose} title={`سلفة للموظف: ${emp.name}`} footer={<div className="flex flex-wrap items-center justify-end gap-2">{problem ? <span className="me-auto text-[13px] font-semibold text-danger">{problem}</span> : <span className="me-auto text-[13px] text-muted">رصيد سلفته بعدها {fmt(balance + amount)}</span>}<Button variant="ghost" onClick={onClose}>إلغاء</Button><Button loading={busy} disabled={!!problem} onClick={save}>حفظ وترحيل</Button></div>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-line p-3 sm:col-span-2"><div className="text-[12.5px] text-muted">رصيد السلفة الحالي</div><div className="num text-[20px] font-bold" dir="ltr">{fmt(balance)}</div></div>
        <Input label="التاريخ" type="date" dir="ltr" value={d.date} onChange={(e) => setD({ ...d, date: e.target.value })} />
        <Select label="من خزينة أو بنك" value={d.moneyId} onChange={(e) => setD({ ...d, moneyId: e.target.value })} options={[{ value: "", label: "اختر" }, ...money.map((a) => ({ value: a.id, label: `${a.name.ar} (${MONEY_LABEL[a.kind]})` }))]} />
        <Input label="مبلغ السلفة (ج.م)" dir="ltr" inputMode="decimal" autoFocus value={d.amount} onChange={(e) => setD({ ...d, amount: e.target.value })} />
        <Input label="البيان" value={d.memo} onChange={(e) => setD({ ...d, memo: e.target.value })} />
      </div>
    </Dialog>
  );
}

const COLS: { key: keyof PayLine; label: string }[] = [{ key: "basic", label: "الأساسي" }, { key: "allowances", label: "بدلات" }, { key: "overtime", label: "إضافي" }, { key: "bonus", label: "حوافز" }, { key: "deductions", label: "خصومات" }, { key: "insEmployee", label: "تأمينات الموظف" }, { key: "tax", label: "ضريبة" }, { key: "advance", label: "خصم سلفة" }];

function RunDialog({ fin, staff, runs, advances, onClose, onSaved }: { fin: Fin; staff: FinDoc[]; runs: FinDoc[]; advances: Map<string, number>; onClose: () => void; onSaved: (d: FinDoc) => void }) {
  const db = useDb();
  const { toast } = useToast();
  const actor = useActor();
  const [month, setMonth] = useState(today().slice(0, 7));
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const done = useMemo(() => new Set(runs.filter((d) => d.status !== "cancelled" && payrollOf(d).month === month).flatMap((d) => payrollOf(d).lines.map((l) => l.employeeId))), [runs, month]);
  const [off, setOff] = useState<Set<string>>(new Set());
  const [cells, setCells] = useState<Record<string, string>>({});
  const todo = staff.filter((d) => !done.has(d.id));
  const lineFor = (doc: FinDoc): PayLine => { const b = lineOf(doc); const l = { ...b }; for (const c of COLS) { const t = cells[`${doc.id}:${c.key}`]; if (t !== undefined) (l[c.key] as number) = fromText(t); } return l; };
  const lines = todo.filter((d) => !off.has(d.id)).map(lineFor);
  const t = payrollTotals(lines);
  const problem = payrollProblem(month, lines, advances);
  const save = async () => {
    setBusy(true);
    try { const doc = await runPayroll(db, { month, lines, note }, actor); toast({ tone: "success", title: `تم تسجيل ${doc.name}` }); onSaved(doc); }
    catch (e) { toast({ tone: "error", title: "تعذر الحفظ", description: err(e), duration: 9000 }); } finally { setBusy(false); }
  };
  return (
    <Dialog open onClose={onClose} size="xl" title="كشف رواتب شهر"
      footer={<div className="flex flex-wrap items-center justify-end gap-2">{problem ? <span className="me-auto text-[13px] font-semibold text-danger">{problem}</span> : <span className="me-auto text-[14px]">الصافي <b className="num" dir="ltr">{fmt(t.net)}</b> · تكلفة الشركة <b className="num" dir="ltr">{fmt(t.cost)}</b></span>}<Button variant="ghost" onClick={onClose}>إلغاء</Button><Button loading={busy} disabled={!!problem} onClick={save}>حفظ وترحيل</Button></div>}>
      <div className="grid gap-3">
        <div className="flex flex-wrap items-end gap-3">
          <Input label="الشهر" type="month" dir="ltr" wrapClassName="w-48" value={month} onChange={(e) => setMonth(e.target.value)} />
          <p className="pb-2.5 text-[13px] text-muted">القيد يتسجل بتاريخ آخر يوم في الشهر. {done.size ? `${done.size} موظف له كشف مسجل عن الشهر ولا يظهر هنا.` : ""}</p>
        </div>
        {todo.length ? (
          <div className="overflow-x-auto thin-scrollbar rounded-xl border border-line"><table className="w-full min-w-[800px] text-[13.5px]">
            <thead><tr className="text-[12.5px] text-muted"><th className="border-b border-line px-2 py-2 text-start font-semibold">الموظف</th>{COLS.map((c) => <th key={c.key} className="border-b border-line px-1 py-2 text-start font-semibold">{c.label}</th>)}<th className="border-b border-line px-2 py-2 text-end font-semibold">الصافي</th></tr></thead>
            <tbody>{todo.map((doc) => { const on = !off.has(doc.id); const l = lineFor(doc); const adv = advances.get(doc.id) ?? 0; return (
              <tr key={doc.id} className={cn("border-t border-line/60", !on && "opacity-50")}>
                <td className="min-w-[150px] px-2 py-1.5"><label className="flex items-center gap-2 whitespace-nowrap font-semibold"><input type="checkbox" className="size-4 accent-[var(--color-primary)]" checked={on} aria-label={`${doc.name} في الكشف`} onChange={() => setOff((s) => { const n = new Set(s); if (on) n.add(doc.id); else n.delete(doc.id); return n; })} />{doc.name}</label>{adv > 0 ? <div className="whitespace-nowrap ps-6 text-[12px] text-brass">عليه سلفة {fmt(adv)}</div> : null}</td>
                {COLS.map((c) => <td key={c.key} className="px-1 py-1.5"><input dir="ltr" inputMode="decimal" disabled={!on || (c.key === "advance" && adv <= 0)} aria-label={`${c.label}: ${doc.name}`} placeholder="0" className="num h-9 w-full min-w-[64px] rounded-lg border border-line bg-surface px-2 text-[13.5px] outline-none focus:border-primary disabled:opacity-40" value={cells[`${doc.id}:${c.key}`] ?? toText(l[c.key] as number)} onChange={(e) => setCells({ ...cells, [`${doc.id}:${c.key}`]: e.target.value })} /></td>)}
                <td className={cn("num px-2 py-1.5 text-end font-bold", netOf(l) < 0 && "text-danger")} dir="ltr">{on ? fmt(netOf(l)) : "—"}</td>
              </tr>); })}</tbody>
            <tfoot><tr className="border-t border-line bg-surface-2/60 font-bold"><td className="px-2 py-2">الإجمالي</td>{[t.basic, null, t.overtime, t.bonus, t.deductions, t.insEmployee, t.tax, t.advance].map((v, i) => <td key={i} className="num px-2 py-2" dir="ltr">{v == null ? "" : fmt(v, "—")}</td>)}<td className="num px-2 py-2 text-end" dir="ltr">{fmt(t.net)}</td></tr></tfoot>
          </table></div>
        ) : <p className="rounded-xl border border-line px-3 py-6 text-center text-muted">كل الموظفين لهم كشف مسجل عن هذا الشهر.</p>}
        <Textarea label="ملاحظات" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
    </Dialog>
  );
}

function RunView({ fin, doc, can, canCancel, onClose, onEntry }: { fin: Fin; doc: FinDoc; can: boolean; canCancel: boolean; onClose: () => void; onEntry: (id: string) => void }) {
  const db = useDb();
  const { toast } = useToast();
  const actor = useActor();
  const p = payrollOf(doc);
  const t = payrollTotals(p.lines);
  const money = useMemo(() => moneyAccounts(fin.ix.ordered()), [fin.ix]);
  const [pay, setPay] = useState<{ date: string; moneyId: string } | null>(null);
  const [ask, setAsk] = useState(false);
  const [busy, setBusy] = useState(false);
  const head = ["الموظف", "الفرع", "الإجمالي", "تأمينات", "ضريبة", "خصم سلفة", "الصافي", "التوقيع"];
  const rows = p.lines.map((l) => [l.name, fin.branchName(l.branchId), grossOf(l), l.insEmployee, l.tax, l.advance, netOf(l)] as const);
  const act = async (f: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try { await f(); toast({ tone: "success", title: ok }); setPay(null); setAsk(false); }
    catch (e) { toast({ tone: "error", title: "تعذر", description: err(e), duration: 9000 }); } finally { setBusy(false); }
  };
  const st = STATUS[doc.status] ?? STATUS.posted;
  return (
    <Dialog open onClose={onClose} size="xl" title={doc.name} footer={<div className="flex flex-wrap justify-end gap-2">
      {canCancel && doc.status === "posted" ? <Button variant="outline" icon={<Trash2 />} onClick={() => setAsk(true)}>إلغاء الكشف</Button> : null}
      <ExportButton file={`رواتب-${p.month}`} head={head.slice(0, 7)} rows={() => rows.map((r) => r.map((c, i) => (i >= 2 ? (c as number) / 100000 : c)))} />
      <PrintButton onClick={() => printTable(doc.name, `الصافي ${fmt(t.net)} ج.م`, head, rows.map((r) => [...r.map((c, i) => (i >= 2 ? { text: fmt(c as number, "—"), align: "end" as const } : String(c))), ""]), ["الإجمالي", "", ...[t.gross, t.insEmployee, t.tax, t.advance, t.net].map((v) => ({ text: fmt(v), align: "end" as const, bold: true })), ""])} />
      {p.entryId ? <Button variant="secondary" onClick={() => onEntry(p.entryId!)}>قيد الاستحقاق</Button> : null}
      {p.payEntryId ? <Button variant="secondary" onClick={() => onEntry(p.payEntryId!)}>قيد الصرف</Button> : null}
      {can && doc.status === "posted" ? <Button icon={<Banknote />} onClick={() => setPay({ date: today(), moneyId: money[0]?.id ?? "" })}>صرف الرواتب</Button> : null}
      <Button variant="ghost" onClick={onClose}>إغلاق</Button></div>}>
      <div className="grid gap-3 text-[14px]">
        <div className="flex flex-wrap items-center gap-3"><Badge tone={st.tone}>{st.text}</Badge>{p.paidOn ? <span className="text-muted">اتصرف {fmtDay(p.paidOn)} من {fin.byId.get(p.paidFrom ?? "")?.name.ar ?? ""}</span> : null}<span className="text-muted">سجله {p.by || "—"}</span></div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{[["إجمالي الرواتب", t.gross], ["تأمينات حصة الشركة", t.insEmployer], ["استقطاعات (تأمينات، ضريبة، سلف)", t.insEmployee + t.tax + t.advance], ["الصافي للموظفين", t.net]].map(([l, v]) => <div key={l as string} className="rounded-xl border border-line p-2.5"><div className="text-[12.5px] text-muted">{l}</div><div className="num text-[16px] font-bold" dir="ltr">{fmt(v as number)}</div></div>)}</div>
        <div className="max-h-[46vh] overflow-auto thin-scrollbar rounded-xl border border-line"><table className="w-full">
          <thead className="sticky top-0 bg-surface"><tr className="text-[12.5px] text-muted">{head.slice(0, 7).map((h, i) => <th key={h} className={cn("border-b border-line px-3 py-2 font-semibold", i >= 2 ? "text-end" : "text-start")}>{h}</th>)}</tr></thead>
          <tbody>{rows.map((r, i) => <tr key={i} className="border-t border-line/60"><td className="px-3 py-1.5 font-semibold">{r[0]}</td><td className="px-3 py-1.5">{r[1]}</td>{r.slice(2).map((v, k) => <td key={k} className={cn("num px-3 py-1.5 text-end", k === 4 && "font-bold")} dir="ltr">{fmt(v as number, "—")}</td>)}</tr>)}</tbody>
        </table></div>
        {p.note ? <p className="rounded-xl border border-line px-3 py-2 text-muted">{p.note}</p> : null}
        {pay ? (
          <div className="grid gap-3 rounded-xl border border-brass/50 bg-brass/10 p-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <Input label="تاريخ الصرف" type="date" dir="ltr" value={pay.date} onChange={(e) => setPay({ ...pay, date: e.target.value })} />
            <Select label="من خزينة أو بنك" value={pay.moneyId} onChange={(e) => setPay({ ...pay, moneyId: e.target.value })} options={[{ value: "", label: "اختر" }, ...money.map((a) => ({ value: a.id, label: `${a.name.ar} (${MONEY_LABEL[a.kind]})` }))]} />
            <Button loading={busy} disabled={!pay.moneyId} onClick={() => act(() => payPayroll(db, doc.id, pay), "تم صرف الرواتب")}>اصرف {fmt(p.net)}</Button>
          </div>
        ) : null}
      </div>
      <Confirm open={ask} onClose={() => setAsk(false)} onConfirm={() => act(() => cancelPayroll(db, doc.id, actor, today()), "تم إلغاء الكشف بقيد عكسي")} loading={busy} danger title="إلغاء كشف الرواتب" confirmLabel="إلغاء الكشف" description="يتسجل قيد عكسي يلغي الاستحقاق، وخصم السلف يرجع لرصيد كل موظف. بعدها تقدر تعمل كشف جديد عن نفس الشهر." />
    </Dialog>
  );
}
