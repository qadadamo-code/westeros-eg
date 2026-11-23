/** حركات الموظفين: العهد، الحوافز وبونص المبيعات، الخصومات، والمدخرات، مع رصيد كل موظف. */
import { useMemo, useState } from "react";
import { Ban, Briefcase, Gift, MinusCircle, PiggyBank } from "lucide-react";
import type { FinDoc } from "@/data/financeTypes";
import { useDb, useLive } from "@/data/hooks";
import { cn } from "@/lib/cn";
import { Badge, Button, Card, Dialog, EmptyState, IconButton, Input, Select, useToast } from "@/ui";
import { fmtDay } from "../lib";
import { ExportButton } from "../ui";
import { useAmountCurrency } from "./AmountCurrency";
import { baseOf } from "./currency";
import { EMPLOYEE } from "./payroll";
import { useActor, useFinPerms } from "./perms";
import { cancelMove, custodyBalances, MOVE_LABEL, moveOf, moveProblem, needsMoney, PAYROLL_TYPES, salesBonus, saveMove, savingsBalances, STAFF_MOVE, type MoveInput, type MoveType } from "./staffMoves";
import { MONEY_LABEL, moneyAccounts } from "./treasury";
import { AccountSelect, Confirm, fmt, fromText, today, Toolbar } from "./ui";
import { useFinance, type Fin } from "./useFinance";

const err = (e: unknown) => String((e as Error)?.message ?? e);
const STATUS: Record<string, { label: string; tone: "neutral" | "ok" | "warn" | "danger" }> = {
  open: { label: "مستني كشف الرواتب", tone: "warn" }, used: { label: "دخل كشف الرواتب", tone: "ok" }, posted: { label: "مرحل", tone: "ok" }, pending: { label: "في انتظار الاعتماد", tone: "warn" }, cancelled: { label: "ملغي", tone: "danger" },
};
const monthLabel = (m: string | null) => (m ? m.split("-").reverse().join("/") : "");

