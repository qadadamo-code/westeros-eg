/** What the purchases screens write: suppliers, purchase invoices (stock in + entry), returns and payments. */
import type { Db } from "@/data/hooks";
import type { FinDoc, FinEntry } from "@/data/financeTypes";
import { applyMoves, levelId } from "@/modules/inventory/stock";
import { toBaseQty } from "../lib";
import { cairoDay, fiscalYear, JournalError } from "./journal";
import { journalContext, postSystem, submitEntry, type Actor } from "./journalOps";
import { partyAccount } from "./parties";
import { payLines, paySplit, PURCHASE, PURCHASE_REF, PURCHASE_RETURN, purchaseLines, purchaseProblem, purchaseTotals, RETURN_REF, returnLines, SUPPLIER, SUPPLIER_LINK, supplierOf, type PayInput, type PurchaseData, type PurchaseLine, type SupplierData } from "./purchases";
import { STOCK_SOURCE, syncStock } from "./sync";
import { nextVoucherNo } from "./treasury";
import { linkInvoice } from "../stores/purchase";

export async function saveSupplier(db: Db, row: FinDoc | null, f: { name: string; active: boolean; data: Omit<SupplierData, "accountId"> }): Promise<FinDoc> {
  const name = f.name.trim();
  if (!name) throw new JournalError("اكتب اسم المورد");
  const all = await db.list("finDocs", { where: { kind: SUPPLIER } });
  if (all.some((d) => d.id !== row?.id && d.name.trim() === name)) throw new JournalError("يوجد مورد بنفس الاسم");
  const fields = { kind: SUPPLIER, name, branchId: null, status: f.active ? "active" : "stopped", date: null };
  const doc = row ? await db.update("finDocs", row.id, { ...fields, data: { ...row.data, ...f.data } }) : await db.insert("finDocs", { ...fields, code: String(Math.max(0, ...all.map((d) => Number(d.code) || 0)) + 1), data: { ...f.data, accountId: "" } });
  const acc = await partyAccount(db, { key: "suppliers", linkType: SUPPLIER_LINK, linkId: doc.id, name, kind: "supplier" });
  return supplierOf(doc).accountId === acc.id ? doc : db.update("finDocs", doc.id, { data: { ...doc.data, accountId: acc.id } });
}

const codeOf = (j: Awaited<ReturnType<typeof journalContext>>, key: string) => {
  const a = j.accounts.find((x) => x.code === j.settings.links[key]);
  if (!a) throw new JournalError(`ربط الحسابات ناقص: لا يوجد حساب للبند "${key}"`);
  return a.id;
};
/** noon of the invoice day in Cairo, or now for today's invoice */
const momentOf = (date: string) => (date === cairoDay(new Date().toISOString()) ? undefined : `${date}T10:00:00.000Z`);
const nextNo = (docs: FinDoc[]) => String(Math.max(0, ...docs.map((d) => Number(d.code) || 0)) + 1);

export interface PurchaseInput { supplierId: string; date: string; invoiceNo: string; due: string; payment: "credit" | "cash"; moneyId: string | null; lines: PurchaseLine[]; discount: number; note: string; branchId: string | null; attachments?: { name: string; url: string }[]; /** طلب شراء whose received quantities this invoice enters */ requestId?: string | null }

