/** المبيعات: ملخص مبيعات اليوم أو الوردية لكل فرع بقيد واحد، وتسوية مستحقات طلبات والفيزا والمحافظ. */
import type { Db } from "@/data/hooks";
import type { FinAccount, FinDoc, FinEntry, FinLine } from "@/data/financeTypes";
import type { Units } from "@/lib/money";
import { JournalError } from "./journal";
import { journalContext, postSystem, reverseEntry, type Actor } from "./journalOps";

export const SALES_DAY = "sales-day";
export const SETTLEMENT = "settlement";
export const CHANNELS = [
  { key: "sales.dinein", label: "الصالة" },
  { key: "sales.takeaway", label: "التيك أواي" },
  { key: "sales.delivery", label: "التوصيل الخاص" },
  { key: "sales.talabat", label: "طلبات" },
] as const;
/** the accounts a day's takings usually land on, in the order the screen shows them */
export const PAY_KEYS = ["wallet.card", "wallet.instapay", "wallet.vodafone", "aggregator.talabat"] as const;

export interface SalesPay { accountId: string; amount: Units }
export interface SalesInput {
  shift: string;
  /** posting key → what was sold on the channel, before discounts */
  channels: Record<string, Units>;
  fees: Units;
  discounts: Units;
  returns: Units;
  /** service charge and tips collected for the staff; outside the sales and the tax */
  tips: Units;
  vatBp: number;
  /** the figures typed already hold the tax */
  inclusive: boolean;
  payments: SalesPay[];
  orders: number;
  note: string;
}
export interface SalesData extends SalesInput { net: Units; vat: Units; due: Units; paid: Units; diff: Units; entryId: string | null; cancelEntryId?: string | null; by: string }
export const salesOf = (d: FinDoc) => d.data as unknown as SalesData;

/** Net of tax per head, the tax, what should have been collected and the over or short against what was. */
export function salesTotals(d: Pick<SalesInput, "channels" | "fees" | "discounts" | "returns" | "tips" | "vatBp" | "inclusive" | "payments">) {
  const net = (x: Units) => (d.inclusive ? Math.round((x * 10_000) / (10_000 + d.vatBp)) : x);
  const channels: Record<string, Units> = Object.fromEntries(CHANNELS.map((c) => [c.key, net(d.channels[c.key] ?? 0)]));
  const fees = net(d.fees), discounts = net(d.discounts), returns = net(d.returns);
  const sales = Object.values(channels).reduce((s, x) => s + x, 0);
  const taxable = sales + fees - discounts - returns;
  const typed = CHANNELS.reduce((s, c) => s + (d.channels[c.key] ?? 0), 0) + d.fees - d.discounts - d.returns;
  const vat = d.inclusive ? typed - taxable : Math.round((taxable * d.vatBp) / 10_000);
  const due = taxable + vat + d.tips;
  const paid = d.payments.reduce((s, p) => s + p.amount, 0);
  return { channels, fees, discounts, returns, sales, taxable, vat, due, paid, diff: paid - due };
}

export function salesProblem(v: { date: string; branchId: string | null } & SalesInput): string {
  if (!v.date) return "اختر التاريخ";
  if ([...Object.values(v.channels), v.fees, v.discounts, v.returns, v.tips].some((x) => x < 0) || v.payments.some((p) => p.amount < 0)) return "المبالغ لا تكون بالسالب";
  if (v.vatBp < 0 || v.vatBp > 10_000) return "نسبة الضريبة غير صحيحة";
  const t = salesTotals(v);
  if (!t.sales && !t.fees) return "اكتب مبيعات قناة واحدة على الأقل";
  if (t.taxable < 0) return "الخصومات والمرتجعات أكبر من المبيعات";
  if (v.payments.some((p) => p.amount && !p.accountId)) return "اختر حساب التحصيل";
  if (!t.paid) return "اكتب المبالغ المحصلة";
  return "";
}