export default function StaffMoves() {
  const fin = useFinance();
  const db = useDb();
  const { toast } = useToast();
  const actor = useActor();
  const can = useFinPerms().has("vouchers");
  const docs = useLive("finDocs").data;
  const staff = useMemo(() => docs.filter((d) => d.kind === EMPLOYEE).sort((a, b) => a.name.localeCompare(b.name, "ar")), [docs]);
  const moves = useMemo(() => docs.filter((d) => d.kind === STAFF_MOVE).sort((a, b) => (b.date ?? "").localeCompare(a.date ?? "") || Number(b.code) - Number(a.code)), [docs]);
  const custody = useMemo(() => custodyBalances(fin.accounts, fin.entries), [fin.accounts, fin.entries]);
  const savings = useMemo(() => savingsBalances(fin.accounts, fin.entries), [fin.accounts, fin.entries]);
  const [type, setType] = useState("");
  const [emp, setEmp] = useState("");
  const [add, setAdd] = useState<MoveType | null>(null);
  const [cancel, setCancel] = useState<FinDoc | null>(null);
  const [busy, setBusy] = useState(false);
  const rows = moves.filter((d) => (!type || (type === "custody" ? moveOf(d).type.startsWith("custody") : type === "savings" ? moveOf(d).type.startsWith("savings") : moveOf(d).type === type)) && (!emp || moveOf(d).employeeId === emp));
  const waiting = moves.filter((d) => d.status === "open");
  const sum = (m: Map<string, number>) => [...m.values()].reduce((s, v) => s + Math.max(0, v), 0);
  const nameOf = new Map(staff.map((d) => [d.id, d.name]));
  const per = staff.map((d) => ({ d, custody: custody.get(d.id) ?? 0, savings: savings.get(d.id) ?? 0, waiting: waiting.filter((m) => moveOf(m).employeeId === d.id).length })).filter((x) => x.custody || x.savings || x.waiting);

  if (!staff.length) return <Card><EmptyState icon={<Briefcase />} title="أضف الموظفين الأول" body="من صفحة الرواتب والسلف أضف الموظفين، وبعدها تقدر تسجل العهد والحوافز والخصومات والمدخرات." /></Card>;

  return (
    <div className="grid gap-4">
      <Toolbar
        actions={can ? <>
          <Button icon={<Briefcase />} onClick={() => setAdd("custody.give")}>عهدة</Button>
          <Button variant="secondary" icon={<Gift />} onClick={() => setAdd("bonus")}>حافز أو بونص</Button>
          <Button variant="secondary" icon={<MinusCircle />} onClick={() => setAdd("deduction")}>خصم</Button>
          <Button variant="secondary" icon={<PiggyBank />} onClick={() => setAdd("savings")}>مدخرات</Button>
        </> : null}
        more={<ExportButton file="حركات الموظفين" head={["رقم", "التاريخ", "الموظف", "النوع", "شهر الراتب", "المبلغ", "البيان", "الحالة"]} rows={() => rows.map((d) => { const m = moveOf(d); return [Number(d.code), d.date ?? "", d.name, MOVE_LABEL[m.type], monthLabel(m.month), m.amount / 100000, m.memo, STATUS[d.status]?.label ?? d.status]; })} />}>
        <Select aria-label="النوع" value={type} onChange={(e) => setType(e.target.value)} options={[{ value: "", label: "كل الحركات" }, { value: "custody", label: "العهد" }, { value: "bonus", label: "حوافز" }, { value: "sales_bonus", label: "بونص مبيعات" }, { value: "deduction", label: "خصومات" }, { value: "savings", label: "المدخرات" }]} />
        <Select aria-label="الموظف" value={emp} onChange={(e) => setEmp(e.target.value)} options={[{ value: "", label: "كل الموظفين" }, ...staff.map((d) => ({ value: d.id, label: d.name }))]} />
      </Toolbar>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 max-sm:[&>*:last-child]:col-span-2">
        {[["عهد عند الموظفين", fmt(sum(custody))], ["مدخرات الموظفين", fmt(sum(savings))], ["مستني كشف الرواتب", `${waiting.length} حركة`]].map(([l, v]) => <Card key={l} className="p-3"><div className="text-[12.5px] text-muted">{l}</div><div className="num text-[18px] font-bold" dir="ltr">{v}</div></Card>)}
      </div>

      {per.length ? (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {per.map(({ d, custody: c, savings: s, waiting: w }) => (
            <Card key={d.id} className="grid gap-2 p-3">
              <div className="font-bold">{d.name}</div>
              <div className="grid grid-cols-2 gap-2 text-[13.5px]">
                <div><div className="text-[12px] text-muted">عهدة عليه</div><div className="num font-semibold" dir="ltr">{fmt(c)}</div></div>
                <div><div className="text-[12px] text-muted">مدخرات له</div><div className="num font-semibold" dir="ltr">{fmt(s)}</div></div>
              </div>
              {can ? <div className="flex flex-wrap gap-1.5">
                {c > 0 ? <><Button size="sm" variant="soft" onClick={() => { setEmp(d.id); setAdd("custody.spend"); }}>تسوية بمصروف</Button><Button size="sm" variant="soft" onClick={() => { setEmp(d.id); setAdd("custody.return"); }}>رد عهدة</Button></> : null}
                {s > 0 ? <Button size="sm" variant="soft" onClick={() => { setEmp(d.id); setAdd("savings.withdraw"); }}>صرف من المدخرات</Button> : null}
              </div> : null}
              {w ? <div className="text-[12.5px] text-brass-text">{w} حركة هتنزل في كشف الرواتب الجاي</div> : null}
            </Card>
          ))}
        </div>
      ) : null}

      {rows.length ? (
        <Card className="overflow-hidden"><div className="overflow-x-auto thin-scrollbar"><table className="w-full text-[14px]">
          <thead><tr className="text-[12.5px] text-muted">{["رقم", "التاريخ", "الموظف", "الحركة", "المبلغ", "الحالة", ""].map((h, i) => <th key={i} className={cn("border-b border-line px-3 py-2.5 font-semibold", i === 4 ? "text-end" : "text-start")}>{h}</th>)}</tr></thead>
          <tbody>{rows.map((d) => { const m = moveOf(d); const st = STATUS[d.status] ?? { label: d.status, tone: "neutral" as const }; return (
            <tr key={d.id} className="border-t border-line/60">
              <td className="num px-3 py-2 text-muted">{d.code}</td>
              <td className="num px-3 py-2">{d.date ? fmtDay(d.date) : ""}</td>
              <td className="px-3 py-2 font-semibold">{nameOf.get(m.employeeId) ?? d.name}</td>
              <td className="px-3 py-2">{MOVE_LABEL[m.type]}{m.month ? <span className="ms-1 text-[12.5px] text-muted">· راتب {monthLabel(m.month)}</span> : null}{m.type === "sales_bonus" && m.pctBp ? <span className="ms-1 text-[12.5px] text-muted">· {m.pctBp / 100}% من {fmt(m.sales ?? 0)}</span> : null}{m.memo ? <div className="text-[12.5px] text-muted">{m.memo}</div> : null}</td>
              <td className={cn("num px-3 py-2 text-end font-semibold", m.type === "deduction" && "text-danger")} dir="ltr">{fmt(m.amount)}</td>
              <td className="px-3 py-2"><Badge size="sm" tone={st.tone}>{st.label}</Badge></td>
              <td className="px-3 py-2 text-end">{can && (d.status === "open" || d.status === "posted" || d.status === "pending") ? <IconButton size="sm" label="إلغاء الحركة" onClick={() => setCancel(d)}><Ban /></IconButton> : null}</td>
            </tr>); })}</tbody>
        </table></div></Card>
      ) : <Card><EmptyState compact icon={<Briefcase />} title="لا توجد حركات" body="سجل عهدة أو حافز أو خصم أو مدخرات من الأزرار فوق." /></Card>}

      {add ? <MoveDialog fin={fin} staff={staff.filter((d) => d.status === "active")} first={add} employeeId={emp} custody={custody} savings={savings} onClose={() => setAdd(null)} /> : null}
      <Confirm open={!!cancel} danger title="إلغاء الحركة" confirmLabel="إلغاء الحركة" loading={busy} onClose={() => setCancel(null)}
        description={cancel ? (moveOf(cancel).entryId ? "هيتعمل قيد عكسي للحركة، والقيد الأصلي يفضل في الدفاتر." : "الحركة مش هتنزل في كشف الرواتب.") : undefined}
        onConfirm={async () => { if (!cancel) return; setBusy(true); try { await cancelMove(db, cancel.id, actor, today()); toast({ tone: "success", title: "تم إلغاء الحركة" }); setCancel(null); } catch (e) { toast({ tone: "error", title: "تعذر الإلغاء", description: err(e), duration: 9000 }); } finally { setBusy(false); } }} />
    </div>
  );
}

