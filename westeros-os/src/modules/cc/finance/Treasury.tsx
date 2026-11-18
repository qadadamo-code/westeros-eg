/** الخزينة والبنوك: الخزائن والحسابات البنكية، سندات القبض والصرف، التحويلات، المصروفات، المصروفات المقدمة، جرد الخزينة وتسوية البنك. */
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowDownToLine, ArrowLeftRight, ArrowUpFromLine, Banknote, Calculator, Paperclip, Plus, Receipt, Repeat, X } from "lucide-react";
import { useDb, useLive } from "@/data/hooks";
import type { FinAccount, FinDoc, FinEntry } from "@/data/financeTypes";
import { cn } from "@/lib/cn";
import { major } from "@/lib/money";
import { readImage } from "@/modules/inventory/bits";
import { Badge, Button, Card, Dialog, EmptyState, Input, Segmented, Select, Switch, Table, Textarea, useToast, type Column } from "@/ui";
import { ExcelImport, type ImportPlan } from "../catalog/Import";
import { fmtDay } from "../lib";
import { ExportButton } from "../ui";
import { sheetNumber } from "../xlsx";
import { amountOf, entryRef, STATUS_LABEL } from "./journal";
import { EntryView, ToolsDialog } from "./Journal";
import { useActor, useFinPerms } from "./perms";
import { autoMatch, BANK_RECON, bankRecon, CASH_COUNT, countedTotal, DENOMINATIONS, METHODS, MONEY_LABEL, moneyAccounts, PREPAID, prepaidSchedule, tafqeet, VOUCHER_LABEL, voucherProblem, type BankReconData, type PrepaidData, type StatementLine, type VoucherInput, type VoucherType } from "./treasury";
import { addMoneyAccount, ensureBranchTills, postCashCount, runPrepaid, saveBankRecon, savePrepaid, saveVoucher } from "./treasuryOps";
import { AccountSelect, Amount, BranchSelect, Confirm, esc, fmt, fromText, periodLabel, periodOf, PeriodPicker, printDoc, PrintButton, printTable, sheetDay, toText, today, type Period, Toolbar } from "./ui";
import { useFinance, type Fin } from "./useFinance";

const err = (e: unknown) => String((e as Error)?.message ?? e);
type Tab = "accounts" | "vouchers" | "prepaid" | "bank";
const VOUCHER_KINDS: VoucherType[] = ["receipt", "payment", "transfer", "expense"];
const ICON: Record<VoucherType, JSX.Element> = { receipt: <ArrowDownToLine />, payment: <ArrowUpFromLine />, transfer: <ArrowLeftRight />, expense: <Receipt /> };

export function printVoucher(fin: Fin, e: FinEntry) {
  const type = e.kind as VoucherType;
  const money = e.lines.map((l) => fin.byId.get(l.account)).find((a) => a && ["cash", "bank", "wallet"].includes(a.kind));
  const body = `<h1>${esc(VOUCHER_LABEL[type] ?? "سند")}</h1>
    <div class="row"><span>رقم: <b>${esc(e.meta?.voucherNo ?? "")}</b></span><span>قيد: <b>${esc(entryRef(e))}</b></span><span>التاريخ: <b>${esc(fmtDay(e.date))}</b></span><span>الفرع: <b>${esc(fin.branchName(e.branchId))}</b></span></div>
    <div class="row"><span class="box" style="flex:1"><span class="lbl">${type === "receipt" ? "استلمنا من" : "صرفنا إلى"}:</span> <b>${esc(e.meta?.party || "—")}</b></span><span class="box"><span class="lbl">المبلغ:</span> <b>${esc(fmt(amountOf(e)))} ج.م</b></span></div>
    <div class="box"><span class="lbl">مبلغ وقدره:</span> <b>${esc(tafqeet(amountOf(e)))}</b></div>
    <div class="row"><span class="box" style="flex:1"><span class="lbl">وذلك عن:</span> ${esc(e.memo)}</span></div>
    <div class="row"><span><span class="lbl">${type === "receipt" ? "الخزينة أو البنك" : "من"}:</span> ${esc(money?.name.ar ?? "—")}</span><span><span class="lbl">طريقة الدفع:</span> ${esc(e.meta?.method || "—")}</span><span><span class="lbl">مرجع:</span> ${esc(e.meta?.ref || "—")}</span></div>
    <table style="width:100%;border-collapse:collapse;margin-top:8px"><tr>${["الحساب", "مدين", "دائن"].map((h) => `<th style="border:1px solid #999;padding:4px 8px;text-align:right;background:#eee">${h}</th>`).join("")}</tr>${e.lines.map((l) => `<tr><td style="border:1px solid #999;padding:4px 8px">${esc(fin.label(l.account))}</td><td style="border:1px solid #999;padding:4px 8px">${l.debit ? fmt(l.debit) : ""}</td><td style="border:1px solid #999;padding:4px 8px">${l.credit ? fmt(l.credit) : ""}</td></tr>`).join("")}</table>
    <div class="sign"><span>المستلم</span><span>أمين الخزينة</span><span>المحاسب</span><span>المدير</span></div>`;
  printDoc(`${VOUCHER_LABEL[type] ?? "سند"} ${e.meta?.voucherNo ?? ""}`, body);
}

