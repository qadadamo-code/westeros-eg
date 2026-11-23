/** المشتريات والموردون: الموردون وأرصدتهم، فواتير الشراء، المرتجعات، السداد، وأعمار الديون. */
import { useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Banknote, FileText, PackageCheck, Paperclip, Pencil, Plus, Truck, Undo2, X } from "lucide-react";
import { useDb, useLive } from "@/data/hooks";
import type { FinDoc, FinEntry } from "@/data/financeTypes";
import type { StockItem, StockRequest } from "@/data/inventoryTypes";
import { awaitingInvoice, awaitingInvoices } from "../stores/purchase";
import { cn } from "@/lib/cn";
import { readImage } from "@/modules/inventory/bits";
import { Badge, Button, Card, Dialog, EmptyState, Input, Segmented, Select, Switch, Textarea, useToast } from "@/ui";
import { fmtDay, lineUnit } from "../lib";
import { ExportButton } from "../ui";
import { EntryView } from "./Journal";
import { useActor, useFinPerms } from "./perms";
import { AGE_BUCKETS, daysLate, supplierBook, paySplit, PURCHASE, PURCHASE_RETURN, purchaseOf, purchaseProblem, purchaseTotals, supplierOf, type PurchaseLine } from "./purchases";
import { paySupplier, postPurchase, postReturn, saveSupplier } from "./purchaseOps";
import { METHODS, MONEY_LABEL, moneyAccounts } from "./treasury";
import { AccountSelect, BranchSelect, esc, fmt, fromText, printDoc, PrintButton, printTable, toText, today, Toolbar } from "./ui";
import { baseOf } from "./currency";
import { useAmountCurrency } from "./AmountCurrency";
import { useFinance, type Fin } from "./useFinance";

const err = (e: unknown) => String((e as Error)?.message ?? e);
type Tab = "received" | "suppliers" | "invoices" | "returns" | "ageing";
const addDays = (d: string, n: number) => new Date(Date.parse(d) + n * 86_400_000).toISOString().slice(0, 10);

function useSuppliers(fin: Fin, docs: FinDoc[]) {
  return useMemo(() => supplierBook(docs, fin.entries, today()), [docs, fin.entries]);
}