/** فاتورة شراء: the goods enter their warehouses at the invoice price, the last price of each item follows, and the entry is posted. */
export async function postPurchase(db: Db, v: PurchaseInput, actor: Actor): Promise<FinDoc> {
  const j = await journalContext(db);
  const problem = purchaseProblem(v, j.settings);
  if (problem) throw new JournalError(problem);
  const supplier = await db.get("finDocs", v.supplierId);
  if (!supplier || supplier.kind !== SUPPLIER) throw new JournalError("المورد غير موجود");
  const lines = v.lines.filter((l) => l.itemId || l.accountId);
  const t = purchaseTotals(lines, v.discount);
  const acc = await partyAccount(db, { key: "suppliers", linkType: SUPPLIER_LINK, linkId: supplier.id, name: supplier.name, kind: "supplier" });
  const items = new Map((await db.list("stockItems")).map((i) => [i.id, i]));
  const locs = new Map((await db.list("storageLocations")).map((l) => [l.id, l]));
  for (const l of lines) if (l.type === "item" && (!items.get(l.itemId!) || !locs.get(l.locationId!))) throw new JournalError("صنف أو مخزن في الفاتورة غير موجود");
  const docs = await db.list("finDocs", { where: { kind: PURCHASE } });
  if (v.invoiceNo.trim() && docs.some((d) => (d.data as { supplierId?: string; invoiceNo?: string }).supplierId === v.supplierId && (d.data as { invoiceNo?: string }).invoiceNo === v.invoiceNo.trim())) throw new JournalError("فاتورة بنفس الرقم مسجلة لهذا المورد");
  const data: PurchaseData = { supplierId: v.supplierId, invoiceNo: v.invoiceNo.trim(), due: v.due || v.date, payment: v.payment, moneyId: v.payment === "cash" ? v.moneyId : null, lines, discount: v.discount, net: t.net, vat: t.vat, total: t.total, entryId: null, note: v.note.trim(), attachments: v.attachments ?? [], by: actor.name, requestId: v.requestId ?? null };
  const doc = await db.insert("finDocs", { kind: PURCHASE, code: nextNo(docs), name: supplier.name, branchId: v.branchId, status: "posted", date: v.date, data: data as unknown as Record<string, unknown> });
  const stock = lines.map((l, i) => ({ l, net: t.nets[i] })).filter((x) => x.l.type === "item");
  if (stock.length) {
    await applyMoves(db, stock.map(({ l, net }) => { const item = items.get(l.itemId!)!, loc = locs.get(l.locationId!)!; return { itemId: item.id, locationId: loc.id, branchId: loc.branchId, kind: "receive" as const, qty: toBaseQty(l.qty, item), value: net, refType: PURCHASE_REF, refId: doc.id, groupId: doc.id, note: `فاتورة شراء ${doc.code}: ${supplier.name}`, at: momentOf(v.date) }; }), { items });
    // آخر سعر شراء follows the invoice, so recipes and the next movements are costed at it
    for (const { l, net } of stock) { const item = items.get(l.itemId!)!, q = toBaseQty(l.qty, item); const cost = q > 0 ? Math.round(net / q) : 0; if (cost > 0 && cost !== item.lastCost) await db.update("stockItems", item.id, { lastCost: cost }); }
    await syncStock(db);
  }
  const e = await postSystem(db, {
    date: v.date, memo: `فاتورة شراء ${doc.code}${data.invoiceNo ? ` (${data.invoiceNo})` : ""}: ${supplier.name}`, branchId: v.branchId, kind: "auto", sourceType: PURCHASE, sourceId: doc.id, attachments: data.attachments,
    lines: purchaseLines({ lines, discount: v.discount, accruedId: codeOf(j, "purchases.accrued"), vatInputId: codeOf(j, "vat.input"), creditId: v.payment === "cash" ? v.moneyId! : acc.id, branchId: v.branchId }), meta: { supplierId: supplier.id, due: data.due, invoiceNo: data.invoiceNo },
  });
  if (v.requestId) await linkInvoice(db, v.requestId, doc.id, lines.filter((l) => l.type === "item").map((l) => l.itemId!), actor);
  return db.update("finDocs", doc.id, { data: { ...data, entryId: e?.id ?? null } as unknown as Record<string, unknown> });
}

