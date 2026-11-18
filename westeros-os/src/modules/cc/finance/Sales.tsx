/** المبيعات: ملخص مبيعات كل يوم أو وردية بقيد واحد، وتسوية ما ينتظر التحصيل من طلبات والفيزا والمحافظ. */
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeftRight, Plus, ReceiptText, Trash2 } from "lucide-react";
import { useDb, useLive } from "@/data/hooks";
import type { FinDoc, FinEntry } from "@/data/financeTypes";
import { cn } from "@/lib/cn";
import { Badge, Button, Card, Dialog, EmptyState, Input, Segmented, Select, Switch, Textarea, useToast } from "@/ui";
import { fmtDay } from "../lib";
import { ExportButton } from "../ui";
import { EntryView } from "./Journal";
import { useActor, useFinPerms } from "./perms";
import { cancelDoc, CHANNELS, PAY_KEYS, postSalesDay, postSettlement, SALES_DAY, salesOf, salesProblem, salesTotals, SETTLEMENT, settlementOf, settlementProblem, settlementTotal, waitingAccounts, type SalesInput } from "./sales";
import { netByCode } from "./statements";
import { MONEY_LABEL, moneyAccounts } from "./treasury";
import { AccountSelect, BranchSelect, Confirm, esc, fmt, fromText, PeriodPicker, periodOf, printDoc, PrintButton, printTable, toText, today, type Period } from "./ui";
import { useFinance, type Fin } from "./useFinance";

const err = (e: unknown) => String((e as Error)?.message ?? e);
type Tab = "days" | "settlements";

