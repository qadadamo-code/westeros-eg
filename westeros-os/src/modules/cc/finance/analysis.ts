/**
 * تحليلات المطعم (Saqr 2026-11-25): تكلفة الأكل النظرية مقابل الفعلية، هندسة المنيو، مطابقة شركات التوصيل
 * ونسبة العمولة النهائية للشهر، وتغير أسعار الموردين. Pure: the screens hand in what they already loaded.
 */
import type { FinDoc, FinEntry } from "@/data/financeTypes";
import type { Receipt } from "@/data/types";
import type { Units } from "@/lib/money";
import { PURCHASE, purchaseOf } from "./purchases";
import { SETTLEMENT, settlementOf } from "./sales";

/* ───────── المبيعات بالصنف + هندسة المنيو ───────── */

export type MenuClass = "star" | "plowhorse" | "puzzle" | "dog";
export const MENU_CLASS: Record<MenuClass, { label: string; hint: string }> = {
  star: { label: "نجم", hint: "بينباع كتير وربحه عالي: حافظ عليه وخليه ظاهر" },
  plowhorse: { label: "حصان شغل", hint: "بينباع كتير بس ربحه قليل: ارفع سعره شوي أو قلل تكلفته" },
  puzzle: { label: "لغز", hint: "ربحه عالي بس بينباع قليل: روّج له أو غيّر مكانه بالمنيو" },
  dog: { label: "ضعيف", hint: "بينباع قليل وربحه قليل: فكر تشيله أو تغيره" },
};

export interface ItemSales {
  key: string; itemId: string | null; name: string;
  qty: number;
  /** المبيعات بعد الخصم وقبل الضريبة */
  sales: Units;
  /** تكلفة الوصفة × الكمية; null = الصنف ماله وصفة */
  cost: Units | null;
  /** ربح الوحدة (سعر البيع − التكلفة) */
  unitMargin: Units | null;
  costBp: number | null;
  /** نصيبه من عدد الأصناف المباعة */
  mixBp: number;
  cls: MenuClass | null;
}

/**
 * Sales per item from the till's receipts (sales minus returns), each with its recipe cost, and the menu-engineering
 * class (Kasavana & Smith): popular = mix ≥ 70% of an equal share; profitable = unit margin ≥ the weighted average.
 */
export function itemSales(receipts: Pick<Receipt, "kind" | "bill">[], unitCost: (itemId: string, name: string) => Units | null): { rows: ItemSales[]; qty: number; sales: Units; cost: Units; costed: Units } {
  const by = new Map<string, { itemId: string | null; name: string; qty: number; sales: Units }>();
  for (const r of receipts) {
    const sign = r.kind === "RC" ? -1 : 1;
    for (const l of r.bill.lines) {
      const key = l.itemId ?? `name:${l.name.ar}`;
      const x = by.get(key) ?? { itemId: l.itemId, name: l.name.ar, qty: 0, sales: 0 };
      x.qty += sign * l.qty;
      x.sales += sign * l.net;
      by.set(key, x);
    }
  }
  const list = [...by.entries()].filter(([, x]) => x.qty > 0);
  const qty = list.reduce((s, [, x]) => s + x.qty, 0);
  const rows = list.map(([key, x]) => {
    const u = x.itemId ? unitCost(x.itemId, x.name) : unitCost("", x.name);
    const cost = u == null ? null : Math.round(u * x.qty);
    return { key, ...x, cost, unitMargin: cost == null ? null : Math.round((x.sales - cost) / x.qty), costBp: cost == null || x.sales <= 0 ? null : Math.round((cost / x.sales) * 10_000), mixBp: qty ? Math.round((x.qty / qty) * 10_000) : 0, cls: null as MenuClass | null };
  });
  const costedRows = rows.filter((r) => r.cost != null);
  const costedQty = costedRows.reduce((s, r) => s + r.qty, 0);
  const avgMargin = costedQty ? costedRows.reduce((s, r) => s + (r.sales - r.cost!), 0) / costedQty : 0;
  const popular = rows.length ? (0.7 * 10_000) / rows.length : 0;
  for (const r of costedRows) {
    const hiPop = r.mixBp >= popular, hiMargin = (r.unitMargin ?? 0) >= avgMargin;
    r.cls = hiPop ? (hiMargin ? "star" : "plowhorse") : hiMargin ? "puzzle" : "dog";
  }
  rows.sort((a, b) => b.sales - a.sales);
  return { rows, qty, sales: rows.reduce((s, r) => s + r.sales, 0), cost: costedRows.reduce((s, r) => s + r.cost!, 0), costed: costedRows.reduce((s, r) => s + r.sales, 0) };
}