export default function Purchases() {
  const fin = useFinance();
  const perms = useFinPerms();
  const can = perms.has("vouchers");
  const docs = useLive("finDocs").data;
  const [tabPicked, setTab] = useState<Tab | null>(null);
  const [supplier, setSupplier] = useState<FinDoc | "new" | null>(null);
  const [invoice, setInvoice] = useState<{ supplierId?: string; request?: StockRequest } | null>(null);
  // طلب شراء: what the warehouse keeper received and no purchase invoice entered yet
  const requests = useLive("stockRequests").data;
  const received = useMemo(() => awaitingInvoices(requests), [requests]);
  const [ret, setRet] = useState<{ of?: FinDoc; supplierId?: string } | null>(null);
  const [pay, setPay] = useState<FinDoc | null>(null);
  const [show, setShow] = useState<FinDoc | null>(null);
  const [view, setView] = useState<FinEntry | null>(null);
  const suppliers = useSuppliers(fin, docs);
  const invoices = useMemo(() => docs.filter((d) => d.kind === PURCHASE).sort((a, b) => (b.date ?? "").localeCompare(a.date ?? "") || Number(b.code) - Number(a.code)), [docs]);
  const returns = useMemo(() => docs.filter((d) => d.kind === PURCHASE_RETURN).sort((a, b) => (b.date ?? "").localeCompare(a.date ?? "") || Number(b.code) - Number(a.code)), [docs]);
  const owed = suppliers.reduce((s, x) => s + x.open.balance, 0), overdue = suppliers.reduce((s, x) => s + x.overdue, 0), soon = suppliers.reduce((s, x) => s + x.soon, 0);
  const tab: Tab = tabPicked ?? (received.length ? "received" : "suppliers");
  const openEntry = (id: string | null | undefined) => { const e = fin.entries.find((x) => x.id === id); if (e) setView(e); };
  return (
    <div className="grid gap-4">
      <Toolbar lead={<Segmented size="sm" className="max-sm:grid max-sm:w-full max-sm:grid-cols-2 max-sm:[&>button]:h-10" label="المشتريات" value={tab} onChange={setTab} options={[{ value: "received", label: received.length ? `مستلم بدون فاتورة (${received.length})` : "مستلم بدون فاتورة" }, { value: "suppliers", label: "الموردون" }, { value: "invoices", label: "فواتير الشراء" }, { value: "returns", label: "المرتجعات" }, { value: "ageing", label: "أعمار الديون" }]} />} actions={<>{can ? <><Button icon={<FileText />} onClick={() => setInvoice({})}>فاتورة شراء</Button><Button variant="secondary" icon={<Undo2 />} onClick={() => setRet({})}>مرتجع</Button><Button variant="outline" icon={<Plus />} onClick={() => setSupplier("new")}>مورد جديد</Button></> : null}</>} />
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 max-sm:[&>*:last-child:nth-child(odd)]:col-span-2">
        {[["مستحق للموردين", owed, ""], ["متأخر عن ميعاده", overdue, overdue ? "text-danger" : ""], ["يستحق خلال 7 أيام", soon, soon ? "text-brass" : ""]].map(([l, v, c]) => <Card key={l as string} className="p-3"><div className="text-[12.5px] text-muted">{l}</div><div className={cn("num text-[18px] font-bold", c as string)} dir="ltr">{fmt(v as number)}</div></Card>)}
      </div>

      {tab === "received" ? <Received rows={received} can={can} onInvoice={(r) => setInvoice({ request: r })} /> : null}

      {tab === "suppliers" ? (
        suppliers.length ? (
          <Card className="overflow-hidden"><div className="overflow-x-auto thin-scrollbar"><table className="w-full text-[14px]">
            <thead><tr className="text-[12.5px] text-muted">{["المورد", "التليفون", "مدة السداد", "الرصيد المستحق", "متأخر", ""].map((h, i) => <th key={i} className={cn("border-b border-line px-3 py-2.5 font-semibold", i >= 3 && i < 5 ? "text-end" : "text-start")}>{h}</th>)}</tr></thead>
            <tbody>{suppliers.map((s) => (
              <tr key={s.doc.id} className="border-t border-line/60">
                <td className="px-3 py-2 font-semibold">{s.doc.name}{s.doc.status !== "active" ? <Badge size="sm" tone="neutral" className="ms-2">موقوف</Badge> : null}</td>
                <td className="num px-3 py-2 text-muted" dir="ltr">{s.data.phone || "—"}</td>
                <td className="px-3 py-2">{s.data.termsDays ? `${s.data.termsDays} يوم` : "نقدي"}</td>
                <td className={cn("num px-3 py-2 text-end font-semibold", s.open.balance < 0 && "text-ok")} dir="ltr">{fmt(s.open.balance, "—")}</td>
                <td className={cn("num px-3 py-2 text-end", s.overdue && "text-danger")} dir="ltr">{fmt(s.overdue, "—")}</td>
                <td className="px-3 py-2"><div className="flex flex-wrap justify-end gap-1">
                  {can ? <><Button size="sm" variant="soft" onClick={() => setInvoice({ supplierId: s.doc.id })}>فاتورة</Button><Button size="sm" variant="soft" icon={<Banknote />} onClick={() => setPay(s.doc)}>سداد</Button></> : null}
                  <Statement fin={fin} s={s} />
                  {can ? <Button size="sm" variant="ghost" icon={<Pencil />} aria-label="تعديل" onClick={() => setSupplier(s.doc)} /> : null}
                </div></td>
              </tr>
            ))}</tbody>
          </table></div></Card>
        ) : <Card><EmptyState compact icon={<Truck />} title="لا يوجد موردون" body="أضف المورد مرة واحدة، وبعدها سجل فواتيره وسداده وشوف رصيده وكشف حسابه." /></Card>
      ) : null}

      {tab === "invoices" || tab === "returns" ? (
        (tab === "invoices" ? invoices : returns).length ? (
          <Card className="overflow-hidden"><div className="overflow-x-auto thin-scrollbar"><table className="w-full text-[14px]">
            <thead><tr className="text-[12.5px] text-muted">{["رقم", "التاريخ", "المورد", ...(tab === "invoices" ? ["فاتورة المورد", "الاستحقاق"] : []), "قبل الضريبة", "الضريبة", "الإجمالي", "الدفع"].map((h, i) => <th key={i} className="border-b border-line px-3 py-2.5 text-start font-semibold">{h}</th>)}</tr></thead>
            <tbody>{(tab === "invoices" ? invoices : returns).map((d) => { const p = purchaseOf(d); return (
              <tr key={d.id} className="cursor-pointer border-t border-line/60 hover:bg-surface-2" onClick={() => setShow(d)}>
                <td className="num px-3 py-2 font-semibold" dir="ltr">{d.code}</td><td className="px-3 py-2">{fmtDay(d.date ?? "")}</td><td className="px-3 py-2">{d.name}</td>
                {tab === "invoices" ? <><td className="num px-3 py-2 text-muted" dir="ltr">{p.invoiceNo || "—"}</td><td className="px-3 py-2">{p.payment === "credit" ? fmtDay(p.due) : "—"}</td></> : null}
                <td className="num px-3 py-2" dir="ltr">{fmt(p.net)}</td><td className="num px-3 py-2" dir="ltr">{fmt(p.vat, "—")}</td><td className="num px-3 py-2 font-semibold" dir="ltr">{fmt(p.total)}</td>
                <td className="px-3 py-2"><Badge size="sm" tone={p.payment === "cash" ? "ok" : "brass"}>{p.payment === "cash" ? "نقدي" : "آجل"}</Badge></td>
              </tr>); })}</tbody>
          </table></div></Card>
        ) : <Card><EmptyState compact icon={<FileText />} title={tab === "invoices" ? "لا توجد فواتير شراء" : "لا توجد مرتجعات"} body={tab === "invoices" ? "فاتورة الشراء تدخل البضاعة المخزن بسعرها، وتسجل الضريبة ورصيد المورد في قيد واحد." : "المرتجع يخرج البضاعة من المخزن ويخصم قيمتها من رصيد المورد."} /></Card>
      ) : null}

      {tab === "ageing" ? <Ageing suppliers={suppliers} /> : null}

      {supplier ? <SupplierDialog row={supplier === "new" ? null : supplier} onClose={() => setSupplier(null)} /> : null}
      {invoice ? <InvoiceDialog fin={fin} mode="invoice" suppliers={suppliers.map((s) => s.doc)} supplierId={invoice.supplierId} request={invoice.request} onClose={() => setInvoice(null)} onSaved={(d) => { setInvoice(null); setShow(d); }} /> : null}
      {ret ? <InvoiceDialog fin={fin} mode="return" suppliers={suppliers.map((s) => s.doc)} supplierId={ret.supplierId} of={ret.of} onClose={() => setRet(null)} onSaved={(d) => { setRet(null); setShow(d); }} /> : null}
      {pay ? <PayDialog fin={fin} supplier={suppliers.find((s) => s.doc.id === pay.id)!} onClose={() => setPay(null)} onSaved={(e) => { setPay(null); setView(e); }} /> : null}
      {show ? <DocView fin={fin} doc={show} onClose={() => setShow(null)} onEntry={() => openEntry(purchaseOf(show).entryId)} onReturn={can && show.kind === PURCHASE ? () => { setRet({ of: show, supplierId: purchaseOf(show).supplierId }); setShow(null); } : undefined} /> : null}
      {view ? <EntryView key={view.id} fin={fin} entry={fin.entries.find((x) => x.id === view.id) ?? view} onClose={() => setView(null)} onOpen={setView} /> : null}
    </div>
  );
}