export interface SalesAccounts { channel: (key: string) => string; fees: string; discounts: string; returns: string; vat: string; tips: string; diff: string }
/** القيد: what was collected against the sales of each channel, the tax and the staff's tips; the over or short closes it. */
export function salesLines(v: SalesInput, ids: SalesAccounts, branchId: string | null): FinLine[] {
  const t = salesTotals(v);
  const b = { branchId };
  const lines: FinLine[] = v.payments.filter((p) => p.amount).map((p) => ({ account: p.accountId, debit: p.amount, credit: 0, ...b }));
  if (t.discounts) lines.push({ account: ids.discounts, debit: t.discounts, credit: 0, memo: "خصومات وعروض", ...b });
  if (t.returns) lines.push({ account: ids.returns, debit: t.returns, credit: 0, memo: "مرتجعات", ...b });
  if (t.diff < 0) lines.push({ account: ids.diff, debit: -t.diff, credit: 0, memo: "عجز خزينة", ...b });
  for (const c of CHANNELS) if (t.channels[c.key]) lines.push({ account: ids.channel(c.key), debit: 0, credit: t.channels[c.key], memo: `مبيعات ${c.label}`, ...b });
  if (t.fees) lines.push({ account: ids.fees, debit: 0, credit: t.fees, memo: "رسوم التوصيل", ...b });
  if (t.vat) lines.push({ account: ids.vat, debit: 0, credit: t.vat, memo: "ضريبة القيمة المضافة", ...b });
  if (v.tips) lines.push({ account: ids.tips, debit: 0, credit: v.tips, memo: "خدمة وإكراميات للموظفين", ...b });
  if (t.diff > 0) lines.push({ account: ids.diff, debit: 0, credit: t.diff, memo: "زيادة خزينة", ...b });
  return lines;
}

type Ctx = Awaited<ReturnType<typeof journalContext>>;
const idOf = (j: Ctx, key: string) => {
  const a = j.accounts.find((x) => x.code === j.settings.links[key]);
  if (!a) throw new JournalError(`ربط الحسابات ناقص: لا يوجد حساب للبند "${key}"`);
  if (a.postable) return a.id;
  // the linked account became a parent (it has children now): the first child that takes lines stands for it
  const child = j.accounts.filter((x) => x.postable && x.active && x.code.startsWith(a.code)).sort((x, y) => x.code.localeCompare(y.code))[0];
  if (!child) throw new JournalError(`الحساب المربوط بالبند "${key}" لا يقبل قيود`);
  return child.id;
};
export { idOf as linkedAccount };
const nextNo = (docs: FinDoc[]) => String(Math.max(0, ...docs.map((d) => Number(d.code) || 0)) + 1);

/** ملخص مبيعات: one document and one entry for a branch's day (or one shift of it). */
export async function postSalesDay(db: Db, v: { date: string; branchId: string | null } & SalesInput, actor: Actor): Promise<FinDoc> {
  const problem = salesProblem(v);
  if (problem) throw new JournalError(problem);
  const j = await journalContext(db);
  const docs = await db.list("finDocs", { where: { kind: SALES_DAY } });
  const shift = v.shift.trim();
  if (docs.some((d) => d.status === "posted" && d.date === v.date && d.branchId === v.branchId && salesOf(d).shift === shift)) throw new JournalError(shift ? "وردية بنفس الاسم مسجلة لهذا الفرع في نفس اليوم" : "مبيعات هذا اليوم مسجلة لهذا الفرع. اكتب اسم الوردية لو فيه أكثر من وردية.");
  const t = salesTotals(v);
  const payments = v.payments.filter((p) => p.amount);
  const input: SalesInput = { ...v, shift, payments, note: v.note.trim() };
  const data: SalesData = { ...input, net: t.taxable, vat: t.vat, due: t.due, paid: t.paid, diff: t.diff, entryId: null, by: actor.name };
  const doc = await db.insert("finDocs", { kind: SALES_DAY, code: nextNo(docs), name: shift || "اليوم كله", branchId: v.branchId, status: "posted", date: v.date, data: data as unknown as Record<string, unknown> });
  const e = await postSystem(db, {
    date: v.date, memo: `مبيعات ${v.date.split("-").reverse().join("/")}${shift ? ` (${shift})` : ""}`, branchId: v.branchId, kind: "auto", sourceType: SALES_DAY, sourceId: doc.id, meta: { orders: v.orders, shift },
    lines: salesLines(input, { channel: (k) => idOf(j, k), fees: idOf(j, "sales.fees"), discounts: idOf(j, "sales.discounts"), returns: idOf(j, "sales.returns"), vat: idOf(j, "vat.output"), tips: idOf(j, "tips.payable"), diff: idOf(j, "cash.diff") }, v.branchId),
  }, j);
  return db.update("finDocs", doc.id, { data: { ...data, entryId: e?.id ?? null } as unknown as Record<string, unknown> });
}