export default function Treasury() {
  const fin = useFinance();
  const db = useDb();
  const nav = useNavigate();
  const { toast } = useToast();
  const perms = useFinPerms();
  const can = perms.has("vouchers");
  const [tab, setTab] = useState<Tab>("accounts");
  const [voucher, setVoucher] = useState<{ type: VoucherType; moneyId?: string } | null>(null);
  const [add, setAdd] = useState(false);
  const [count, setCount] = useState<FinAccount | null>(null);
  const [view, setView] = useState<FinEntry | null>(null);
  const money = useMemo(() => moneyAccounts(fin.ix.ordered()), [fin.ix]);
  const day = today();
  const stats = useMemo(() => {
    const m = new Map<string, { balance: number; inToday: number; outToday: number }>();
    for (const a of money) m.set(a.id, { balance: 0, inToday: 0, outToday: 0 });
    for (const e of fin.entries) if (e.status === "posted") for (const l of e.lines) {
      const s = m.get(l.account);
      if (!s) continue;
      s.balance += l.debit - l.credit;
      if (e.date === day) { s.inToday += l.debit; s.outToday += l.credit; }
    }
    return m;
  }, [fin.entries, money, day]);
  const total = [...stats.values()].reduce((s, x) => s + x.balance, 0);
  // charges the prepaid months that are due, once per visit
  const ran = useRef(false);
  useEffect(() => {
    if (ran.current || !can || fin.loading) return;
    ran.current = true;
    void runPrepaid(db, today()).then((n) => n && toast({ title: `تم ترحيل ${n} قسط مصروف مقدم` })).catch(() => undefined);
  }, [db, can, fin.loading, toast]);

  return (
    <div className="grid gap-4">
      <Toolbar lead={<Segmented size="sm" className="max-sm:grid max-sm:w-full max-sm:grid-cols-2 max-sm:[&>button]:h-10" label="الخزينة والبنوك" value={tab} onChange={setTab} options={[{ value: "accounts", label: "الخزائن والبنوك" }, { value: "vouchers", label: "السندات والمصروفات" }, { value: "prepaid", label: "مقدمة ومتكررة" }, { value: "bank", label: "تسوية البنك" }]} />} actions={<>{can ? VOUCHER_KINDS.map((t) => <Button key={t} variant={t === "receipt" ? "primary" : "secondary"} icon={ICON[t]} onClick={() => setVoucher({ type: t })}>{t === "transfer" ? "تحويل" : VOUCHER_LABEL[t]}</Button>) : null}</>} />

      {tab === "accounts" ? (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-[15px]">إجمالي النقدية والبنوك: <b className="text-[18px]"><Amount value={total} zero="0.00" tone="auto" /></b> ج.م</span>
            <span className="flex-1" />
            {perms.has("chart.edit") ? <Button variant="outline" onClick={async () => { try { const n = await ensureBranchTills(db); toast({ tone: "success", title: n ? `تم فتح ${n} خزينة` : "كل فرع له خزينة" }); } catch (e) { toast({ tone: "error", title: "تعذر", description: err(e) }); } }}>خزينة لكل فرع</Button> : null}
            {perms.has("chart.edit") ? <Button variant="outline" icon={<Plus />} onClick={() => setAdd(true)}>إضافة خزينة أو بنك</Button> : null}
          </div>
          {money.length ? (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {money.map((a) => {
                const s = stats.get(a.id)!;
                const low = a.alertMin != null && s.balance < a.alertMin, high = a.alertMax != null && s.balance > a.alertMax;
                return (
                  <Card key={a.id} className={cn("grid gap-2 p-4", (low || high) && "border-danger/60")}>
                    <div className="flex items-start justify-between gap-2">
                      <button type="button" className="min-w-0 text-start" onClick={() => nav(`/finance/reports/ledger?account=${a.id}`)}>
                        <span className="block truncate text-[15.5px] font-bold">{a.name.ar}</span>
                        <span className="num text-[12.5px] text-muted" dir="ltr">{a.code}</span>
                      </button>
                      <Badge size="sm" tone="neutral">{MONEY_LABEL[a.kind]}</Badge>
                    </div>
                    <div className="text-[22px] font-bold"><Amount value={s.balance} zero="0.00" tone="auto" /></div>
                    <div className="flex gap-4 text-[13px] text-muted"><span>وارد اليوم <Amount value={s.inToday} zero="0.00" /></span><span>منصرف اليوم <Amount value={s.outToday} zero="0.00" /></span></div>
                    {low ? <p className="text-[13px] font-semibold text-danger">{s.balance < 0 ? "الرصيد بالسالب" : "الرصيد أقل من الحد"}</p> : high ? <p className="text-[13px] font-semibold text-danger">الرصيد أعلى من الحد، ورّد للبنك</p> : null}
                    {can ? (
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        <Button size="sm" variant="soft" onClick={() => setVoucher({ type: "receipt", moneyId: a.id })}>قبض</Button>
                        <Button size="sm" variant="soft" onClick={() => setVoucher({ type: "payment", moneyId: a.id })}>صرف</Button>
                        <Button size="sm" variant="soft" onClick={() => setVoucher({ type: "transfer", moneyId: a.id })}>تحويل</Button>
                        {a.kind === "cash" ? <Button size="sm" variant="outline" icon={<Calculator />} onClick={() => setCount(a)}>جرد</Button> : null}
                      </div>
                    ) : null}
                  </Card>
                );
              })}
            </div>
          ) : <Card><EmptyState compact icon={<Banknote />} title="لا توجد خزائن أو بنوك" body="حمّل الشجرة الجاهزة أولا، ثم اضغط خزينة لكل فرع أو أضف خزينة أو بنك." /></Card>}
          <CashCounts fin={fin} />
        </>
      ) : null}
      {tab === "vouchers" ? <Vouchers fin={fin} onOpen={setView} /> : null}
      {tab === "prepaid" ? <Prepaid fin={fin} can={can} /> : null}
      {tab === "bank" ? <BankRecon fin={fin} can={can} /> : null}

      {voucher ? <VoucherDialog key={`${voucher.type}-${voucher.moneyId}`} fin={fin} type={voucher.type} moneyId={voucher.moneyId} onClose={() => setVoucher(null)} onSaved={(e) => { setVoucher(null); setView(e); }} /> : null}
      {add ? <AddMoney fin={fin} onClose={() => setAdd(false)} /> : null}
      {count ? <CashCountDialog fin={fin} account={count} book={stats.get(count.id)?.balance ?? 0} onClose={() => setCount(null)} /> : null}
      {view ? <EntryView key={view.id} fin={fin} entry={fin.entries.find((x) => x.id === view.id) ?? view} onClose={() => setView(null)} onOpen={setView} /> : null}
    </div>
  );
}