type Sup = ReturnType<typeof useSuppliers>[number];
function Statement({ fin, s }: { fin: Fin; s: Sup }) {
  const nav = useNavigate();
  return s.data.accountId && fin.byId.has(s.data.accountId) ? <Button size="sm" variant="outline" onClick={() => nav(`/finance/reports/ledger?account=${s.data.accountId}`)}>كشف حساب</Button> : null;
}

function Ageing({ suppliers }: { suppliers: Sup[] }) {
  const rows = suppliers.filter((s) => s.open.balance);
  const head = ["المورد", ...AGE_BUCKETS, "الإجمالي"];
  const total = AGE_BUCKETS.map((_, i) => rows.reduce((s, r) => s + r.ages[i], 0));
  const due = suppliers.flatMap((s) => s.open.items.map((i) => ({ ...i, name: s.doc.name }))).sort((a, b) => a.due.localeCompare(b.due)).slice(0, 40);
  const day = today();
  if (!rows.length) return <Card><EmptyState compact icon={<Truck />} title="لا توجد مبالغ مستحقة للموردين" /></Card>;
  return (
    <>
      <div className="flex justify-end gap-2">
        <ExportButton file="أعمار-ديون-الموردين" head={head} rows={() => rows.map((r) => [r.doc.name, ...r.ages.map((v) => v / 100000), r.open.balance / 100000])} />
        <PrintButton onClick={() => printTable("أعمار ديون الموردين", fmtDay(day), head, rows.map((r) => [r.doc.name, ...r.ages.map((v) => ({ text: fmt(v, "—"), align: "end" as const })), { text: fmt(r.open.balance), align: "end" as const, bold: true }]), ["الإجمالي", ...total.map((v) => ({ text: fmt(v), align: "end" as const, bold: true })), { text: fmt(rows.reduce((s, r) => s + r.open.balance, 0)), align: "end" as const, bold: true }])} />
      </div>
      <Card className="overflow-hidden"><div className="overflow-x-auto thin-scrollbar"><table className="w-full text-[14px]">
        <thead><tr className="text-[12.5px] text-muted">{head.map((h, i) => <th key={h} className={cn("border-b border-line px-3 py-2.5 font-semibold", i ? "text-end" : "text-start")}>{h}</th>)}</tr></thead>
        <tbody>
          {rows.map((r) => <tr key={r.doc.id} className="border-t border-line/60"><td className="px-3 py-2 font-semibold">{r.doc.name}</td>{r.ages.map((v, i) => <td key={i} className={cn("num px-3 py-2 text-end", i > 0 && v && "text-danger")} dir="ltr">{fmt(v, "—")}</td>)}<td className="num px-3 py-2 text-end font-bold" dir="ltr">{fmt(r.open.balance)}</td></tr>)}
          <tr className="border-t border-line bg-surface-2/60 font-bold"><td className="px-3 py-2">الإجمالي</td>{total.map((v, i) => <td key={i} className="num px-3 py-2 text-end" dir="ltr">{fmt(v)}</td>)}<td className="num px-3 py-2 text-end" dir="ltr">{fmt(rows.reduce((s, r) => s + r.open.balance, 0))}</td></tr>
        </tbody>
      </table></div></Card>
      <Card className="grid gap-1 p-4">
        <h3 className="text-[15px] font-bold">الفواتير المفتوحة حسب ميعاد الاستحقاق</h3>
        {due.map((i) => { const late = daysLate(i.due, day); return (
          <div key={i.entryId} className="flex flex-wrap items-center gap-x-3 border-t border-line/60 py-2 text-[14px]">
            <span className="min-w-0 flex-1 font-semibold">{i.name}</span><span className="num text-muted" dir="ltr">{i.ref}</span><span>{fmtDay(i.due)}</span>
            <Badge size="sm" tone={late > 0 ? "danger" : late >= -7 ? "warn" : "neutral"}>{late > 0 ? `متأخر ${late} يوم` : late === 0 ? "يستحق اليوم" : `بعد ${-late} يوم`}</Badge>
            <span className="num w-28 text-end font-semibold" dir="ltr">{fmt(i.open)}</span>
          </div>); })}
      </Card>
    </>
  );
}

/* ───────── مستلم بدون فاتورة ───────── */

function Received({ rows, can, onInvoice }: { rows: StockRequest[]; can: boolean; onInvoice: (r: StockRequest) => void }) {
  const locs = useLive("storageLocations").data;
  if (!rows.length) return <Card><EmptyState compact icon={<PackageCheck />} title="لا توجد كميات مستلمة بدون فاتورة" body="لما أمين المخزن يوثق استلام طلب شراء، الكميات تظهر هنا لحد ما تتسجل فاتورة الشراء، ومعاها تدخل المخزن." /></Card>;
  return (
    <div className="grid gap-3">
      {rows.map((r) => (
        <Card key={r.id} className="grid gap-2 p-3">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[14px]">
            <b>طلب شراء رقم <span className="num">{r.number}</span></b>
            <span className="text-muted">استلمه {r.history?.filter((h) => h.action === "received").at(-1)?.name || r.keeperName || "—"} يوم <span className="num">{fmtDay((r.receivedAt ?? "").slice(0, 10))}</span></span>
            <Badge size="sm" tone="warn" className="ms-auto">لم يدخل المخزن</Badge>
            {can ? <Button size="sm" icon={<FileText />} onClick={() => onInvoice(r)}>تسجيل فاتورة الشراء</Button> : null}
          </div>
          <div className="overflow-x-auto thin-scrollbar rounded-xl border border-line"><table className="w-full text-[14px]">
            <thead><tr className="text-[12.5px] text-muted">{["الخامة", "الكمية المستلمة", "الوحدة", "يدخل مخزن"].map((h) => <th key={h} className="border-b border-line px-3 py-2 text-start font-semibold">{h}</th>)}</tr></thead>
            <tbody>{r.lines.filter(awaitingInvoice).map((l) => <tr key={l.itemId} className="border-t border-line/60"><td className="px-3 py-2 font-semibold">{l.name.ar}</td><td className="num px-3 py-2" dir="ltr">{l.receivedQty}</td><td className="px-3 py-2 text-muted">{l.unit}</td><td className="px-3 py-2 text-muted">{locs.find((x) => x.id === l.locationId)?.name.ar ?? "—"}</td></tr>)}</tbody>
          </table></div>
        </Card>
      ))}
    </div>
  );
}