/** Cancels a posted document of this file: its entry is reversed on the same day and the document stays in the list as cancelled. */
export async function cancelDoc(db: Db, id: string, actor: Actor, today: string): Promise<FinDoc> {
  const doc = await db.get("finDocs", id);
  if (!doc || (doc.kind !== SALES_DAY && doc.kind !== SETTLEMENT)) throw new JournalError("المستند غير موجود");
  if (doc.status !== "posted") throw new JournalError("المستند ملغي بالفعل");
  const entryId = (doc.data as { entryId?: string | null }).entryId;
  let rev: FinEntry | null = null;
  if (entryId) {
    try { rev = await reverseEntry(db, entryId, { date: doc.date ?? today, memo: `إلغاء ${doc.kind === SALES_DAY ? "ملخص مبيعات" : "تسوية"} رقم ${doc.code}` }, actor); }
    catch (e) { if (!/مقفول|مقفل/.test(String((e as Error).message))) throw e; rev = await reverseEntry(db, entryId, { date: today, memo: `إلغاء ${doc.kind === SALES_DAY ? "ملخص مبيعات" : "تسوية"} رقم ${doc.code}` }, actor); }
  }
  return db.update("finDocs", id, { status: "cancelled", data: { ...doc.data, cancelEntryId: rev?.id ?? null } });
}

/* ───────── التسويات: ما حصلناه فعلا من طلبات أو الفيزا أو المحافظ ───────── */
export interface SettlementInput { fromId: string; toId: string; date: string; received: Units; commission: Units; commissionVat: Units; feeId: string; ref: string; note: string; branchId: string | null; periodFrom?: string; periodTo?: string }
export interface SettlementData extends SettlementInput { total: Units; entryId: string | null; cancelEntryId?: string | null; by: string }
export const settlementOf = (d: FinDoc) => d.data as unknown as SettlementData;
export const settlementTotal = (v: Pick<SettlementInput, "received" | "commission" | "commissionVat">) => v.received + v.commission + v.commissionVat;
export function settlementProblem(v: SettlementInput): string {
  if (!v.fromId) return "اختر الحساب تحت التسوية";
  if (!v.toId) return "اختر البنك أو الخزينة التي استلمت";
  if (v.fromId === v.toId) return "الحسابان متطابقان";
  if (!v.date) return "اختر التاريخ";
  if (v.received < 0 || v.commission < 0 || v.commissionVat < 0) return "المبالغ لا تكون بالسالب";
  if (!settlementTotal(v)) return "اكتب المبلغ المستلم";
  if ((v.commission || v.commissionVat) && !v.feeId) return "اختر حساب العمولة";
  return "";
}
export function settlementLines(v: SettlementInput, vatInputId: string): FinLine[] {
  const b = { branchId: v.branchId };
  const lines: FinLine[] = [];
  if (v.received) lines.push({ account: v.toId, debit: v.received, credit: 0, ...b });
  if (v.commission) lines.push({ account: v.feeId, debit: v.commission, credit: 0, memo: "عمولة", ...b });
  if (v.commissionVat) lines.push({ account: vatInputId, debit: v.commissionVat, credit: 0, memo: "ضريبة على العمولة", ...b });
  lines.push({ account: v.fromId, debit: 0, credit: settlementTotal(v), ...b });
  return lines;
}
/** the accounts takings wait on until the money really arrives: wallets, card settlement, delivery companies and customers */
export const waitingAccounts = <T extends Pick<FinAccount, "postable" | "active" | "kind">>(accounts: T[]) => accounts.filter((a) => a.postable && a.active && (a.kind === "wallet" || a.kind === "customer"));

export async function postSettlement(db: Db, v: SettlementInput, actor: Actor): Promise<FinDoc> {
  const problem = settlementProblem(v);
  if (problem) throw new JournalError(problem);
  const j = await journalContext(db);
  const from = j.byId.get(v.fromId);
  if (!from) throw new JournalError("الحساب تحت التسوية غير موجود");
  const docs = await db.list("finDocs", { where: { kind: SETTLEMENT } });
  const data: SettlementData = { ...v, ref: v.ref.trim(), note: v.note.trim(), total: settlementTotal(v), entryId: null, by: actor.name };
  const doc = await db.insert("finDocs", { kind: SETTLEMENT, code: nextNo(docs), name: from.name.ar, branchId: v.branchId, status: "posted", date: v.date, data: data as unknown as Record<string, unknown> });
  const e = await postSystem(db, { date: v.date, memo: `تسوية ${from.name.ar}${data.ref ? ` (${data.ref})` : ""}`, branchId: v.branchId, kind: "auto", sourceType: SETTLEMENT, sourceId: doc.id, meta: { ref: data.ref }, lines: settlementLines(v, v.commissionVat ? idOf(j, "vat.input") : "") }, j);
  return db.update("finDocs", doc.id, { data: { ...data, entryId: e?.id ?? null } as unknown as Record<string, unknown> });
}