function VoucherDialog({ fin, type, moneyId, onClose, onSaved }: { fin: Fin; type: VoucherType; moneyId?: string; onClose: () => void; onSaved: (e: FinEntry) => void }) {
  const db = useDb();
  const { toast } = useToast();
  const actor = useActor();
  const money = useMemo(() => moneyAccounts(fin.ix.ordered()), [fin.ix]);
  const [d, setD] = useState({ date: today(), moneyId: moneyId ?? money[0]?.id ?? "", otherId: "", amount: "", vat: "", creditId: "", onCredit: false, party: "", memo: "", branchId: fin.branchId ?? "", centreId: "", method: METHODS[0], ref: "" });
  const [files, setFiles] = useState<FinEntry["attachments"]>([]);
  const [busy, setBusy] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const set = (p: Partial<typeof d>) => setD({ ...d, ...p });
  const input: VoucherInput = {
    type, date: d.date, moneyId: type === "expense" && d.onCredit ? "" : d.moneyId, otherId: d.otherId, amount: fromText(d.amount), vat: type === "expense" ? fromText(d.vat) : 0, creditId: type === "expense" && d.onCredit ? d.creditId : undefined,
    party: d.party, memo: d.memo, branchId: d.branchId || null, centreId: d.centreId || null, method: d.method, ref: d.ref, attachments: files,
  };
  const problem = voucherProblem(input);
  const limit = fin.settings.approvalLimit;
  const waits = limit != null && input.amount + (input.vat ?? 0) > limit && !actor.canApprove;
  const centres = fin.centres.filter((c) => c.active);
  const moneyOptions = (skip?: string) => [{ value: "", label: "اختر" }, ...money.filter((a) => a.id !== skip).map((a) => ({ value: a.id, label: `${a.name.ar} (${MONEY_LABEL[a.kind]})` }))];
  const save = async () => {
    setBusy(true);
    try {
      const e = await saveVoucher(db, input, actor);
      toast({ tone: "success", title: e.status === "pending" ? "السند في انتظار الاعتماد" : `تم ترحيل ${VOUCHER_LABEL[type]} رقم ${e.meta.voucherNo}` });
      onSaved(e);
    } catch (e) { toast({ tone: "error", title: "تعذر الحفظ", description: err(e), duration: 9000 }); } finally { setBusy(false); }
  };
  return (
    <Dialog open onClose={onClose} size="lg" title={VOUCHER_LABEL[type]}
      footer={<div className="flex flex-wrap items-center justify-end gap-2">
        {problem ? <span className="me-auto text-[13px] font-semibold text-danger">{problem}</span> : waits ? <span className="me-auto text-[13px] text-muted">المبلغ فوق حد الاعتماد، السند يذهب للمدير</span> : <span className="me-auto text-[13px] text-muted">{tafqeet(input.amount + (input.vat ?? 0))}</span>}
        <Button variant="ghost" onClick={onClose}>إلغاء</Button><Button loading={busy} disabled={!!problem} onClick={save}>{waits ? "إرسال للاعتماد" : "حفظ وترحيل"}</Button>
      </div>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Input label="التاريخ" type="date" dir="ltr" value={d.date} onChange={(e) => set({ date: e.target.value })} />
        <Input label={type === "expense" ? "المبلغ بدون ضريبة (ج.م)" : "المبلغ (ج.م)"} dir="ltr" inputMode="decimal" autoFocus value={d.amount} onChange={(e) => set({ amount: e.target.value })} />
        {type === "expense" ? <div className="sm:col-span-2"><Switch checked={d.onCredit} onChange={(v) => set({ onCredit: v })} label="مصروف آجل (لم يدفع بعد)" description="يتسجل على حساب مورد أو مصروفات مستحقة بدل الخزينة" /></div> : null}
        {type === "expense" && d.onCredit
          ? <AccountSelect fin={fin} label="على حساب" value={d.creditId} onChange={(v) => set({ creditId: v })} filter={(a) => a.type === "liability"} />
          : <Select label={type === "receipt" ? "إلى خزينة أو بنك" : type === "transfer" ? "من خزينة أو بنك" : "من خزينة أو بنك"} value={d.moneyId} onChange={(e) => set({ moneyId: e.target.value })} options={moneyOptions()} />}
        {type === "transfer"
          ? <Select label="إلى خزينة أو بنك" value={d.otherId} onChange={(e) => set({ otherId: e.target.value })} options={moneyOptions(d.moneyId)} />
          : <AccountSelect fin={fin} manualOnly label={type === "receipt" ? "من حساب (الدائن)" : type === "payment" ? "إلى حساب (المدين)" : "حساب المصروف"} value={d.otherId} onChange={(v) => set({ otherId: v })}
              filter={type === "expense" ? (a) => a.type === "expense" || a.type === "cogs" : (a) => !["cash", "bank", "wallet"].includes(a.kind)} />}
        {type === "expense" ? <Input label="ضريبة قيمة مضافة (ج.م)" dir="ltr" inputMode="decimal" value={d.vat} onChange={(e) => set({ vat: e.target.value })} hint={<button type="button" className="text-primary underline-offset-2 hover:underline" onClick={() => set({ vat: toText(Math.round(fromText(d.amount) * 0.14)) })}>احسب 14%</button>} /> : null}
        {type !== "transfer" ? <Input label={type === "receipt" ? "استلمنا من" : "المستفيد"} value={d.party} onChange={(e) => set({ party: e.target.value })} /> : null}
        <Select label="طريقة الدفع" value={d.method} onChange={(e) => set({ method: e.target.value })} options={METHODS.map((m) => ({ value: m, label: m }))} />
        <Input label="رقم مرجعي (شيك، تحويل، فاتورة)" dir="ltr" value={d.ref} onChange={(e) => set({ ref: e.target.value })} />
        <BranchSelect fin={fin} label="الفرع" className="w-full" all={null} value={d.branchId} onChange={(v) => set({ branchId: v })} />
        {centres.length && type !== "transfer" ? <Select label="مركز التكلفة" value={d.centreId} onChange={(e) => set({ centreId: e.target.value })} options={[{ value: "", label: "بدون مركز تكلفة" }, ...centres.map((c) => ({ value: c.id, label: c.name.ar }))]} /> : null}
        <div className="sm:col-span-2"><Textarea label="البيان" rows={2} value={d.memo} onChange={(e) => set({ memo: e.target.value })} /></div>
        <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
          <input ref={file} type="file" accept="image/*" className="hidden" onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (!f) return;
            if (f.size > 2 * 1024 * 1024) return toast({ tone: "error", title: "الملف أكبر من 2 ميجا" });
            setFiles([...files, { name: f.name, url: await readImage(f, 1200) }]);
          }} />
          <Button type="button" variant="outline" icon={<Paperclip />} onClick={() => file.current?.click()}>إرفاق صورة الفاتورة أو الإيصال</Button>
          {files.map((f, i) => <span key={i} className="inline-flex items-center gap-1.5 rounded-lg border border-line px-2 py-1 text-[13px]"><Paperclip className="size-3.5" />{f.name}<button type="button" aria-label="حذف المرفق" onClick={() => setFiles(files.filter((_, j) => j !== i))}><X className="size-3.5" /></button></span>)}
        </div>
      </div>
    </Dialog>
  );
}