/* ───────── مورد ───────── */

function SupplierDialog({ row, onClose }: { row: FinDoc | null; onClose: () => void }) {
  const db = useDb();
  const { toast } = useToast();
  const x = row ? supplierOf(row) : null;
  const [d, setD] = useState({ name: row?.name ?? "", phone: x?.phone ?? "", contact: x?.contact ?? "", taxId: x?.taxId ?? "", address: x?.address ?? "", note: x?.note ?? "", terms: String(x?.termsDays ?? 0), withhold: x?.withholdBp ? String(x.withholdBp / 100) : "", active: row ? row.status === "active" : true });
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try { await saveSupplier(db, row, { name: d.name, active: d.active, data: { phone: d.phone.trim(), contact: d.contact.trim(), taxId: d.taxId.trim(), address: d.address.trim(), note: d.note.trim(), termsDays: Math.max(0, Math.round(Number(d.terms) || 0)), withholdBp: Math.max(0, Math.round((Number(d.withhold) || 0) * 100)) } }); toast({ tone: "success", title: "تم الحفظ" }); onClose(); }
    catch (e) { toast({ tone: "error", title: "تعذر الحفظ", description: err(e) }); } finally { setBusy(false); }
  };
  return (
    <Dialog open onClose={onClose} title={row ? "تعديل مورد" : "مورد جديد"} footer={<div className="flex justify-end gap-2"><Button variant="ghost" onClick={onClose}>إلغاء</Button><Button loading={busy} disabled={!d.name.trim()} onClick={save}>حفظ</Button></div>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Input label="اسم المورد" autoFocus value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} />
        <Input label="التليفون" dir="ltr" value={d.phone} onChange={(e) => setD({ ...d, phone: e.target.value })} />
        <Input label="اسم المسؤول" value={d.contact} onChange={(e) => setD({ ...d, contact: e.target.value })} />
        <Input label="الرقم الضريبي" dir="ltr" value={d.taxId} onChange={(e) => setD({ ...d, taxId: e.target.value })} />
        <Input label="مدة السداد (يوم)" dir="ltr" inputMode="numeric" value={d.terms} onChange={(e) => setD({ ...d, terms: e.target.value })} hint="صفر يعني نقدي. منها يتحسب ميعاد استحقاق الفاتورة." />
        <Input label="خصم من المنبع %" dir="ltr" inputMode="decimal" placeholder="بدون" value={d.withhold} onChange={(e) => setD({ ...d, withhold: e.target.value })} hint="1% للتوريدات و3% للخدمات، يخصم عند السداد." />
        <div className="sm:col-span-2"><Input label="العنوان" value={d.address} onChange={(e) => setD({ ...d, address: e.target.value })} /></div>
        <div className="sm:col-span-2"><Textarea label="ملاحظات" rows={2} value={d.note} onChange={(e) => setD({ ...d, note: e.target.value })} /></div>
        <div className="sm:col-span-2"><Switch checked={d.active} onChange={(v) => setD({ ...d, active: v })} label="شغال" description="المورد الموقوف لا يظهر في الفواتير الجديدة، وحسابه وحركاته تبقى." /></div>
      </div>
    </Dialog>
  );
}

/* ───────── فاتورة شراء / مرتجع ───────── */

type Row = { key: number; type: "item" | "account"; itemId: string; locationId: string; accountId: string; centreId: string; memo: string; qty: string; price: string; vat: string };
let seq = 0;
const blank = (type: "item" | "account" = "item", locationId = ""): Row => ({ key: ++seq, type, itemId: "", locationId, accountId: "", centreId: "", memo: "", qty: "", price: "", vat: "" });