export default function Sales() {
  const fin = useFinance();
  const perms = useFinPerms();
  const can = perms.has("vouchers");
  const nav = useNavigate();
  const docs = useLive("finDocs").data;
  const [tab, setTab] = useState<Tab>("days");
  const [period, setPeriod] = useState<Period>(periodOf("month", fin.settings.yearStartMonth));
  const [branch, setBranch] = useState("");
  const [add, setAdd] = useState(false);
  const [settle, setSettle] = useState<{ fromId?: string } | null>(null);
  const [show, setShow] = useState<FinDoc | null>(null);
  const [view, setView] = useState<FinEntry | null>(null);
  const inRange = (d: FinDoc) => (!period.from || (d.date ?? "") >= period.from) && (!period.to || (d.date ?? "") <= period.to) && (!branch || d.branchId === branch);
  const days = useMemo(() => docs.filter((d) => d.kind === SALES_DAY && inRange(d)).sort((a, b) => (b.date ?? "").localeCompare(a.date ?? "") || Number(b.code) - Number(a.code)), [docs, period, branch]);
  const settlements = useMemo(() => docs.filter((d) => d.kind === SETTLEMENT && inRange(d)).sort((a, b) => (b.date ?? "").localeCompare(a.date ?? "") || Number(b.code) - Number(a.code)), [docs, period, branch]);
  const live = days.filter((d) => d.status === "posted");
  const sum = live.reduce((s, d) => { const x = salesOf(d); return { net: s.net + x.net, vat: s.vat + x.vat, diff: s.diff + x.diff, orders: s.orders + (x.orders || 0) }; }, { net: 0, vat: 0, diff: 0, orders: 0 });
  const waiting = useMemo(() => { const net = netByCode(fin.accounts, fin.entries, {}); return waitingAccounts(fin.ix.ordered()).map((a) => ({ a, bal: net.get(a.code) ?? 0 })).filter((x) => x.bal); }, [fin.accounts, fin.entries, fin.ix]);
  const last = useMemo(() => docs.filter((d) => d.kind === SALES_DAY).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0], [docs]);
  const head = ["رقم", "التاريخ", "الفرع", "الوردية", "الطلبات", "المبيعات بدون ضريبة", "الضريبة", "المحصل", "عجز أو زيادة", "الحالة"];
  const cells = (d: FinDoc) => { const x = salesOf(d); return [d.code, fmtDay(d.date ?? ""), fin.branchName(d.branchId), d.name, x.orders || 0, x.net, x.vat, x.paid, x.diff, d.status === "posted" ? "مرحل" : "ملغي"] as const; };
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-end gap-2">
        <Segmented label="المبيعات" value={tab} onChange={setTab} options={[{ value: "days", label: "ملخصات المبيعات" }, { value: "settlements", label: "التسويات" }]} />
        <PeriodPicker value={period} onChange={setPeriod} startMonth={fin.settings.yearStartMonth} />
        <BranchSelect fin={fin} value={branch} onChange={setBranch} />
        <span className="flex-1" />
        {can ? <><Button icon={<Plus />} onClick={() => setAdd(true)}>مبيعات يوم</Button><Button variant="secondary" icon={<ArrowLeftRight />} onClick={() => setSettle({})}>تسوية</Button></> : null}
      </div>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {[["المبيعات بدون ضريبة", fmt(sum.net), ""], ["ضريبة المبيعات", fmt(sum.vat), ""], ["متوسط الطلب", sum.orders ? fmt(Math.round(sum.net / sum.orders)) : "—", ""], [sum.diff < 0 ? "عجز الخزينة" : "زيادة الخزينة", fmt(Math.abs(sum.diff)), sum.diff < 0 ? "text-danger" : ""]].map(([l, v, c]) => <Card key={l} className="p-3"><div className="text-[12.5px] text-muted">{l}</div><div className={cn("num text-[18px] font-bold", c)} dir="ltr">{v}</div></Card>)}
      </div>
      {waiting.length ? (
        <Card className="grid gap-2 p-3">
          <div className="text-[13px] font-semibold text-muted">مبالغ تنتظر التحصيل</div>
          <div className="flex flex-wrap gap-2">{waiting.map(({ a, bal }) => (
            <div key={a.id} className="flex items-center gap-3 rounded-xl border border-line px-3 py-2">
              <button type="button" className="text-start hover:underline" onClick={() => nav(`/finance/reports/ledger?account=${a.id}`)}><div className="text-[13px]">{a.name.ar}</div><div className={cn("num text-[16px] font-bold", bal < 0 && "text-danger")} dir="ltr">{fmt(bal)}</div></button>
              {can && bal > 0 ? <Button size="sm" variant="soft" onClick={() => setSettle({ fromId: a.id })}>تسوية</Button> : null}
            </div>))}</div>
        </Card>
      ) : null}

      {tab === "days" ? (
        days.length ? (
          <>
            <div className="flex justify-end gap-2">
              <ExportButton file="ملخصات-المبيعات" head={[...head]} rows={() => days.map((d) => cells(d).map((c, i) => (i >= 5 && i <= 8 ? (c as number) / 100000 : c)))} />
              <PrintButton onClick={() => printTable("ملخصات المبيعات", `${fin.branchName(branch || null)}`, [...head], days.map((d) => cells(d).map((c, i) => (i >= 5 && i <= 8 ? { text: fmt(c as number, "—"), align: "end" as const } : String(c)))))} />
            </div>
            <Card className="overflow-hidden"><div className="overflow-x-auto thin-scrollbar"><table className="w-full text-[14px]">
              <thead><tr className="text-[12.5px] text-muted">{head.map((h, i) => <th key={h} className={cn("border-b border-line px-3 py-2.5 font-semibold", i >= 5 && i <= 8 ? "text-end" : "text-start")}>{h}</th>)}</tr></thead>
              <tbody>{days.map((d) => { const c = cells(d); return (
                <tr key={d.id} className={cn("cursor-pointer border-t border-line/60 hover:bg-surface-2", d.status !== "posted" && "text-muted line-through decoration-muted/50")} onClick={() => setShow(d)}>
                  <td className="num px-3 py-2 font-semibold" dir="ltr">{c[0]}</td><td className="px-3 py-2">{c[1]}</td><td className="px-3 py-2">{c[2]}</td><td className="px-3 py-2">{c[3]}</td><td className="num px-3 py-2" dir="ltr">{c[4] || "—"}</td>
                  <td className="num px-3 py-2 text-end font-semibold" dir="ltr">{fmt(c[5])}</td><td className="num px-3 py-2 text-end" dir="ltr">{fmt(c[6], "—")}</td><td className="num px-3 py-2 text-end" dir="ltr">{fmt(c[7])}</td>
                  <td className={cn("num px-3 py-2 text-end", c[8] < 0 && "text-danger")} dir="ltr">{fmt(c[8], "—")}</td>
                  <td className="px-3 py-2"><Badge size="sm" tone={d.status === "posted" ? "ok" : "neutral"}>{c[9]}</Badge></td>
                </tr>); })}</tbody>
            </table></div></Card>
          </>
        ) : <Card><EmptyState compact icon={<ReceiptText />} title="لا توجد مبيعات مسجلة في الفترة" body="آخر كل يوم أو وردية اكتب مبيعات كل قناة والمبالغ المحصلة، والسيستم يسجل الإيراد والضريبة وعجز أو زيادة الخزينة في قيد واحد." /></Card>
      ) : null}

      {tab === "settlements" ? (
        settlements.length ? (
          <Card className="overflow-hidden"><div className="overflow-x-auto thin-scrollbar"><table className="w-full text-[14px]">
            <thead><tr className="text-[12.5px] text-muted">{["رقم", "التاريخ", "الحساب", "استلمه", "المستلم", "العمولة", "ضريبة العمولة", "الإجمالي", "الحالة"].map((h, i) => <th key={h} className={cn("border-b border-line px-3 py-2.5 font-semibold", i >= 4 && i <= 7 ? "text-end" : "text-start")}>{h}</th>)}</tr></thead>
            <tbody>{settlements.map((d) => { const x = settlementOf(d); return (
              <tr key={d.id} className={cn("cursor-pointer border-t border-line/60 hover:bg-surface-2", d.status !== "posted" && "text-muted line-through decoration-muted/50")} onClick={() => setShow(d)}>
                <td className="num px-3 py-2 font-semibold" dir="ltr">{d.code}</td><td className="px-3 py-2">{fmtDay(d.date ?? "")}</td><td className="px-3 py-2">{d.name}</td><td className="px-3 py-2">{fin.byId.get(x.toId)?.name.ar ?? "—"}</td>
                <td className="num px-3 py-2 text-end" dir="ltr">{fmt(x.received)}</td><td className="num px-3 py-2 text-end" dir="ltr">{fmt(x.commission, "—")}</td><td className="num px-3 py-2 text-end" dir="ltr">{fmt(x.commissionVat, "—")}</td><td className="num px-3 py-2 text-end font-semibold" dir="ltr">{fmt(x.total)}</td>
                <td className="px-3 py-2"><Badge size="sm" tone={d.status === "posted" ? "ok" : "neutral"}>{d.status === "posted" ? "مرحل" : "ملغي"}</Badge></td>
              </tr>); })}</tbody>
          </table></div></Card>
        ) : <Card><EmptyState compact icon={<ArrowLeftRight />} title="لا توجد تسويات في الفترة" body="لما طلبات أو البنك يحول مبيعات الفيزا، سجل المبلغ المستلم والعمولة، والسيستم يقفل المستحق ويسجل العمولة مصروف." /></Card>
      ) : null}

      {add ? <DayDialog fin={fin} last={last} onClose={() => setAdd(false)} onSaved={(d) => { setAdd(false); setShow(d); }} /> : null}
      {settle ? <SettleDialog fin={fin} fromId={settle.fromId} onClose={() => setSettle(null)} onSaved={(d) => { setSettle(null); setTab("settlements"); setShow(d); }} /> : null}
      {show ? <DocView fin={fin} doc={docs.find((d) => d.id === show.id) ?? show} canCancel={perms.has("journal.approve")} onClose={() => setShow(null)} onEntry={(id) => { const e = fin.entries.find((x) => x.id === id); if (e) setView(e); }} /> : null}
      {view ? <EntryView key={view.id} fin={fin} entry={fin.entries.find((x) => x.id === view.id) ?? view} onClose={() => setView(null)} onOpen={setView} /> : null}
    </div>
  );
}