/** the moves offered in one dialog, by the button that opened it */
const FAMILY: Record<string, MoveType[]> = { custody: ["custody.give", "custody.spend", "custody.return"], bonus: ["bonus", "sales_bonus"], deduction: ["deduction"], savings: ["savings", "savings.withdraw"] };
const familyOf = (t: MoveType) => (t.startsWith("custody") ? "custody" : t === "bonus" || t === "sales_bonus" ? "bonus" : t === "deduction" ? "deduction" : "savings");

function MoveDialog({ fin, staff, first, employeeId, custody, savings, onClose }: { fin: Fin; staff: FinDoc[]; first: MoveType; employeeId: string; custody: Map<string, number>; savings: Map<string, number>; onClose: () => void }) {
  const db = useDb();
  const { toast } = useToast();
  const actor = useActor();
  const money = useMemo(() => moneyAccounts(fin.ix.ordered()), [fin.ix]);
  const [type, setType] = useState<MoveType>(first);
  const [d, setD] = useState({ employeeId: employeeId && staff.some((s) => s.id === employeeId) ? employeeId : "", date: today(), month: today().slice(0, 7), amount: "", moneyId: money[0]?.id ?? "", expenseId: "", sales: "", pct: "", memo: "" });
  const [busy, setBusy] = useState(false);
  const set = (p: Partial<typeof d>) => setD({ ...d, ...p });
  const ac = useAmountCurrency(fin, baseOf(fin.settings));
  const bySales = type === "sales_bonus" && d.pct.trim() !== "";
  const pctBp = Math.round((Number(d.pct) || 0) * 100);
  const amount = bySales ? salesBonus(fromText(d.sales), pctBp) : ac.convert(fromText(d.amount));
  const input: MoveInput = { type, employeeId: d.employeeId, date: d.date, amount, month: d.month, moneyId: needsMoney(type) ? d.moneyId : null, expenseId: type === "custody.spend" ? d.expenseId : null, ...(type === "sales_bonus" ? { sales: fromText(d.sales), pctBp } : {}), memo: d.memo, paidIn: bySales ? undefined : ac.paidIn(fromText(d.amount)) };
  const problem = (!bySales && fromText(d.amount) > 0 && ac.problem) || moveProblem(input);
  const c = custody.get(d.employeeId) ?? 0, s = savings.get(d.employeeId) ?? 0;
  const save = async () => {
    setBusy(true);
    try { await saveMove(db, input, actor); toast({ tone: "success", title: `تم تسجيل ${MOVE_LABEL[type]}` }); onClose(); }
    catch (e) { toast({ tone: "error", title: "تعذر الحفظ", description: err(e), duration: 9000 }); } finally { setBusy(false); }
  };
  const family = FAMILY[familyOf(first)];
  return (
    <Dialog open onClose={onClose} size="lg" title={MOVE_LABEL[type]}
      footer={<div className="flex flex-wrap items-center justify-end gap-2">{problem ? <span className="me-auto text-[13px] font-semibold text-danger">{problem}</span> : <span className="me-auto text-[13px] text-muted">{PAYROLL_TYPES.includes(type) ? `هتنزل في كشف رواتب ${monthLabel(d.month)}` : "بيتسجل قيد في الحسابات"}</span>}<Button variant="ghost" onClick={onClose}>إلغاء</Button><Button loading={busy} disabled={!!problem} onClick={save}>حفظ</Button></div>}>
      <div className="grid gap-3 sm:grid-cols-2">
        {family.length > 1 ? <div className="sm:col-span-2"><Select label="نوع الحركة" value={type} onChange={(e) => setType(e.target.value as MoveType)} options={family.map((t) => ({ value: t, label: MOVE_LABEL[t] }))} /></div> : null}
        <Select label="الموظف" value={d.employeeId} onChange={(e) => set({ employeeId: e.target.value })} options={[{ value: "", label: "اختر الموظف" }, ...staff.map((x) => ({ value: x.id, label: x.name }))]}
          hint={d.employeeId && type.startsWith("custody") ? `عهدة عليه الآن ${fmt(c)}` : d.employeeId && type.startsWith("savings") ? `مدخراته الآن ${fmt(s)}` : undefined} />
        <Input label="التاريخ" type="date" dir="ltr" value={d.date} onChange={(e) => set({ date: e.target.value })} />
        {PAYROLL_TYPES.includes(type) ? <Input label="ينزل في راتب شهر" type="month" dir="ltr" value={d.month} onChange={(e) => set({ month: e.target.value })} /> : null}
        {type === "sales_bonus" ? <>
          <Input label="مبيعات الموظف أو الفترة" dir="ltr" inputMode="decimal" value={d.sales} onChange={(e) => set({ sales: e.target.value })} />
          <Input label="نسبة البونص %" dir="ltr" inputMode="decimal" placeholder="مثال 2" value={d.pct} onChange={(e) => set({ pct: e.target.value })} hint={bySales ? `البونص ${fmt(amount)}` : "أو سيب النسبة فاضية واكتب المبلغ"} />
        </> : null}
        {!bySales ? <Input label={`المبلغ (${ac.sym(ac.cur)})`} dir="ltr" inputMode="decimal" autoFocus value={d.amount} onChange={(e) => set({ amount: e.target.value })} /> : null}
        {!bySales ? ac.select : null}
        {!bySales ? ac.box(fromText(d.amount)) : null}
        {needsMoney(type) ? <Select label={type === "custody.return" ? "إلى خزينة أو بنك" : "من خزينة أو بنك"} value={d.moneyId} onChange={(e) => set({ moneyId: e.target.value })} options={[{ value: "", label: "اختر" }, ...money.map((a) => ({ value: a.id, label: `${a.name.ar} (${MONEY_LABEL[a.kind]})` }))]} /> : null}
        {type === "custody.spend" ? <AccountSelect fin={fin} manualOnly label="اتصرفت على مصروف" value={d.expenseId} onChange={(v) => set({ expenseId: v })} filter={(a) => a.type === "expense" || a.type === "cogs"} /> : null}
        <div className="sm:col-span-2"><Input label="البيان" value={d.memo} onChange={(e) => set({ memo: e.target.value })} /></div>
        <p className="text-[13px] text-muted sm:col-span-2">{
          type === "custody.give" ? "العهدة بتتسجل على حساب عهدة الموظف، وبتتقفل بتسوية بمصروف أو برد الفلوس."
          : type === "custody.spend" ? "الفاتورة اللي صرفها الموظف من العهدة: المصروف بيتسجل والعهدة بتقل."
          : type === "custody.return" ? "الفلوس اللي رجعها الموظف من العهدة للخزينة."
          : type === "savings" ? "بيتخصم من صافي راتب الشهر ويتحفظ للموظف في حساب مدخراته."
          : type === "savings.withdraw" ? "بيتصرف للموظف من مدخراته."
          : type === "deduction" ? "بيتخصم من راتب الشهر في كشف الرواتب."
          : "بيتضاف لراتب الشهر في كشف الرواتب."
        }</p>
      </div>
    </Dialog>
  );
}