function InvoiceDialog({ fin, mode, suppliers, supplierId, of, request, onClose, onSaved }: { fin: Fin; mode: "invoice" | "return"; suppliers: FinDoc[]; supplierId?: string; of?: FinDoc; request?: StockRequest; onClose: () => void; onSaved: (d: FinDoc) => void }) {
  const db = useDb();
  const { toast } = useToast();
  const actor = useActor();
  const items = useLive("stockItems").data;
  const locs = useLive("storageLocations").data;
  const itemById = useMemo(() => new Map(items.map((i) => [i.id, i] as [string, StockItem])), [items]);
  const money = useMemo(() => moneyAccounts(fin.ix.ordered()), [fin.ix]);
  const active = suppliers.filter((s) => s.status === "active" || s.id === supplierId);
  const [d, setD] = useState({ supplierId: supplierId ?? "", date: today(), invoiceNo: "", due: "", payment: "credit" as "credit" | "cash", moneyId: money[0]?.id ?? "", discount: "", note: request ? `طلب شراء رقم ${request.number}` : "", branchId: fin.branchId ?? "" });
  const [rows, setRows] = useState<Row[]>(() => (request ? request.lines.filter(awaitingInvoice).map((l) => ({ ...blank("item"), itemId: l.itemId, locationId: l.locationId ?? "", qty: String(l.receivedQty) })) : of ? purchaseOf(of).lines.filter((l) => l.type === "item").map((l) => ({ ...blank("item"), itemId: l.itemId ?? "", locationId: l.locationId ?? "", qty: String(l.qty), price: toText(l.price), vat: l.vatBp ? String(l.vatBp / 100) : "" })) : [blank("item", locs.find((l) => l.active)?.id ?? "")]));
  const [files, setFiles] = useState<{ name: string; url: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const supplier = suppliers.find((s) => s.id === d.supplierId);
  const terms = supplier ? supplierOf(supplier).termsDays : 0;
  const due = d.due || addDays(d.date, terms);
  const lines: PurchaseLine[] = rows.map((r) => ({ type: r.type, ...(r.type === "item" ? { itemId: r.itemId, locationId: r.locationId } : { accountId: r.accountId, centreId: r.centreId || null, memo: r.memo.trim() }), qty: r.type === "account" ? 1 : Number(r.qty) || 0, price: fromText(r.price), vatBp: Math.round((Number(r.vat) || 0) * 100) }));
  const filled = lines.filter((l) => l.itemId || l.accountId || l.price);
  const discount = fromText(d.discount);
  const t = purchaseTotals(filled, mode === "invoice" ? discount : 0);
  const problem = purchaseProblem({ supplierId: d.supplierId, date: d.date, payment: d.payment, moneyId: d.moneyId, lines: filled, discount }, fin.settings);
  const set = (key: number, p: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...p } : r)));
  const itemOptions = useMemo(() => [{ value: "", label: "اختر الصنف" }, ...items.filter((i) => i.active !== false).sort((a, b) => a.name.ar.localeCompare(b.name.ar, "ar")).map((i) => ({ value: i.id, label: `${i.name.ar}${i.sku ? ` · ${i.sku}` : ""}` }))], [items]);
  const locOptions = useMemo(() => [{ value: "", label: "اختر المخزن" }, ...locs.filter((l) => l.active).map((l) => ({ value: l.id, label: l.name.ar }))], [locs]);
  const centres = fin.centres.filter((c) => c.active);
  const save = async () => {
    setBusy(true);
    try {
      const common = { supplierId: d.supplierId, date: d.date, moneyId: d.payment === "cash" ? d.moneyId : null, note: d.note, branchId: d.branchId || null };
      const doc = mode === "invoice" ? await postPurchase(db, { ...common, invoiceNo: d.invoiceNo, due, payment: d.payment, lines: filled, discount, attachments: files, requestId: request?.id ?? null }, actor) : await postReturn(db, { ...common, lines: filled, refund: d.payment, ofInvoice: of?.id ?? null }, actor);
      toast({ tone: "success", title: mode === "invoice" ? `تم تسجيل فاتورة الشراء ${doc.code}` : `تم تسجيل المرتجع ${doc.code}` });
      onSaved(doc);
    } catch (e) { toast({ tone: "error", title: "تعذر الحفظ", description: err(e), duration: 9000 }); } finally { setBusy(false); }
  };
  return (
    <Dialog open onClose={onClose} size="xl" title={mode === "invoice" ? (request ? `فاتورة شراء لطلب الشراء رقم ${request.number}` : "فاتورة شراء") : of ? `مرتجع من فاتورة ${of.code}` : "مرتجع مشتريات"}
      footer={<div className="flex flex-wrap items-center justify-end gap-2">
        {problem ? <span className="me-auto text-[13px] font-semibold text-danger">{problem}</span> : <span className="me-auto text-[14px]">الإجمالي <b className="num" dir="ltr">{fmt(t.total)}</b> ج.م</span>}
        <Button variant="ghost" onClick={onClose}>إلغاء</Button><Button loading={busy} disabled={!!problem} onClick={save}>حفظ وترحيل</Button>
      </div>}>
      <div className="grid gap-3">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Select label="المورد" value={d.supplierId} onChange={(e) => setD({ ...d, supplierId: e.target.value, due: "" })} options={[{ value: "", label: "اختر المورد" }, ...active.map((s) => ({ value: s.id, label: s.name }))]} />
          <Input label="التاريخ" type="date" dir="ltr" value={d.date} onChange={(e) => setD({ ...d, date: e.target.value })} />
          {mode === "invoice" ? <Input label="رقم فاتورة المورد" dir="ltr" value={d.invoiceNo} onChange={(e) => setD({ ...d, invoiceNo: e.target.value })} /> : null}
          <BranchSelect fin={fin} label="الفرع" className="w-full" all={null} value={d.branchId} onChange={(v) => setD({ ...d, branchId: v })} />
          <div className="grid gap-1"><span className="text-[13px] font-semibold text-muted">{mode === "invoice" ? "الدفع" : "قيمة المرتجع"}</span><Segmented label="الدفع" value={d.payment} onChange={(p) => setD({ ...d, payment: p })} options={mode === "invoice" ? [{ value: "credit", label: "آجل" }, { value: "cash", label: "نقدي" }] : [{ value: "credit", label: "تخصم من رصيد المورد" }, { value: "cash", label: "استلمناها نقدا" }]} /></div>
          {d.payment === "cash" ? <Select label={mode === "invoice" ? "من خزينة أو بنك" : "إلى خزينة أو بنك"} value={d.moneyId} onChange={(e) => setD({ ...d, moneyId: e.target.value })} options={[{ value: "", label: "اختر" }, ...money.map((a) => ({ value: a.id, label: `${a.name.ar} (${MONEY_LABEL[a.kind]})` }))]} /> : mode === "invoice" ? <Input label="تاريخ الاستحقاق" type="date" dir="ltr" value={due} onChange={(e) => setD({ ...d, due: e.target.value })} hint={terms ? `مدة السداد ${terms} يوم` : undefined} /> : null}
        </div>
        <div className="grid gap-2">
          {rows.map((r, i) => {
            const item = itemById.get(r.itemId);
            return (
              <div key={r.key} className="grid gap-2 rounded-xl border border-line p-2.5 sm:grid-cols-[1.6fr_1.2fr_90px_110px_80px_110px_36px] sm:items-end">
                {r.type === "item" ? <>
                  <Select label={i ? undefined : "الصنف"} aria-label="الصنف" value={r.itemId} onChange={(e) => { const it = itemById.get(e.target.value); set(r.key, { itemId: e.target.value, price: r.price || (it && mode === "return" ? toText(Math.round(it.lastCost * lineUnit(it).factor)) : r.price) }); }} options={itemOptions} />
                  <Select label={i ? undefined : "المخزن"} aria-label="المخزن" value={r.locationId} onChange={(e) => set(r.key, { locationId: e.target.value })} options={locOptions} />
                  <Input label={i ? undefined : "الكمية"} aria-label="الكمية" dir="ltr" inputMode="decimal" value={r.qty} onChange={(e) => set(r.key, { qty: e.target.value })} placeholder={item ? lineUnit(item).label : undefined} />
                </> : <>
                  <AccountSelect fin={fin} manualOnly label={i ? undefined : "الحساب"} placeholder="حساب مصروف أو أصل" value={r.accountId} onChange={(v) => set(r.key, { accountId: v })} filter={(a) => a.type === "expense" || a.type === "cogs" || a.kind === "fixed_asset"} />
                  <Input label={i ? undefined : "البيان"} aria-label="البيان" value={r.memo} onChange={(e) => set(r.key, { memo: e.target.value })} />
                  {centres.length ? <Select aria-label="مركز التكلفة" value={r.centreId} onChange={(e) => set(r.key, { centreId: e.target.value })} options={[{ value: "", label: "بدون مركز" }, ...centres.map((c) => ({ value: c.id, label: c.name.ar }))]} /> : <span />}
                </>}
                <Input label={i ? undefined : r.type === "item" ? "سعر الوحدة" : "المبلغ"} aria-label="السعر" dir="ltr" inputMode="decimal" value={r.price} onChange={(e) => set(r.key, { price: e.target.value })} />
                <Input label={i ? undefined : "ضريبة %"} aria-label="ضريبة %" dir="ltr" inputMode="decimal" placeholder="0" value={r.vat} onChange={(e) => set(r.key, { vat: e.target.value })} />
                <div className="pb-1 text-end">{item ? <div className="text-[11.5px] text-muted">{lineUnit(item).label}</div> : null}<div className="num text-[14px] font-semibold" dir="ltr">{fmt(Math.round((r.type === "account" ? 1 : Number(r.qty) || 0) * fromText(r.price)), "—")}</div></div>
                <Button size="sm" variant="ghost" icon={<X />} aria-label="حذف السطر" disabled={rows.length === 1} onClick={() => setRows(rows.filter((x) => x.key !== r.key))} />
              </div>
            );
          })}
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" icon={<Plus />} onClick={() => setRows([...rows, blank("item", rows[rows.length - 1]?.locationId ?? "")])}>صنف</Button>
            {mode === "invoice" ? <Button variant="outline" icon={<Plus />} onClick={() => setRows([...rows, blank("account")])}>مصروف أو أصل على نفس الفاتورة</Button> : null}
            <Button variant="ghost" onClick={() => setRows(rows.map((r) => ({ ...r, vat: "14" })))}>ضريبة 14% على الكل</Button>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-[1fr_260px]">
          <div className="grid content-start gap-2">
            <Textarea label="ملاحظات" rows={2} value={d.note} onChange={(e) => setD({ ...d, note: e.target.value })} />
            {mode === "invoice" ? (
              <div className="flex flex-wrap items-center gap-2">
                <input ref={file} type="file" accept="image/*" className="hidden" onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ""; if (!f) return; if (f.size > 2 * 1024 * 1024) return toast({ tone: "error", title: "الملف أكبر من 2 ميجا" }); setFiles([...files, { name: f.name, url: await readImage(f, 1200) }]); }} />
                <Button type="button" variant="outline" icon={<Paperclip />} onClick={() => file.current?.click()}>إرفاق صورة الفاتورة</Button>
                {files.map((f, i) => <span key={i} className="inline-flex items-center gap-1.5 rounded-lg border border-line px-2 py-1 text-[13px]"><Paperclip className="size-3.5" />{f.name}<button type="button" aria-label="حذف المرفق" onClick={() => setFiles(files.filter((_, j) => j !== i))}><X className="size-3.5" /></button></span>)}
              </div>
            ) : null}
          </div>
          <div className="grid content-start gap-1.5 rounded-xl border border-line p-3 text-[14px]">
            {mode === "invoice" ? <Input label="خصم على الفاتورة (ج.م)" dir="ltr" inputMode="decimal" placeholder="0" value={d.discount} onChange={(e) => setD({ ...d, discount: e.target.value })} /> : null}
            <div className="flex justify-between"><span className="text-muted">قبل الضريبة</span><span className="num" dir="ltr">{fmt(t.net)}</span></div>
            <div className="flex justify-between"><span className="text-muted">ضريبة القيمة المضافة</span><span className="num" dir="ltr">{fmt(t.vat)}</span></div>
            <div className="flex justify-between border-t border-line pt-1.5 font-bold"><span>الإجمالي</span><span className="num" dir="ltr">{fmt(t.total)}</span></div>
          </div>
        </div>
      </div>
    </Dialog>
  );
}