function DayDialog({ fin, last, onClose, onSaved }: { fin: Fin; last?: FinDoc; onClose: () => void; onSaved: (d: FinDoc) => void }) {
  const db = useDb();
  const { toast } = useToast();
  const actor = useActor();
  const prev = last ? salesOf(last) : null;
  const [d, setD] = useState({ date: today(), branchId: fin.branchId ?? "", shift: "", fees: "", discounts: "", returns: "", tips: "", vat: prev ? String(prev.vatBp / 100) : "14", inclusive: prev ? prev.inclusive : true, orders: "", note: "" });
  const [ch, setCh] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  /** the tills of the branch, then the usual places takings wait on */
  const base = useMemo(() => {
    const cash = moneyAccounts(fin.ix.ordered()).filter((a) => a.kind === "cash" && (!a.branchId || !d.branchId || a.branchId === d.branchId)).map((a) => a.id);
    const linked = PAY_KEYS.map((k) => fin.accounts.find((a) => a.code === fin.settings.links[k] && a.postable && a.active)?.id).filter((x): x is string => !!x);
    return [...new Set([...cash, ...linked])];
  }, [fin.ix, fin.accounts, fin.settings.links, d.branchId]);
  const [extra, setExtra] = useState<string[]>([]);
  const [pay, setPay] = useState<Record<string, string>>({});
  const accounts = [...new Set([...base, ...extra])];
  const input: SalesInput = {
    shift: d.shift, channels: Object.fromEntries(CHANNELS.map((c) => [c.key, fromText(ch[c.key] ?? "")])), fees: fromText(d.fees), discounts: fromText(d.discounts), returns: fromText(d.returns), tips: fromText(d.tips),
    vatBp: Math.round((Number(d.vat) || 0) * 100), inclusive: d.inclusive, payments: accounts.map((id) => ({ accountId: id, amount: fromText(pay[id] ?? "") })).filter((p) => p.amount), orders: Math.max(0, Math.round(Number(d.orders) || 0)), note: d.note,
  };
  const t = salesTotals(input);
  const problem = salesProblem({ date: d.date, branchId: d.branchId || null, ...input });
  const save = async () => {
    setBusy(true);
    try { const doc = await postSalesDay(db, { date: d.date, branchId: d.branchId || null, ...input }, actor); toast({ tone: "success", title: `تم تسجيل مبيعات اليوم رقم ${doc.code}` }); onSaved(doc); }
    catch (e) { toast({ tone: "error", title: "تعذر الحفظ", description: err(e), duration: 9000 }); } finally { setBusy(false); }
  };
  const money = (label: string, value: string, on: (v: string) => void, hint?: string) => <Input label={label} dir="ltr" inputMode="decimal" placeholder="0" value={value} onChange={(e) => on(e.target.value)} hint={hint} />;
  return (
    <Dialog open onClose={onClose} size="xl" title="مبيعات يوم أو وردية"
      footer={<div className="flex flex-wrap items-center justify-end gap-2">
        {problem ? <span className="me-auto text-[13px] font-semibold text-danger">{problem}</span> : <span className={cn("me-auto text-[14px]", t.diff < 0 && "font-semibold text-danger")}>{t.diff === 0 ? "المحصل مطابق للمبيعات" : t.diff < 0 ? `عجز ${fmt(-t.diff)} ج.م يتسجل على فروق الخزينة` : `زيادة ${fmt(t.diff)} ج.م تتسجل على فروق الخزينة`}</span>}
        <Button variant="ghost" onClick={onClose}>إلغاء</Button><Button loading={busy} disabled={!!problem} onClick={save}>حفظ وترحيل</Button>
      </div>}>
      <div className="grid gap-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Input label="التاريخ" type="date" dir="ltr" value={d.date} onChange={(e) => setD({ ...d, date: e.target.value })} />
          <BranchSelect fin={fin} label="الفرع" className="w-full" all={null} value={d.branchId} onChange={(v) => setD({ ...d, branchId: v })} />
          <Input label="الوردية" placeholder="اليوم كله" value={d.shift} onChange={(e) => setD({ ...d, shift: e.target.value })} hint="اكتبها لو اليوم فيه أكثر من وردية" />
          <Input label="عدد الطلبات" dir="ltr" inputMode="numeric" placeholder="0" value={d.orders} onChange={(e) => setD({ ...d, orders: e.target.value })} />
        </div>
        <div className="grid gap-3 lg:grid-cols-2">
          <div className="grid content-start gap-3 rounded-xl border border-line p-3">
            <div className="flex flex-wrap items-center gap-3"><h3 className="text-[15px] font-bold">المبيعات</h3><span className="flex-1" />
              <Input aria-label="نسبة الضريبة %" dir="ltr" inputMode="decimal" wrapClassName="w-28" value={d.vat} onChange={(e) => setD({ ...d, vat: e.target.value })} end={<span className="text-muted">%</span>} /></div>
            <Switch checked={d.inclusive} onChange={(v) => setD({ ...d, inclusive: v })} label="الأرقام شاملة الضريبة" description={d.inclusive ? "السيستم يطلع الضريبة من الأرقام المكتوبة" : "السيستم يضيف الضريبة فوق الأرقام المكتوبة"} />
            <div className="grid gap-3 sm:grid-cols-2">
              {CHANNELS.map((c) => <div key={c.key}>{money(`مبيعات ${c.label}`, ch[c.key] ?? "", (v) => setCh({ ...ch, [c.key]: v }))}</div>)}
              {money("رسوم التوصيل المحصلة", d.fees, (v) => setD({ ...d, fees: v }))}
              {money("خصومات وعروض", d.discounts, (v) => setD({ ...d, discounts: v }), "تنزل من المبيعات")}
              {money("مرتجعات", d.returns, (v) => setD({ ...d, returns: v }))}
              {money("خدمة وإكراميات", d.tips, (v) => setD({ ...d, tips: v }), "تتسجل مستحقة للموظفين، خارج الضريبة")}
            </div>
          </div>
          <div className="grid content-start gap-3 rounded-xl border border-line p-3">
            <h3 className="text-[15px] font-bold">المحصل</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              {accounts.map((id) => { const a = fin.byId.get(id); return a ? <div key={id}>{money(a.name.ar, pay[id] ?? "", (v) => setPay({ ...pay, [id]: v }))}</div> : null; })}
            </div>
            <AccountSelect fin={fin} label="تحصيل على حساب آخر" placeholder="بنك، محفظة، عميل آجل" value="" onChange={(v) => { if (v) setExtra([...extra, v]); }} filter={(a) => !accounts.includes(a.id) && (a.kind === "cash" || a.kind === "bank" || a.kind === "wallet" || a.kind === "customer")} />
            <div className="grid gap-1 border-t border-line pt-2 text-[14px]">
              {[["المبيعات بدون ضريبة", t.taxable], ["الضريبة", t.vat], ["خدمة وإكراميات", input.tips], ["المطلوب تحصيله", t.due], ["المحصل", t.paid]].map(([l, v], i) => <div key={l as string} className={cn("flex justify-between", i >= 3 && "font-bold")}><span className={i < 3 ? "text-muted" : ""}>{l}</span><span className="num" dir="ltr">{fmt(v as number)}</span></div>)}
            </div>
          </div>
        </div>
        <Textarea label="ملاحظات" rows={2} value={d.note} onChange={(e) => setD({ ...d, note: e.target.value })} />
      </div>
    </Dialog>
  );
}