function Vouchers({ fin, onOpen }: { fin: Fin; onOpen: (e: FinEntry) => void }) {
  const [period, setPeriod] = useState<Period>(periodOf("month", fin.settings.yearStartMonth));
  const [kind, setKind] = useState("");
  const [q, setQ] = useState("");
  const rows = useMemo(() => fin.entries.filter((e) => (VOUCHER_KINDS as string[]).includes(e.kind) && (!kind || e.kind === kind) && (!period.from || e.date >= period.from) && (!period.to || e.date <= period.to)
    && (!q.trim() || e.memo.includes(q.trim()) || String(e.meta?.party ?? "").includes(q.trim()) || String(e.meta?.voucherNo ?? "") === q.trim() || String(e.meta?.ref ?? "").includes(q.trim())))
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)), [fin.entries, kind, period, q]);
  const sum = (k: string) => rows.filter((e) => e.kind === k && e.status === "posted").reduce((s, e) => s + amountOf(e), 0);
  const columns: Column<FinEntry>[] = [
    { key: "no", header: "السند", cell: (e) => <span className="font-semibold">{VOUCHER_LABEL[e.kind as VoucherType]} <span className="num" dir="ltr">{String(e.meta?.voucherNo ?? "")}</span></span> },
    { key: "date", header: "التاريخ", cell: (e) => <span className="num">{fmtDay(e.date)}</span> },
    { key: "party", header: "الطرف", hideOnMobile: true, cell: (e) => String(e.meta?.party || "—") },
    { key: "memo", header: "البيان", cell: (e) => <span className="line-clamp-1 max-w-[22rem]">{e.memo}</span> },
    { key: "method", header: "الدفع", hideOnMobile: true, cell: (e) => <span className="text-muted">{String(e.meta?.method || "—")}</span> },
    { key: "amount", header: "المبلغ (ج.م)", align: "end", cell: (e) => <Amount value={amountOf(e)} /> },
    { key: "status", header: "الحالة", cell: (e) => <Badge size="sm" tone={e.status === "posted" ? "ok" : e.status === "pending" ? "warn" : "neutral"}>{e.reversedBy ? "معكوس" : STATUS_LABEL[e.status]}</Badge> },
    { key: "print", header: "", align: "end", cell: (e) => <span onClick={(x) => x.stopPropagation()}><PrintButton size="sm" onClick={() => printVoucher(fin, e)} /></span> },
  ];
  return (
    <div className="grid gap-3">
      <Toolbar collapse more={<><ExportButton file="السندات" head={["النوع", "رقم السند", "رقم القيد", "التاريخ", "الطرف", "البيان", "طريقة الدفع", "مرجع", "المبلغ", "الحالة"]} rows={() => rows.map((e) => [VOUCHER_LABEL[e.kind as VoucherType], Number(e.meta?.voucherNo) || "", entryRef(e), e.date, String(e.meta?.party ?? ""), e.memo, String(e.meta?.method ?? ""), String(e.meta?.ref ?? ""), amountOf(e) / 100000, STATUS_LABEL[e.status]])} /><PrintButton onClick={() => printTable("السندات والمصروفات", periodLabel(period), ["السند", "التاريخ", "الطرف", "البيان", "المبلغ"], rows.map((e) => [`${VOUCHER_LABEL[e.kind as VoucherType]} ${e.meta?.voucherNo ?? ""}`, fmtDay(e.date), String(e.meta?.party ?? ""), e.memo, { text: fmt(amountOf(e)), align: "end" as const }]))} /></>}>
        <Input label="بحث" wrapClassName="fin-wide" className="w-52" placeholder="رقم، طرف، بيان، مرجع" value={q} onChange={(e) => setQ(e.target.value)} />
        <PeriodPicker value={period} onChange={setPeriod} startMonth={fin.settings.yearStartMonth} />
        <Select label="النوع" className="w-48" value={kind} onChange={(e) => setKind(e.target.value)} options={[{ value: "", label: "الكل" }, ...VOUCHER_KINDS.map((k) => ({ value: k, label: VOUCHER_LABEL[k] }))]} />
      </Toolbar>
      <div className="flex flex-wrap gap-x-6 gap-y-1 text-[14px]"><span>المقبوضات <b><Amount value={sum("receipt")} zero="0.00" /></b></span><span>المدفوعات <b><Amount value={sum("payment")} zero="0.00" /></b></span><span>المصروفات <b><Amount value={sum("expense")} zero="0.00" /></b></span><span>التحويلات <b><Amount value={sum("transfer")} zero="0.00" /></b></span></div>
      <Card className="overflow-hidden"><Table columns={columns} rows={rows} rowKey={(e) => e.id} onRowClick={onOpen} empty={<EmptyState compact icon={<Receipt />} title="لا توجد سندات في هذه الفترة" />} /></Card>
    </div>
  );
}