/* ───────── مطابقة شركات التوصيل والفيزا ───────── */

export interface ReconMonth {
  month: string;
  /** المبيعات اللي دخلت حساب التحصيل في الشهر */
  sales: Units;
  /** اللي اتسوى من مبيعات الشهر: المستلم + العمولة + ضريبتها */
  settled: Units;
  received: Units; commission: Units; commissionVat: Units;
  /** الفرق اللي لسه ما اتسواش */
  open: Units;
  /** نسبة العمولة النهائية = (العمولة + ضريبتها) ÷ المبيعات المسواة */
  rateBp: number | null;
}

/** the month a settlement belongs to: the sales period it covers when given, else its date */
const settlementMonth = (d: FinDoc) => { const x = settlementOf(d); return (x.periodTo || x.periodFrom || x.date || d.date || "").slice(0, 7); };

/** One row per month for one waiting account (طلبات، فيزا …): what came in, what was settled, and the final commission. */
export function deliveryRecon(accountId: string, entries: Pick<FinEntry, "date" | "status" | "lines" | "sourceType" | "reverses" | "reversedBy">[], docs: FinDoc[]): ReconMonth[] {
  const months = new Map<string, ReconMonth>();
  const row = (m: string) => { let r = months.get(m); if (!r) { r = { month: m, sales: 0, settled: 0, received: 0, commission: 0, commissionVat: 0, open: 0, rateBp: null }; months.set(m, r); } return r; };
  const settlements = docs.filter((d) => d.kind === SETTLEMENT && d.status === "posted" && settlementOf(d).fromId === accountId);
  for (const e of entries) {
    // settlements are counted from their documents; a cancelled entry and its reversal cancel out, so both stay out
    if (e.status !== "posted" || e.sourceType === SETTLEMENT || e.reverses || e.reversedBy) continue;
    const v = e.lines.reduce((s, l) => s + (l.account === accountId ? l.debit - l.credit : 0), 0);
    if (v) row(e.date.slice(0, 7)).sales += v;
  }
  for (const d of settlements) {
    const x = settlementOf(d);
    const r = row(settlementMonth(d));
    r.received += x.received; r.commission += x.commission; r.commissionVat += x.commissionVat; r.settled += x.received + x.commission + x.commissionVat;
  }
  return [...months.values()].map((r) => ({ ...r, open: r.sales - r.settled, rateBp: r.settled > 0 ? Math.round(((r.commission + r.commissionVat) / r.settled) * 10_000) : null })).sort((a, b) => b.month.localeCompare(a.month));
}

/* ───────── أسعار الموردين ───────── */

export interface PriceChange {
  itemId: string;
  supplierId: string;
  date: string; prevDate: string;
  price: Units; prev: Units;
  /** basis points: 1000 = +10% */
  changeBp: number;
}

/** The latest price change of every stock item bought twice or more: last invoice price against the one before it. */
export function priceChanges(docs: FinDoc[]): PriceChange[] {
  const buys = new Map<string, { date: string; price: Units; supplierId: string }[]>();
  for (const d of docs) {
    if (d.kind !== PURCHASE || d.status === "cancelled" || d.status === "draft") continue;
    const p = purchaseOf(d);
    for (const l of p.lines ?? []) {
      if (l.type !== "item" || !l.itemId || !(l.price > 0)) continue;
      const list = buys.get(l.itemId) ?? [];
      list.push({ date: d.date ?? "", price: l.price, supplierId: p.supplierId });
      buys.set(l.itemId, list);
    }
  }
  const out: PriceChange[] = [];
  for (const [itemId, list] of buys) {
    list.sort((a, b) => a.date.localeCompare(b.date));
    const last = list[list.length - 1];
    const prev = [...list].reverse().find((x) => x.price !== last.price && x.date <= last.date);
    if (!prev) continue;
    out.push({ itemId, supplierId: last.supplierId, date: last.date, prevDate: prev.date, price: last.price, prev: prev.price, changeBp: Math.round(((last.price - prev.price) / prev.price) * 10_000) });
  }
  return out.sort((a, b) => b.date.localeCompare(a.date) || b.changeBp - a.changeBp);
}