export interface ReturnInput { supplierId: string; date: string; lines: PurchaseLine[]; refund: "credit" | "cash"; moneyId: string | null; note: string; branchId: string | null; ofInvoice?: string | null }
/** مرتجع مشتريات: the goods leave their warehouses and the supplier's balance (or the till) takes the value back. */
export async function postReturn(db: Db, v: ReturnInput, actor: Actor): Promise<FinDoc> {
  const j = await journalContext(db);
  const lines = v.lines.filter((l) => l.itemId);
  const problem = purchaseProblem({ supplierId: v.supplierId, date: v.date, payment: v.refund, moneyId: v.moneyId, lines: lines.map((l) => ({ ...l, type: "item" as const })) }, j.settings);
  if (problem) throw new JournalError(problem);
  const supplier = await db.get("finDocs", v.supplierId);
  if (!supplier || supplier.kind !== SUPPLIER) throw new JournalError("المورد غير موجود");
  const items = new Map((await db.list("stockItems")).map((i) => [i.id, i]));
  const locs = new Map((await db.list("storageLocations")).map((l) => [l.id, l]));
  for (const l of lines) {
    const item = items.get(l.itemId!), loc = locs.get(l.locationId!);
    if (!item || !loc) throw new JournalError("صنف أو مخزن في المرتجع غير موجود");
    const have = (await db.get("stockLevels", levelId(db.restaurantId, loc.id, item.id)))?.qty ?? 0;
    if (toBaseQty(l.qty, item) > have + 1e-6) throw new JournalError(`الكمية المتوفرة من ${item.name.ar} في ${loc.name.ar} أقل من المرتجع`);
  }
  const t = purchaseTotals(lines, 0);
  const acc = await partyAccount(db, { key: "suppliers", linkType: SUPPLIER_LINK, linkId: supplier.id, name: supplier.name, kind: "supplier" });
  const docs = await db.list("finDocs", { where: { kind: PURCHASE_RETURN } });
  const data = { supplierId: v.supplierId, invoiceNo: "", due: v.date, payment: v.refund, moneyId: v.refund === "cash" ? v.moneyId : null, lines, discount: 0, net: t.net, vat: t.vat, total: t.total, entryId: null as string | null, note: v.note.trim(), attachments: [], by: actor.name, ofInvoice: v.ofInvoice ?? null };
  const doc = await db.insert("finDocs", { kind: PURCHASE_RETURN, code: nextNo(docs), name: supplier.name, branchId: v.branchId, status: "posted", date: v.date, data: data as unknown as Record<string, unknown> });
  const moves = await applyMoves(db, lines.map((l) => { const item = items.get(l.itemId!)!, loc = locs.get(l.locationId!)!; return { itemId: item.id, locationId: loc.id, branchId: loc.branchId, kind: "receive" as const, qty: -toBaseQty(l.qty, item), refType: RETURN_REF, refId: doc.id, groupId: doc.id, note: `مرتجع مشتريات ${doc.code}: ${supplier.name}`, at: momentOf(v.date) }; }), { items });
  await syncStock(db);
  // what the movement's own entry took off stock under the costing method; the warehouse's figure when it was not posted
  const accruedId = codeOf(j, "purchases.accrued");
  const stockEntry = (await db.list("finEntries")).find((e) => e.sourceType === `${STOCK_SOURCE}${RETURN_REF}` && (e.sourceId ?? "").split("#")[0] === doc.id);
  const cost = stockEntry ? stockEntry.lines.filter((l) => l.account === accruedId).reduce((s, l) => s + l.debit - l.credit, 0) : moves.reduce((s, m) => s - m.value, 0);
  const e = await postSystem(db, {
    date: v.date, memo: `مرتجع مشتريات ${doc.code}: ${supplier.name}`, branchId: v.branchId, kind: "auto", sourceType: PURCHASE_RETURN, sourceId: doc.id, meta: { supplierId: supplier.id },
    lines: returnLines({ net: t.net, vat: t.vat, cost, accruedId, vatInputId: codeOf(j, "vat.input"), varianceId: codeOf(j, "price.variance"), debitId: v.refund === "cash" ? v.moneyId! : acc.id }),
  });
  return db.update("finDocs", doc.id, { data: { ...data, entryId: e?.id ?? null } as unknown as Record<string, unknown> });
}

/** سداد لمورد: a payment voucher on the supplier's account, with tax withheld at source and any discount earned. */
export async function paySupplier(db: Db, v: PayInput, actor: Actor): Promise<FinEntry> {
  if (!v.supplierId) throw new JournalError("اختر المورد");
  if (!v.moneyId) throw new JournalError("اختر الخزينة أو البنك");
  if (!(v.amount > 0) && !((v.discount ?? 0) > 0)) throw new JournalError("اكتب المبلغ");
  const supplier = await db.get("finDocs", v.supplierId);
  if (!supplier || supplier.kind !== SUPPLIER) throw new JournalError("المورد غير موجود");
  const acc = await partyAccount(db, { key: "suppliers", linkType: SUPPLIER_LINK, linkId: supplier.id, name: supplier.name, kind: "supplier" });
  const j = await journalContext(db);
  const s = paySplit(v);
  const year = fiscalYear(v.date, j.settings.yearStartMonth);
  const voucherNo = nextVoucherNo(j.entries, "payment", year);
  return submitEntry(db, null, {
    date: v.date, memo: v.memo.trim() || `سداد للمورد ${supplier.name}`, branchId: v.branchId, kind: "payment", sourceType: "voucher", sourceId: `payment:${year}:${voucherNo}`,
    lines: payLines(v, { supplierAccountId: acc.id, withholdId: s.withheld ? codeOf(j, "tax.withholding") : undefined, discountId: s.discount ? codeOf(j, "discount.received") : undefined }),
    meta: { voucherNo, party: supplier.name, method: v.method ?? "", ref: v.ref?.trim() ?? "", supplierId: supplier.id, withheld: s.withheld, discount: s.discount },
  }, actor);
}