function AddMoney({ fin, onClose }: { fin: Fin; onClose: () => void }) {
  const db = useDb();
  const { toast } = useToast();
  const [kind, setKind] = useState<"cash" | "bank" | "wallet">("bank");
  const [name, setName] = useState("");
  const [branch, setBranch] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try { await addMoneyAccount(db, { kind, name, branchId: branch || null, note }); toast({ tone: "success", title: "تمت الإضافة" }); onClose(); } catch (e) { toast({ tone: "error", title: "تعذر الحفظ", description: err(e), duration: 9000 }); } finally { setBusy(false); }
  };
  return (
    <Dialog open onClose={onClose} size="sm" title="إضافة خزينة أو بنك" footer={<div className="flex justify-end gap-2"><Button variant="ghost" onClick={onClose}>إلغاء</Button><Button loading={busy} disabled={!name.trim()} onClick={save}>إضافة</Button></div>}>
      <div className="grid gap-3">
        <Select label="النوع" value={kind} onChange={(e) => setKind(e.target.value as typeof kind)} options={[{ value: "cash", label: "خزينة" }, { value: "bank", label: "حساب بنكي" }, { value: "wallet", label: "محفظة إلكترونية" }]} />
        <Input label="الاسم" placeholder={kind === "bank" ? "مثال: البنك الأهلي جاري" : kind === "cash" ? "مثال: خزينة الإدارة" : "مثال: فودافون كاش المحل"} value={name} onChange={(e) => setName(e.target.value)} />
        <BranchSelect fin={fin} label="الفرع" className="w-full" value={branch} onChange={setBranch} />
        <Input label={kind === "bank" ? "رقم الحساب أو ملاحظات" : "ملاحظات"} value={note} onChange={(e) => setNote(e.target.value)} />
        <p className="text-[13px] text-muted">يتفتح له حساب تلقائيا في الشجرة تحت {kind === "cash" ? "خزائن الفروع" : kind === "bank" ? "البنوك" : "المحافظ والتحصيل الإلكتروني"}.</p>
      </div>
    </Dialog>
  );
}

function CashCountDialog({ fin, account, book, onClose }: { fin: Fin; account: FinAccount; book: number; onClose: () => void }) {
  const db = useDb();
  const { toast } = useToast();
  const actor = useActor();
  const [pieces, setPieces] = useState<Record<string, number>>({});
  const [direct, setDirect] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const counted = direct.trim() ? fromText(direct) : countedTotal(pieces);
  const diff = counted - book;
  const save = async () => {
    setBusy(true);
    try { const r = await postCashCount(db, { accountId: account.id, date: today(), counted, pieces, note }, actor); toast({ tone: "success", title: r.diff ? `تم الجرد وترحيل ${r.diff > 0 ? "الزيادة" : "العجز"}` : "تم الجرد، الخزينة مطابقة" }); onClose(); } catch (e) { toast({ tone: "error", title: "تعذر الحفظ", description: err(e), duration: 9000 }); } finally { setBusy(false); }
  };
  void fin;
  return (
    <Dialog open onClose={onClose} size="md" title={`جرد ${account.name.ar}`} footer={<div className="flex justify-end gap-2"><Button variant="ghost" onClick={onClose}>إلغاء</Button><Button loading={busy} onClick={save}>حفظ الجرد</Button></div>}>
      <div className="grid gap-3">
        <div className="grid grid-cols-3 gap-2">
          {DENOMINATIONS.map((x) => <Input key={x} label={`فئة ${x}`} dir="ltr" inputMode="numeric" placeholder="العدد" value={pieces[String(x)] ? String(pieces[String(x)]) : ""} onChange={(e) => setPieces({ ...pieces, [String(x)]: Math.max(0, Math.round(Number(e.target.value) || 0)) })} />)}
        </div>
        <Input label="أو اكتب الإجمالي المعدود مباشرة (ج.م)" dir="ltr" inputMode="decimal" value={direct} onChange={(e) => setDirect(e.target.value)} />
        <div className="grid gap-1 rounded-xl bg-surface-2 px-3 py-2.5 text-[14.5px]">
          <span className="flex justify-between">رصيد الدفتر <b><Amount value={book} zero="0.00" /></b></span>
          <span className="flex justify-between">المعدود <b><Amount value={counted} zero="0.00" /></b></span>
          <span className={cn("flex justify-between font-bold", diff ? "text-danger" : "text-ok")}>{diff > 0 ? "زيادة" : diff < 0 ? "عجز" : "مطابق"} <Amount value={Math.abs(diff)} zero="0.00" /></span>
        </div>
        <Input label="ملاحظات" value={note} onChange={(e) => setNote(e.target.value)} />
        <p className="text-[13px] text-muted">العجز أو الزيادة يترحل بقيد على حساب فروق خزينة، ورصيد الخزينة يصبح مساويا للمعدود.</p>
      </div>
    </Dialog>
  );
}

function CashCounts({ fin }: { fin: Fin }) {
  const docs = useLive("finDocs", { where: { kind: CASH_COUNT } }).data;
  const rows = useMemo(() => [...docs].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 8), [docs]);
  void fin;
  if (!rows.length) return null;
  return (
    <Card className="grid gap-2 p-4">
      <h2 className="text-[15.5px] font-bold">آخر جرد للخزائن</h2>
      <ul className="grid gap-1.5 text-[14px]">
        {rows.map((d) => { const x = d.data as { counted: number; book: number; diff: number; by?: string }; return (
          <li key={d.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border border-line px-3 py-2"><b>{d.name}</b><span className="num text-muted">{fmtDay(d.date)}</span><span className="text-muted">{x.by}</span><span className="flex-1" /><span>المعدود <Amount value={x.counted} zero="0.00" /></span><span className={cn("font-semibold", x.diff ? "text-danger" : "text-ok")}>{x.diff > 0 ? "زيادة" : x.diff < 0 ? "عجز" : "مطابق"} {x.diff ? <Amount value={Math.abs(x.diff)} /> : null}</span></li>
        ); })}
      </ul>
    </Card>
  );
}

