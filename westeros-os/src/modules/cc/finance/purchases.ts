/** المشتريات والموردون: the pure rules behind purchase invoices, returns, supplier payments and the ageing of what is owed. */
import type { FinDoc, FinEntry, FinLine } from "@/data/financeTypes";
import type { Units } from "@/lib/money";
import { split } from "./statements";

export const SUPPLIER = "supplier";
export const PURCHASE = "purchase";
export const PURCHASE_RETURN = "purchase-return";
export const SUPPLIER_LINK = "supplier";
export const PURCHASE_REF = "fin_purchase";
export const RETURN_REF = "fin_purchase_return";

export interface SupplierData {
  phone: string; taxId: string; address: string; contact: string; note: string;
  /** days from the invoice to its due date */
  termsDays: number;
  /** خصم من المنبع held back on every payment, in basis points (100 = 1%) */
  withholdBp: number;
  /** the supplier's own account under الموردون */
  accountId: string;
}
export const supplierOf = (d: FinDoc): SupplierData => ({ phone: "", taxId: "", address: "", contact: "", note: "", termsDays: 0, withholdBp: 0, accountId: "", ...(d.data as Partial<SupplierData>) });

export interface PurchaseLine {
  type: "item" | "account";
  /** item line: what entered (or left) which warehouse */
  itemId?: string; locationId?: string;
  /** account line: an expense or an asset bought on the same invoice */
  accountId?: string; centreId?: string | null;
  memo?: string;
  /** in the unit the item is bought in */
  qty: number;
  /** per unit, before VAT */
  price: Units;
  vatBp: number;
}
export interface PurchaseData {
  supplierId: string;
  /** the supplier's own invoice number */
  invoiceNo: string;
  due: string;
  payment: "credit" | "cash";
  /** cash purchase: the till or bank that paid */
  moneyId: string | null;
  lines: PurchaseLine[];
  /** off the whole invoice, before VAT */
  discount: Units;
  net: Units; vat: Units; total: Units;
  entryId: string | null;
  note: string;
  attachments: { name: string; url: string }[];
  by: string;
  /** the طلب شراء it was registered from */
  requestId?: string | null;
}
export const purchaseOf = (d: FinDoc) => d.data as unknown as PurchaseData;

export const lineNet = (l: Pick<PurchaseLine, "qty" | "price">) => Math.round(l.qty * l.price);
/** Each line after its share of the invoice discount, its VAT, and the invoice totals. */
export function purchaseTotals(lines: PurchaseLine[], discount: Units = 0) {
  const gross = lines.map(lineNet);
  const sum = gross.reduce((a, b) => a + b, 0);
  const cut = discount > 0 && sum > 0 ? split(Math.min(discount, sum), Object.fromEntries(gross.map((g, i) => [String(i), g]))) : {};
  const nets = gross.map((g, i) => g - (cut[String(i)] ?? 0));
  const vats = nets.map((n, i) => Math.round((n * (lines[i].vatBp || 0)) / 10_000));
  const net = nets.reduce((a, b) => a + b, 0), vat = vats.reduce((a, b) => a + b, 0);
  return { gross: sum, nets, vats, net, vat, total: net + vat };
}
export function purchaseProblem(v: { supplierId: string; date: string; payment: "credit" | "cash"; moneyId?: string | null; lines: PurchaseLine[]; discount?: Units }, opts: { startDate: string | null }): string {
  if (!v.supplierId) return "اختر المورد";
  if (!v.date) return "اختر تاريخ الفاتورة";
  if (v.payment === "cash" && !v.moneyId) return "اختر الخزينة أو البنك";
  const lines = v.lines.filter((l) => l.itemId || l.accountId || l.qty || l.price);
  if (!lines.length) return "أضف صنف واحد على الأقل";
  for (const [i, l] of lines.entries()) {
    const n = `السطر ${i + 1}`;
    if (l.type === "item" && !l.itemId) return `${n}: اختر الصنف`;
    if (l.type === "item" && !l.locationId) return `${n}: اختر المخزن`;
    if (l.type === "account" && !l.accountId) return `${n}: اختر الحساب`;
    if (!(l.qty > 0)) return `${n}: اكتب الكمية`;
    if (!(l.price >= 0) || (l.type === "account" && !(l.price > 0))) return `${n}: اكتب السعر`;
    if (l.vatBp < 0) return `${n}: الضريبة لا تكون بالسالب`;
  }
  if ((v.discount ?? 0) < 0) return "الخصم لا يكون بالسالب";
  if (lines.some((l) => l.type === "item")) {
    if (!opts.startDate) return "حدد تاريخ بداية القيود التلقائية من الإعدادات أولا، حتى تدخل البضاعة المخزن بقيدها";
    if (v.date < opts.startDate) return "تاريخ الفاتورة قبل تاريخ بداية القيود التلقائية";
  }
  return "";
}
/**
 * The invoice's own entry. What entered the warehouses was already debited to stock by its movement against
 * بضاعة مستلمة لم تصل فاتورتها, so the invoice debits that account and it comes back to zero.
 */