function SettleDialog({ fin, fromId, onClose, onSaved }: { fin: Fin; fromId?: string; onClose: () => void; onSaved: (d: FinDoc) => void }) {
  const db = useDb();
  const { toast } = useToast();
  const actor = useActor();
  const waiting = useMemo(() => waitingAccounts(fin.ix.ordered()), [fin.ix]);
  const money = useMemo(() => moneyAccounts(fin.ix.ordered()).filter((a) => a.kind !== "wallet"), [fin.ix]);
  const net = useMemo(() => netByCode(fin.accounts, fin.entries, {}), [fin.accounts, fin.entries]);
  const feeOf = (id: string) => { const a = fin.byId.get(id); const key = a && a.code.startsWith((fin.settings.links["aggregator.talabat"] ?? "x").slice(0, 4)) ? "exp.talabat" : "exp.bankfees"; return fin.accounts.find((x) => x.code === fin.settings.links[key])?.id ?? ""; };
  const [d, setD] = useState({ fromId: fromId ?? "", toId: money.find((a) => a.kind === "bank")?.id ?? money[0]?.id ?? "", date: today(), received: "", commission: "", vat: "14", feeId: fromId ? feeOf(fromId) : "", ref: "", note: "", branchId: fin.branchId ?? "" });
  const [busy, setBusy] = useState(false);
  const commission = fromText(d.commission);
  const input = { fromId: d.fromId, toId: d.toId, date: d.date, received: fromText(d.received), commission, commissionVat: Math.round((commission * (Number(d.vat) || 0)) / 100), feeId: d.feeId, ref: d.ref, note: d.note, branchId: d.branchId || null };
  const from = fin.byId.get(d.fromId);
  const balance = from ? net.get(from.code) ?? 0 : 0;
  const total = settlementTotal(input);
  const problem = settlementProblem(input);
  const save = async () => {
    setBusy(true);
    try { const doc = await postSettlement(db, input, actor); toast({ tone: "success", title: `تم تسجيل التسوية رقم ${doc.code}` }); onSaved(doc); }
    catch (e) { toast({ tone: "error", title: "تعذر الحفظ", description: err(e), duration: 9000 }); } finally { setBusy(false); }
  };
  return (
    <Dialog open onClose={onClose} size="lg" title="تسوية مبالغ تحت التحصيل"
      footer={<div className="flex flex-wrap items-center justify-end gap-2">{problem ? <span className="me-auto text-[13px] font-semibold text-danger">{problem}</span> : <span className={cn("me-auto text-[13px]", total > balance ? "font-semibold text-danger" : "text-muted")}>{total > balance ? `التسوية ${fmt(total)} أكبر من الرصيد ${fmt(balance)}` : `يتسوى ${fmt(total)}، والباقي تحت التحصيل ${fmt(balance - total)}`}</span>}<Button variant="ghost" onClick={onClose}>إلغاء</Button><Button loading={busy} disabled={!!problem} onClick={save}>حفظ وترحيل</Button></div>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Select label="الحساب تحت التسوية" value={d.fromId} onChange={(e) => setD({ ...d, fromId: e.target.value, feeId: feeOf(e.target.value) })} options={[{ value: "", label: "اختر" }, ...waiting.map((a) => ({ value: a.id, label: `${a.name.ar} · ${fmt(net.get(a.code) ?? 0)}` }))]} />
        <Select label="استلمه بنك أو خزينة" value={d.toId} onChange={(e) => setD({ ...d, toId: e.target.value })} options={[{ value: "", label: "اختر" }, ...money.map((a) => ({ value: a.id, label: `${a.name.ar} (${MONEY_LABEL[a.kind]})` }))]} />
        <Input label="التاريخ" type="date" dir="ltr" value={d.date} onChange={(e) => setD({ ...d, date: e.target.value })} />
        <Input label="المبلغ المستلم فعلا (ج.م)" dir="ltr" inputMode="decimal" autoFocus value={d.received} onChange={(e) => setD({ ...d, received: e.target.value })} hint={balance > 0 && commission >= 0 ? <button type="button" className="text-primary underline-offset-2 hover:underline" onClick={() => setD({ ...d, received: toText(Math.max(balance - input.commission - input.commissionVat, 0)) })}>الباقي كله بعد العمولة</button> : undefined} />
        <Input label="العمولة والرسوم المخصومة (ج.م)" dir="ltr" inputMode="decimal" placeholder="0" value={d.commission} onChange={(e) => setD({ ...d, commission: e.target.value })} />
        <Input label="ضريبة على العمولة %" dir="ltr" inputMode="decimal" value={d.vat} onChange={(e) => setD({ ...d, vat: e.target.value })} hint={input.commissionVat ? `${fmt(input.commissionVat)} تتسجل ضريبة مدخلات` : "اكتب صفر لو كشف التسوية بدون ضريبة"} />
        <AccountSelect fin={fin} label="حساب العمولة" value={d.feeId} onChange={(v) => setD({ ...d, feeId: v })} filter={(a) => a.type === "expense"} />
        <Input label="رقم كشف التسوية أو التحويل" dir="ltr" value={d.ref} onChange={(e) => setD({ ...d, ref: e.target.value })} />
        <BranchSelect fin={fin} label="الفرع" className="w-full" all="كل الفروع" value={d.branchId} onChange={(v) => setD({ ...d, branchId: v })} />
        <div className="sm:col-span-2"><Textarea label="ملاحظات" rows={2} value={d.note} onChange={(e) => setD({ ...d, note: e.target.value })} /></div>
      </div>
    </Dialog>
  );
}

function DocView({ fin, doc, canCancel, onClose, onEntry }: { fin: Fin; doc: FinDoc; canCancel: boolean; onClose: () => void; onEntry: (id: string) => void }) {
  const db = useDb();
  const { toast } = useToast();
  const actor = useActor();
  const [ask, setAsk] = useState(false);
  const [busy, setBusy] = useState(false);
  const isDay = doc.kind === SALES_DAY;
  const s = isDay ? salesOf(doc) : null, x = isDay ? null : settlementOf(doc);
  const t = s ? salesTotals(s) : null;
  const title = isDay ? `مبيعات ${fmtDay(doc.date ?? "")}${s!.shift ? ` · ${s!.shift}` : ""}` : `تسوية ${doc.name} رقم ${doc.code}`;
  const rows: [string, number][] = s && t ? [
    ...CHANNELS.filter((c) => t.channels[c.key]).map((c) => [`مبيعات ${c.label}`, t.channels[c.key]] as [string, number]),
    ...(t.fees ? [["رسوم التوصيل", t.fees] as [string, number]] : []), ...(t.discounts ? [["خصومات وعروض", -t.discounts] as [string, number]] : []), ...(t.returns ? [["مرتجعات", -t.returns] as [string, number]] : []),
    ["المبيعات بدون ضريبة", t.taxable], ["ضريبة القيمة المضافة", t.vat], ...(s.tips ? [["خدمة وإكراميات", s.tips] as [string, number]] : []), ["المطلوب تحصيله", t.due],
    ...s.payments.map((p) => [`محصل: ${fin.byId.get(p.accountId)?.name.ar ?? "—"}`, p.amount] as [string, number]), [t.diff < 0 ? "عجز خزينة" : "زيادة خزينة", t.diff],
  ] : x ? [["المبلغ المستلم", x.received], ["العمولة والرسوم", x.commission], ["ضريبة على العمولة", x.commissionVat], ["إجمالي ما اتسوى", x.total]] : [];
  const print = () => printDoc(title, `<h1>${esc(title)}</h1><div class="row"><span>الفرع: <b>${esc(fin.branchName(doc.branchId))}</b></span><span>رقم: <b>${esc(doc.code)}</b></span>${s?.orders ? `<span>الطلبات: <b>${s.orders}</b></span>` : ""}${x ? `<span>استلمه: <b>${esc(fin.byId.get(x.toId)?.name.ar ?? "")}</b></span>` : ""}</div>
    <table style="width:100%;border-collapse:collapse;margin-top:8px">${rows.map(([l, v]) => `<tr><td style="border:1px solid #999;padding:4px 8px">${esc(l)}</td><td style="border:1px solid #999;padding:4px 8px;text-align:left">${fmt(v)}</td></tr>`).join("")}</table>
    ${(s?.note || x?.note) ? `<div class="box">${esc(s?.note || x?.note || "")}</div>` : ""}<div class="sign"><span>الكاشير</span><span>المحاسب</span><span>المدير</span></div>`);
  const cancel = async () => {
    setBusy(true);
    try { await cancelDoc(db, doc.id, actor, today()); toast({ tone: "success", title: "تم الإلغاء بقيد عكسي" }); setAsk(false); }
    catch (e) { toast({ tone: "error", title: "تعذر الإلغاء", description: err(e), duration: 9000 }); } finally { setBusy(false); }
  };
  const entryId = s?.entryId ?? x?.entryId;
  return (
    <Dialog open onClose={onClose} title={title} footer={<div className="flex flex-wrap justify-end gap-2">{canCancel && doc.status === "posted" ? <Button variant="outline" icon={<Trash2 />} onClick={() => setAsk(true)}>إلغاء المستند</Button> : null}<PrintButton onClick={print} />{entryId ? <Button variant="secondary" onClick={() => onEntry(entryId)}>القيد المحاسبي</Button> : null}<Button variant="ghost" onClick={onClose}>إغلاق</Button></div>}>
      <div className="grid gap-3 text-[14px]">
        {doc.status !== "posted" ? <p className="rounded-xl border border-danger/40 bg-danger/10 px-3 py-2 font-semibold text-danger">المستند ملغي، وقيده معكوس.</p> : null}
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
          {[["الفرع", fin.branchName(doc.branchId)], ["التاريخ", fmtDay(doc.date ?? "")], ["سجله", s?.by || x?.by || "—"], ...(s ? [["الطلبات", s.orders ? String(s.orders) : "—"], ["الضريبة", `${s.vatBp / 100}% ${s.inclusive ? "شاملة" : "مضافة"}`]] : x ? [["استلمه", fin.byId.get(x.toId)?.name.ar ?? "—"], ["المرجع", x.ref || "—"]] : [])].map(([k, v]) => <div key={k}><dt className="text-[12.5px] text-muted">{k}</dt><dd className="font-semibold">{v}</dd></div>)}
        </dl>
        <div className="rounded-xl border border-line">{rows.map(([l, v], i) => <div key={i} className={cn("flex justify-between border-line/60 px-3 py-1.5", i && "border-t", /المطلوب|بدون ضريبة|إجمالي/.test(l) && "bg-surface-2/60 font-bold", /عجز/.test(l) && v && "text-danger")}><span>{l}</span><span className="num" dir="ltr">{fmt(v, "—")}</span></div>)}</div>
        {s?.note || x?.note ? <p className="rounded-xl border border-line px-3 py-2 text-muted">{s?.note || x?.note}</p> : null}
      </div>
      <Confirm open={ask} onClose={() => setAsk(false)} onConfirm={cancel} loading={busy} danger title="إلغاء المستند" confirmLabel="إلغاء المستند" description="المستند لا يتحذف: يتسجل قيد عكسي يلغي أثره، ويفضل ظاهر في القائمة كملغي." />
    </Dialog>
  );
}