function Prepaid({ fin, can }: { fin: Fin; can: boolean }) {
  const db = useDb();
  const { toast } = useToast();
  const docs = useLive("finDocs", { where: { kind: PREPAID } }).data;
  const [edit, setEdit] = useState<FinDoc | "new" | null>(null);
  const [recurring, setRecurring] = useState(false);
  const [stop, setStop] = useState<FinDoc | null>(null);
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-[16px] font-bold">مصروفات مدفوعة مقدما</h2>
        <span className="flex-1" />
        {can ? <Button variant="secondary" icon={<Repeat />} onClick={() => setRecurring(true)}>مصروفات وقيود متكررة</Button> : null}
        {can ? <Button icon={<Plus />} onClick={() => setEdit("new")}>مصروف مقدم جديد</Button> : null}
      </div>
      <p className="text-[13.5px] text-muted">مبلغ مدفوع عن عدة شهور (إيجار سنة، تأمين، اشتراك سنوي). السيستم يحمل كل شهر بنصيبه تلقائيا: مدين المصروف، دائن المصروف المقدم.</p>
      {docs.length ? (
        <div className="grid gap-3 lg:grid-cols-2">
          {[...docs].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((d) => {
            const x = d.data as unknown as PrepaidData;
            const sched = prepaidSchedule(x);
            const done = sched.filter((s) => x.posted.includes(s.month)).reduce((s, r) => s + r.amount, 0);
            return (
              <Card key={d.id} className="grid gap-2 p-4">
                <div className="flex items-start justify-between gap-2"><b className="text-[15.5px]">{d.name}</b><Badge size="sm" tone={d.status === "active" ? "ok" : "neutral"}>{d.status === "active" ? "جاري" : d.status === "done" ? "انتهى" : "موقوف"}</Badge></div>
                <div className="text-[13.5px] text-muted">{fin.label(x.expenseAccount)} · {x.months} شهر من {x.start.split("-").reverse().join("/")}</div>
                <div className="h-2 overflow-hidden rounded-full bg-surface-2"><div className="h-full bg-primary" style={{ width: `${Math.min(100, (done / Math.max(1, x.total)) * 100)}%` }} /></div>
                <div className="flex flex-wrap gap-x-5 text-[14px]"><span>الإجمالي <b><Amount value={x.total} /></b></span><span>تم تحميله <b><Amount value={done} zero="0.00" /></b></span><span>الباقي <b><Amount value={x.total - done} zero="0.00" /></b></span><span className="text-muted">{x.posted.length} من {x.months} شهر</span></div>
                {can ? <div className="flex gap-1.5">{!x.posted.length ? <Button size="sm" variant="outline" onClick={() => setEdit(d)}>تعديل</Button> : null}{d.status === "active" ? <Button size="sm" variant="danger-soft" onClick={() => setStop(d)}>إيقاف</Button> : d.status === "stopped" ? <Button size="sm" variant="outline" onClick={() => void db.update("finDocs", d.id, { status: "active" })}>تفعيل</Button> : null}</div> : null}
              </Card>
            );
          })}
        </div>
      ) : <Card><EmptyState compact icon={<Receipt />} title="لا توجد مصروفات مقدمة" /></Card>}
      {edit ? <PrepaidDialog key={edit === "new" ? "new" : edit.id} fin={fin} row={edit === "new" ? null : edit} onClose={() => setEdit(null)} /> : null}
      {recurring ? <ToolsDialog fin={fin} mode="recurring" onClose={() => setRecurring(false)} onUse={() => undefined} /> : null}
      <Confirm open={!!stop} onClose={() => setStop(null)} danger title="إيقاف المصروف المقدم" confirmLabel="إيقاف" description="الشهور التي تم تحميلها تبقى كما هي، والباقي يتوقف تحميله حتى تفعله من جديد."
        onConfirm={async () => { if (stop) await db.update("finDocs", stop.id, { status: "stopped" }); setStop(null); toast({ tone: "success", title: "تم الإيقاف" }); }} />
    </div>
  );
}