export function purchaseLines(a: { lines: PurchaseLine[]; discount: Units; accruedId: string; vatInputId: string; creditId: string; branchId: string | null }): FinLine[] {
  const t = purchaseTotals(a.lines, a.discount);
  const stock = a.lines.reduce((s, l, i) => s + (l.type === "item" ? t.nets[i] : 0), 0);
  return [
    ...(stock ? [{ account: a.accruedId, debit: stock, credit: 0 }] : []),
    ...a.lines.flatMap((l, i) => (l.type === "account" && t.nets[i] ? [{ account: l.accountId!, debit: t.nets[i], credit: 0, ...(l.memo ? { memo: l.memo } : {}), ...(l.centreId ? { centreId: l.centreId } : {}), branchId: a.branchId }] : [])),
    ...(t.vat ? [{ account: a.vatInputId, debit: t.vat, credit: 0 }] : []),
    { account: a.creditId, debit: 0, credit: t.total },
  ];
}
/** مرتجع مشتريات: the supplier (or the till) is debited; what left stock was credited by its movement at `cost`. */
export function returnLines(a: { net: Units; vat: Units; cost: Units; accruedId: string; vatInputId: string; varianceId: string; debitId: string }): FinLine[] {
  const diff = a.net - a.cost;
  return [
    { account: a.debitId, debit: a.net + a.vat, credit: 0 },
    ...(a.cost ? [{ account: a.accruedId, debit: 0, credit: a.cost }] : []),
    ...(a.vat ? [{ account: a.vatInputId, debit: 0, credit: a.vat }] : []),
    // returned at a price other than what it stood at in the books
    ...(diff ? [{ account: a.varianceId, debit: Math.max(0, -diff), credit: Math.max(0, diff), memo: "فرق سعر المرتجع" }] : []),
  ];
}

export interface PayInput { supplierId: string; date: string; moneyId: string; /** what leaves the till or bank */ amount: Units; withholdBp?: number; /** خصم مكتسب */ discount?: Units; memo: string; method?: string; ref?: string; branchId: string | null }
/** what the payment settles of the supplier's balance: cash + tax withheld + discount earned */
export function paySplit(v: Pick<PayInput, "amount" | "withholdBp" | "discount">) {
  const bp = v.withholdBp ?? 0;
  // the tax is a share of what is settled before discount, so the cash paid is that less the tax
  const base = bp ? Math.round((v.amount * 10_000) / (10_000 - bp)) : v.amount;
  const withheld = base - v.amount;
  return { withheld, discount: v.discount ?? 0, settled: base + (v.discount ?? 0) };
}
export function payLines(v: PayInput, ids: { supplierAccountId: string; withholdId?: string; discountId?: string }): FinLine[] {
  const s = paySplit(v);
  return [
    { account: ids.supplierAccountId, debit: s.settled, credit: 0 },
    { account: v.moneyId, debit: 0, credit: v.amount },
    ...(s.withheld && ids.withholdId ? [{ account: ids.withholdId, debit: 0, credit: s.withheld }] : []),
    ...(s.discount && ids.discountId ? [{ account: ids.discountId, debit: 0, credit: s.discount }] : []),
  ];
}

/* ───────── أعمار الديون ───────── */

export interface OpenItem { entryId: string; date: string; due: string; ref: string; amount: Units; open: Units }
/** What is still owed on a supplier's account, oldest first: every debit settles the oldest credit that is still open. */
export function openItems(accountId: string, entries: FinEntry[], dueOf: (e: FinEntry) => string | null, termsDays = 0): { items: OpenItem[]; balance: Units; unapplied: Units } {
  const credits: OpenItem[] = [];
  let paid = 0;
  const addDays = (d: string, n: number) => new Date(Date.parse(d) + n * 86_400_000).toISOString().slice(0, 10);
  for (const e of [...entries].filter((x) => x.status === "posted").sort((a, b) => a.date.localeCompare(b.date) || a.year - b.year || a.no - b.no)) {
    let c = 0;
    for (const l of e.lines) if (l.account === accountId) { c += l.credit; paid += l.debit; }
    if (c > 0) credits.push({ entryId: e.id, date: e.date, due: dueOf(e) ?? addDays(e.date, termsDays), ref: e.no ? `${e.year}/${e.no}` : "", amount: c, open: c });
  }
  for (const c of credits) { const take = Math.min(c.open, paid); c.open -= take; paid -= take; if (!paid) break; }
  const items = credits.filter((c) => c.open > 0);
  return { items, balance: items.reduce((s, c) => s + c.open, 0) - paid, unapplied: paid };
}
export const AGE_BUCKETS = ["لم يستحق", "1 إلى 30 يوم", "31 إلى 60 يوم", "61 إلى 90 يوم", "أكثر من 90 يوم"] as const;
export const daysLate = (due: string, today: string) => Math.round((Date.parse(today) - Date.parse(due)) / 86_400_000);
export function ageing(items: Pick<OpenItem, "due" | "open">[], today: string): Units[] {
  const out = [0, 0, 0, 0, 0];
  for (const i of items) { const d = daysLate(i.due, today); out[d <= 0 ? 0 : d <= 30 ? 1 : d <= 60 ? 2 : d <= 90 ? 3 : 4] += i.open; }
  return out;
}

/** every supplier with what is owed to them and how old it is */
export function supplierBook(docs: FinDoc[], entries: FinEntry[], day: string) {
  const dueOf = (e: FinEntry) => (typeof e.meta?.due === "string" ? e.meta.due : null);
  return docs.filter((d) => d.kind === SUPPLIER).sort((a, b) => a.name.localeCompare(b.name, "ar")).map((doc) => {
    const data = supplierOf(doc);
    const open = data.accountId ? openItems(data.accountId, entries, dueOf, data.termsDays) : { items: [] as OpenItem[], balance: 0, unapplied: 0 };
    const ages = ageing(open.items, day);
    return { doc, data, open, ages, overdue: ages.slice(1).reduce((a, b) => a + b, 0), soon: open.items.filter((i) => { const d = daysLate(i.due, day); return d <= 0 && d >= -7; }).reduce((s, i) => s + i.open, 0) };
  });
}