/* ───────── عرض فاتورة ───────── */

function DocView({ fin, doc, onClose, onEntry, onReturn }: { fin: Fin; doc: FinDoc; onClose: () => void; onEntry: () => void; onReturn?: () => void }) {
  const items = useLive("stockItems").data;
  const locs = useLive("storageLocations").data;
  const p = purchaseOf(doc);
  const t = purchaseTotals(p.lines, p.discount);
  const isReturn = doc.kind === PURCHASE_RETURN;
  const title = `${isReturn ? "مرتجع مشتريات" : "فاتورة شراء"} ${doc.code}`;
  const rows = p.lines.map((l, i) => {
    const item = items.find((x) => x.id === l.itemId);
    return { name: l.type === "item" ? item?.name.ar ?? "—" : `${fin.byId.get(l.accountId ?? "")?.name.ar ?? "—"}${l.memo ? `: ${l.memo}` : ""}`, where: l.type === "item" ? locs.find((x) => x.id === l.locationId)?.name.ar ?? "" : "", qty: l.type === "item" ? `${l.qty} ${item ? lineUnit(item).label : ""}` : "", price: l.price, net: t.nets[i], vat: t.vats[i] };
  });
  const print = () => printDoc(title, `<h1>${esc(title)}</h1>
    <div class="row"><span>المورد: <b>${esc(doc.name)}</b></span><span>التاريخ: <b>${esc(fmtDay(doc.date ?? ""))}</b></span>${p.invoiceNo ? `<span>فاتورة المورد: <b>${esc(p.invoiceNo)}</b></span>` : ""}<span>الدفع: <b>${p.payment === "cash" ? "نقدي" : `آجل، يستحق ${esc(fmtDay(p.due))}`}</b></span></div>
    <table style="width:100%;border-collapse:collapse;margin-top:8px"><tr>${["البند", "المخزن", "الكمية", "السعر", "القيمة", "الضريبة"].map((h) => `<th style="border:1px solid #999;padding:4px 8px;text-align:right;background:#eee">${h}</th>`).join("")}</tr>${rows.map((r) => `<tr>${[r.name, r.where, r.qty, fmt(r.price), fmt(r.net), fmt(r.vat, "")].map((c) => `<td style="border:1px solid #999;padding:4px 8px">${esc(c)}</td>`).join("")}</tr>`).join("")}</table>
    <div class="row" style="justify-content:flex-end"><span>قبل الضريبة: <b>${fmt(p.net)}</b></span><span>الضريبة: <b>${fmt(p.vat)}</b></span><span>الإجمالي: <b>${fmt(p.total)} ج.م</b></span></div>
    ${p.note ? `<div class="box">${esc(p.note)}</div>` : ""}<div class="sign"><span>أمين المخزن</span><span>المحاسب</span><span>المدير</span></div>`);
  return (
    <Dialog open onClose={onClose} size="lg" title={title} footer={<div className="flex flex-wrap justify-end gap-2">{onReturn ? <Button variant="outline" icon={<Undo2 />} onClick={onReturn}>مرتجع من الفاتورة</Button> : null}<PrintButton onClick={print} />{p.entryId ? <Button variant="secondary" onClick={onEntry}>القيد المحاسبي</Button> : null}<Button variant="ghost" onClick={onClose}>إغلاق</Button></div>}>
      <div className="grid gap-3 text-[14px]">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
          {[["المورد", doc.name], ["التاريخ", fmtDay(doc.date ?? "")], ["فاتورة المورد", p.invoiceNo || "—"], ["الدفع", p.payment === "cash" ? `نقدي: ${fin.byId.get(p.moneyId ?? "")?.name.ar ?? ""}` : isReturn ? "من رصيد المورد" : `آجل، يستحق ${fmtDay(p.due)}`], ["الفرع", fin.branchName(doc.branchId)], ["سجلها", p.by || "—"]].map(([k, v]) => <div key={k}><dt className="text-[12.5px] text-muted">{k}</dt><dd className="font-semibold">{v}</dd></div>)}
        </dl>
        <div className="overflow-x-auto thin-scrollbar rounded-xl border border-line"><table className="w-full">
          <thead><tr className="text-[12.5px] text-muted">{["البند", "المخزن", "الكمية", "السعر", "القيمة", "الضريبة"].map((h) => <th key={h} className="border-b border-line px-3 py-2 text-start font-semibold">{h}</th>)}</tr></thead>
          <tbody>{rows.map((r, i) => <tr key={i} className="border-t border-line/60"><td className="px-3 py-2">{r.name}</td><td className="px-3 py-2 text-muted">{r.where || "—"}</td><td className="num px-3 py-2" dir="ltr">{r.qty || "—"}</td><td className="num px-3 py-2" dir="ltr">{fmt(r.price)}</td><td className="num px-3 py-2" dir="ltr">{fmt(r.net)}</td><td className="num px-3 py-2" dir="ltr">{fmt(r.vat, "—")}</td></tr>)}</tbody>
        </table></div>
        <div className="ms-auto grid w-full max-w-xs gap-1">
          {p.discount ? <div className="flex justify-between"><span className="text-muted">خصم الفاتورة</span><span className="num" dir="ltr">{fmt(p.discount)}</span></div> : null}
          <div className="flex justify-between"><span className="text-muted">قبل الضريبة</span><span className="num" dir="ltr">{fmt(p.net)}</span></div>
          <div className="flex justify-between"><span className="text-muted">الضريبة</span><span className="num" dir="ltr">{fmt(p.vat)}</span></div>
          <div className="flex justify-between border-t border-line pt-1 font-bold"><span>الإجمالي</span><span className="num" dir="ltr">{fmt(p.total)}</span></div>
        </div>
        {p.note ? <p className="rounded-xl border border-line px-3 py-2 text-muted">{p.note}</p> : null}
        {p.attachments?.length ? <div className="flex flex-wrap gap-2">{p.attachments.map((f, i) => <a key={i} href={f.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-lg border border-line px-2 py-1 text-[13px] hover:bg-surface-2"><Paperclip className="size-3.5" />{f.name}</a>)}</div> : null}
      </div>
    </Dialog>
  );
}

/* ───────── سداد لمورد ───────── */

function PayDialog({ fin, supplier, onClose, onSaved }: { fin: Fin; supplier: Sup; onClose: () => void; onSaved: (e: FinEntry) => void }) {
  const db = useDb();
  const { toast } = useToast();
  const actor = useActor();
  const money = useMemo(() => moneyAccounts(fin.ix.ordered()), [fin.ix]);
  const [d, setD] = useState({ date: today(), moneyId: money[0]?.id ?? "", amount: "", withhold: supplier.data.withholdBp ? String(supplier.data.withholdBp / 100) : "", discount: "", memo: "", method: METHODS[0], ref: "", branchId: fin.branchId ?? "" });
  const [busy, setBusy] = useState(false);
  const ac = useAmountCurrency(fin, baseOf(fin.settings));
  const input = { supplierId: supplier.doc.id, date: d.date, moneyId: d.moneyId, amount: ac.convert(fromText(d.amount)), paidIn: ac.paidIn(fromText(d.amount)), withholdBp: Math.round((Number(d.withhold) || 0) * 100), discount: fromText(d.discount), memo: d.memo, method: d.method, ref: d.ref, branchId: d.branchId || null };
  const s = paySplit(input);
  const balance = supplier.open.balance;
  const problem = !d.moneyId ? "اختر الخزينة أو البنك" : ac.problem && fromText(d.amount) > 0 ? ac.problem : !(input.amount > 0 || input.discount > 0) ? "اكتب المبلغ" : "";
  const save = async () => {
    setBusy(true);
    try { const e = await paySupplier(db, input, actor); toast({ tone: "success", title: e.status === "pending" ? "السند في انتظار الاعتماد" : `تم ترحيل سند الصرف رقم ${e.meta.voucherNo}` }); onSaved(e); }
    catch (e) { toast({ tone: "error", title: "تعذر الحفظ", description: err(e), duration: 9000 }); } finally { setBusy(false); }
  };
  /** the cash that clears the whole balance once the tax withheld is counted */
  const full = () => !ac.on && setD({ ...d, amount: toText(Math.round(((balance - input.discount) * (10_000 - input.withholdBp)) / 10_000)) });
  return (
    <Dialog open onClose={onClose} title={`سداد للمورد: ${supplier.doc.name}`}
      footer={<div className="flex flex-wrap items-center justify-end gap-2">{problem ? <span className="me-auto text-[13px] font-semibold text-danger">{problem}</span> : <span className="me-auto text-[13px] text-muted">{s.settled > Math.max(balance, 0) ? `يسدد من الرصيد ${fmt(Math.max(balance, 0))}، و${fmt(s.settled - Math.max(balance, 0))} دفعة مقدمة للمورد` : `يسدد من الرصيد ${fmt(s.settled)}، والباقي بعده ${fmt(balance - s.settled)}`}</span>}<Button variant="ghost" onClick={onClose}>إلغاء</Button><Button loading={busy} disabled={!!problem} onClick={save}>حفظ وترحيل</Button></div>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-line p-3 sm:col-span-2"><div className="text-[12.5px] text-muted">الرصيد المستحق للمورد</div><div className="num text-[20px] font-bold" dir="ltr">{fmt(balance)}</div>{supplier.overdue ? <div className="text-[13px] text-danger">منه متأخر {fmt(supplier.overdue)}</div> : null}</div>
        <Input label="التاريخ" type="date" dir="ltr" value={d.date} onChange={(e) => setD({ ...d, date: e.target.value })} />
        <Select label="من خزينة أو بنك" value={d.moneyId} onChange={(e) => setD({ ...d, moneyId: e.target.value })} options={[{ value: "", label: "اختر" }, ...money.map((a) => ({ value: a.id, label: `${a.name.ar} (${MONEY_LABEL[a.kind]})` }))]} />
        <Input label={`المبلغ المدفوع (${ac.sym(ac.cur)})`} dir="ltr" inputMode="decimal" autoFocus value={d.amount} onChange={(e) => setD({ ...d, amount: e.target.value })} hint={balance > 0 && !ac.on ? <button type="button" className="text-primary underline-offset-2 hover:underline" onClick={full}>سدد الرصيد كله</button> : undefined} />
        {ac.select}
        {ac.box(fromText(d.amount))}
        <Input label="خصم من المنبع %" dir="ltr" inputMode="decimal" placeholder="بدون" value={d.withhold} onChange={(e) => setD({ ...d, withhold: e.target.value })} hint={s.withheld ? `يخصم ${fmt(s.withheld)} ويتسجل مستحق للضرائب` : undefined} />
        <Input label="خصم مكتسب من المورد (ج.م)" dir="ltr" inputMode="decimal" placeholder="0" value={d.discount} onChange={(e) => setD({ ...d, discount: e.target.value })} />
        <Select label="طريقة الدفع" value={d.method} onChange={(e) => setD({ ...d, method: e.target.value })} options={METHODS.map((m) => ({ value: m, label: m }))} />
        <Input label="رقم مرجعي (شيك، تحويل)" dir="ltr" value={d.ref} onChange={(e) => setD({ ...d, ref: e.target.value })} />
        <BranchSelect fin={fin} label="الفرع" className="w-full" all={null} value={d.branchId} onChange={(v) => setD({ ...d, branchId: v })} />
        <div className="sm:col-span-2"><Textarea label="البيان" rows={2} value={d.memo} onChange={(e) => setD({ ...d, memo: e.target.value })} /></div>
      </div>
    </Dialog>
  );
}