function PrepaidDialog({ fin, row, onClose }: { fin: Fin; row: FinDoc | null; onClose: () => void }) {
  const db = useDb();
  const { toast } = useToast();
  const actor = useActor();
  const x = row?.data as unknown as PrepaidData | undefined;
  const money = useMemo(() => moneyAccounts(fin.ix.ordered()), [fin.ix]);
  const pre = fin.ix.byCode.get(fin.settings.links.prepaid ?? "");
  const firstLeaf = pre ? (pre.postable ? pre : fin.ix.descendants(pre.code).find((a) => a.postable)) : undefined;
  const [d, setD] = useState({ name: row?.name ?? "", total: toText(x?.total), months: String(x?.months ?? 12), start: x?.start ?? today().slice(0, 7), prepaid: x?.prepaidAccount ?? firstLeaf?.id ?? "", expense: x?.expenseAccount ?? "", centreId: x?.centreId ?? "", branchId: row?.branchId ?? fin.branchId ?? "", payFrom: "" });
  const [busy, setBusy] = useState(false);
  const set = (p: Partial<typeof d>) => setD({ ...d, ...p });
  const total = fromText(d.total), months = Math.max(1, Math.round(Number(d.months) || 0));
  const save = async () => {
    setBusy(true);
    try {
      await savePrepaid(db, row, { name: d.name, branchId: d.branchId || null, data: { total, months, start: d.start, prepaidAccount: d.prepaid, expenseAccount: d.expense, centreId: d.centreId || null } });
      // paying it now is one payment voucher: مدين المصروف المقدم، دائن الخزينة
      if (!row && d.payFrom) await saveVoucher(db, { type: "payment", date: today(), moneyId: d.payFrom, otherId: d.prepaid, amount: total, party: "", memo: `${d.name} (مدفوع مقدما عن ${months} شهر)`, branchId: d.branchId || null }, actor);
      await runPrepaid(db, today());
      toast({ tone: "success", title: "تم الحفظ" });
      onClose();
    } catch (e) { toast({ tone: "error", title: "تعذر الحفظ", description: err(e), duration: 9000 }); } finally { setBusy(false); }
  };
  return (
    <Dialog open onClose={onClose} size="lg" title={row ? "تعديل مصروف مقدم" : "مصروف مقدم جديد"} footer={<div className="flex items-center justify-end gap-2"><span className="me-auto text-[13.5px] text-muted">نصيب الشهر: <b className="num" dir="ltr">{fmt(Math.floor(total / months))}</b> ج.م</span><Button variant="ghost" onClick={onClose}>إلغاء</Button><Button loading={busy} disabled={!d.name.trim() || !total || !d.prepaid || !d.expense} onClick={save}>حفظ</Button></div>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2"><Input label="الاسم" placeholder="مثال: إيجار المحل 2027" value={d.name} onChange={(e) => set({ name: e.target.value })} /></div>
        <Input label="المبلغ الإجمالي (ج.م)" dir="ltr" inputMode="decimal" value={d.total} onChange={(e) => set({ total: e.target.value })} />
        <Input label="عدد الشهور" dir="ltr" inputMode="numeric" value={d.months} onChange={(e) => set({ months: e.target.value })} />
        <Input label="أول شهر يتحمل" type="month" dir="ltr" value={d.start} onChange={(e) => set({ start: e.target.value })} />
        <BranchSelect fin={fin} label="الفرع" className="w-full" all={null} value={d.branchId} onChange={(v) => set({ branchId: v })} />
        <AccountSelect fin={fin} label="حساب المصروف المقدم" value={d.prepaid} onChange={(v) => set({ prepaid: v })} filter={(a) => a.type === "asset"} />
        <AccountSelect fin={fin} label="حساب المصروف" value={d.expense} onChange={(v) => set({ expense: v })} filter={(a) => a.type === "expense" || a.type === "cogs"} />
        {fin.centres.length ? <Select label="مركز التكلفة" value={d.centreId} onChange={(e) => set({ centreId: e.target.value })} options={[{ value: "", label: "بدون مركز تكلفة" }, ...fin.centres.filter((c) => c.active).map((c) => ({ value: c.id, label: c.name.ar }))]} /> : null}
        {!row ? <Select label="ادفعه الآن من (اختياري)" value={d.payFrom} onChange={(e) => set({ payFrom: e.target.value })} options={[{ value: "", label: "مدفوع من قبل، لا تعمل سند صرف" }, ...money.map((a) => ({ value: a.id, label: a.name.ar }))]} /> : null}
      </div>
    </Dialog>
  );
}

function BankRecon({ fin, can }: { fin: Fin; can: boolean }) {
  const db = useDb();
  const { toast } = useToast();
  const docs = useLive("finDocs", { where: { kind: BANK_RECON } }).data;
  const banks = useMemo(() => fin.ix.ordered().filter((a) => a.postable && (a.kind === "bank" || a.kind === "wallet")), [fin.ix]);
  const [accountId, setAccountId] = useState(banks[0]?.id ?? "");
  const open = docs.find((d) => d.status === "open" && (d.data as unknown as BankReconData).accountId === accountId) ?? null;
  const closed = useMemo(() => docs.filter((d) => d.status === "closed" && (d.data as unknown as BankReconData).accountId === accountId).sort((a, b) => (b.date ?? "").localeCompare(a.date ?? "")), [docs, accountId]);
  const [date, setDate] = useState(today());
  const [balance, setBalance] = useState("");
  const [cleared, setCleared] = useState<string[]>([]);
  const [statement, setStatement] = useState<StatementLine[]>([]);
  const [ask, setAsk] = useState(false);
  // a reconciliation left open is picked up where it stopped
  useEffect(() => {
    const x = open?.data as unknown as BankReconData | undefined;
    setDate(open?.date ?? today());
    setBalance(x ? toText(x.statementBalance) || "0" : "");
    setCleared(x?.cleared ?? []);
    setStatement(x?.statement ?? []);
  }, [open?.id, accountId]); // eslint-disable-line react-hooks/exhaustive-deps
  const data: BankReconData = { accountId, statementBalance: fromText(balance), cleared, statement };
  const r = useMemo(() => bankRecon(accountId, fin.entries, { date, data }, closed), [accountId, fin.entries, date, balance, cleared, closed]); // eslint-disable-line react-hooks/exhaustive-deps
  const acc = fin.byId.get(accountId);
  const toggle = (key: string) => setCleared(cleared.includes(key) ? cleared.filter((k) => k !== key) : [...cleared, key]);
  const save = async (close = false) => {
    try { await saveBankRecon(db, open, { name: acc?.name.ar ?? "", date, branchId: acc?.branchId ?? null, data, close }); toast({ tone: "success", title: close ? "تم إقفال التسوية" : "تم حفظ التسوية" }); setAsk(false); } catch (e) { toast({ tone: "error", title: "تعذر الحفظ", description: err(e) }); }
  };
  const fromSheet = async (sheet: Record<string, string>[], dry: boolean): Promise<ImportPlan> => {
    const plan: ImportPlan = { added: [], updated: [], skipped: 0 };
    const lines: StatementLine[] = [];
    for (const row of sheet) {
      const day = sheetDay(row["التاريخ"]);
      const amount = major(sheetNumber(row["دائن"]) - sheetNumber(row["مدين"]));
      if (!day || !amount) { plan.skipped++; continue; }
      lines.push({ date: day, memo: row["البيان"] ?? "", amount });
      plan.added.push({ code: day, name: `${row["البيان"] ?? ""} ${fmt(amount)}` });
    }
    if (!dry) {
      const matched = autoMatch(lines, r.rows);
      setStatement(matched);
      setCleared([...new Set([...cleared, ...matched.map((s) => s.match).filter(Boolean) as string[]])]);
    }
    return plan;
  };
  if (!banks.length) return <Card><EmptyState compact icon={<Banknote />} title="لا توجد حسابات بنكية" body="أضف حساب بنكي من تبويب الخزائن والبنوك أولا." /></Card>;
  const unmatched = statement.filter((s) => !s.match);
  return (
    <div className="grid gap-4">
      <Toolbar actions={<>{can ? <Button variant="secondary" onClick={() => save(false)}>حفظ</Button> : null}{can ? <Button disabled={r.difference !== 0 || !balance.trim()} onClick={() => setAsk(true)}>إقفال التسوية</Button> : null}</>} more={<>{can ? <ExcelImport fields={[{ key: "التاريخ", aliases: ["date", "تاريخ"] }, { key: "البيان", aliases: ["description", "الوصف"] }, { key: "مدين", aliases: ["debit", "سحب", "مسحوبات"] }, { key: "دائن", aliases: ["credit", "إيداع", "ايداع"] }]} run={fromSheet} skipNote="سطر بدون تاريخ أو بدون مبلغ. الاعتماد يطابق السطور مع القيود ويعلم على المتطابق فقط، ولا يعمل قيود." /> : null}</>}>
        <Select label="الحساب البنكي" className="w-64" value={accountId} onChange={(e) => setAccountId(e.target.value)} options={banks.map((a) => ({ value: a.id, label: a.name.ar }))} />
        <Input label="تاريخ كشف البنك" type="date" dir="ltr" className="w-44" value={date} onChange={(e) => setDate(e.target.value || today())} />
        <Input label="رصيد كشف البنك (ج.م)" dir="ltr" inputMode="decimal" className="w-44" value={balance} onChange={(e) => setBalance(e.target.value)} />
      </Toolbar>
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-5 max-lg:[&>*:last-child:nth-child(odd)]:col-span-2">
        {[["رصيد الدفتر", r.book], ["رصيد كشف البنك", data.statementBalance], ["إيداعات لم تظهر في البنك", r.depositsInTransit], ["مدفوعات لم تصرف", r.outstanding], ["الفرق", r.difference]].map(([label, v], i) => (
          <Card key={label as string} className={cn("p-3", i === 4 && (v ? "border-danger/60" : "border-ok/50"))}><div className="text-[12.5px] text-muted">{label}</div><div className={cn("text-[18px] font-bold", i === 4 && (v ? "text-danger" : "text-ok"))}><Amount value={v as number} zero="0.00" /></div></Card>
        ))}
      </div>
      <p className="text-[13.5px] text-muted">علّم على كل حركة ظهرت في كشف البنك. عندما يصبح الفرق صفر اضغط إقفال التسوية، والحركات المعلمة لا تظهر في التسوية القادمة.</p>
      <Card className="overflow-hidden">
        <div className="overflow-x-auto thin-scrollbar">
          <table className="w-full text-[14px]">
            <thead><tr className="text-[12.5px] text-muted"><th className="w-12 border-b border-line px-3 py-2.5" /><th className="border-b border-line px-3 py-2.5 text-start font-semibold">التاريخ</th><th className="border-b border-line px-3 py-2.5 text-start font-semibold">القيد</th><th className="border-b border-line px-3 py-2.5 text-start font-semibold">البيان</th><th className="border-b border-line px-3 py-2.5 text-end font-semibold">إيداع</th><th className="border-b border-line px-3 py-2.5 text-end font-semibold">سحب</th></tr></thead>
            <tbody>
              {r.rows.map((x) => (
                <tr key={x.key} className={cn("cursor-pointer border-t border-line/60 hover:bg-surface-2", x.cleared && "bg-ok/5")} onClick={() => can && toggle(x.key)}>
                  <td className="px-3 py-2"><input type="checkbox" aria-label="ظهرت في كشف البنك" className="size-4.5 accent-[var(--color-primary)]" checked={x.cleared} disabled={!can} onChange={() => toggle(x.key)} onClick={(e) => e.stopPropagation()} /></td>
                  <td className="num px-3 py-2">{fmtDay(x.entry.date)}</td><td className="num px-3 py-2 text-muted" dir="ltr">{entryRef(x.entry)}</td><td className="px-3 py-2">{x.line.memo || x.entry.memo}</td>
                  <td className="px-3 py-2 text-end"><Amount value={Math.max(0, x.amount)} zero="" /></td><td className="px-3 py-2 text-end"><Amount value={Math.max(0, -x.amount)} zero="" /></td>
                </tr>
              ))}
              {!r.rows.length ? <tr><td colSpan={6} className="px-3 py-8 text-center text-muted">لا توجد حركات غير مسواة على هذا الحساب حتى هذا التاريخ</td></tr> : null}
            </tbody>
          </table>
        </div>
      </Card>
      {unmatched.length ? (
        <Card className="grid gap-2 p-4">
          <h3 className="text-[15px] font-bold">سطور في كشف البنك ليس لها قيد ({unmatched.length})</h3>
          <p className="text-[13.5px] text-muted">غالبا عمولات بنكية أو فوائد أو إيداعات لم تسجل. سجلها بسند صرف أو قبض على هذا الحساب ثم علّم عليها.</p>
          <ul className="grid gap-1 text-[14px]">{unmatched.map((s, i) => <li key={i} className="flex flex-wrap gap-x-4 rounded-lg border border-line px-3 py-1.5"><span className="num">{fmtDay(s.date)}</span><span className="flex-1">{s.memo}</span><Amount value={s.amount} tone="auto" /></li>)}</ul>
        </Card>
      ) : null}
      {closed.length ? (
        <Card className="grid gap-2 p-4">
          <h3 className="text-[15px] font-bold">تسويات سابقة</h3>
          <ul className="grid gap-1 text-[14px]">{closed.map((d) => <li key={d.id} className="flex flex-wrap gap-x-4 rounded-lg border border-line px-3 py-1.5"><span className="num">{fmtDay(d.date)}</span><span className="flex-1 text-muted">{(d.data as unknown as BankReconData).cleared.length} حركة مسواة</span><span>رصيد البنك <Amount value={(d.data as unknown as BankReconData).statementBalance} zero="0.00" /></span></li>)}</ul>
        </Card>
      ) : null}
      <Confirm open={ask} onClose={() => setAsk(false)} onConfirm={() => save(true)} title="إقفال تسوية البنك" confirmLabel="إقفال" description={`الفرق صفر. بعد الإقفال لا تتعدل هذه التسوية، والحركات المعلمة (${cleared.length}) لا تظهر في التسوية القادمة.`} />
    </div>
  );
}
