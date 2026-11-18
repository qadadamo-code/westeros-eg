/**
 * القيود التلقائية للمخازن والتصنيع: turns the stock movements of one action (a batch, a supply request, a transfer,
 * a count, a waste slip …) into the lines of one balanced entry. Pure: accounts are named by their posting key and the
 * item and warehouse they stand for; `sync.ts` turns those into real accounts.
 *
 *   stock in  → مدين مخزون المخزن        stock out → دائن مخزون المخزن
 *   and the other side by the kind of the movement:
 *   opening → أرصدة افتتاحية · receive → بضاعة مستلمة لم تصل فاتورتها · waste → هالك وتالف المخازن
 *   staff meal → وجبات الموظفين · count → فروق الجرد / فروق جرد بالزيادة · sale → تكلفة المبيعات
 *   transfer → بضاعة بالطريق (comes to nothing once both sides of the transfer are in)
 *   production → إنتاج تحت التشغيل; what is left there after the products come in is هالك التصنيع (or فروق تصنيع)
 */
import type { FinLine } from "@/data/financeTypes";
import type { StockItem, StockMove } from "@/data/inventoryTypes";
import type { MfgLists } from "@/data/productionTypes";
import type { Valued } from "./valuation";

export const STOCK_KEYS = ["stock.raw", "stock.product", "stock.packaging", "stock.supplies"] as const;
export type StockKey = (typeof STOCK_KEYS)[number];

/** Which stock account an item belongs to: a manufactured product, packaging, supplies, else raw material. */
export function stockKeyOf(item: Pick<StockItem, "kind" | "spec" | "note"> | undefined, lists: Pick<MfgLists, "packagingCategory" | "rawCategories"> | null | undefined): StockKey {
  if (!item) return "stock.raw";
  if (item.kind === "prep") return "stock.product";
  const pack = lists?.packagingCategory ?? lists?.rawCategories?.find((c) => c.includes("تغليف")) ?? "تغليف";
  if ((item.spec?.category ?? item.note) === pack) return "stock.packaging";
  if (item.spec?.storeType === "supplies") return "stock.supplies";
  return "stock.raw";
}

export interface Target { key: string; itemId?: string; locationId?: string }
export interface PlanLine { target: Target; debit: number; credit: number; branchId: string | null }
export interface Plan {
  /** refType|refId: one action */
  group: string;
  refType: string;
  refId: string;
  /** earliest movement of the action */
  at: string;
  branchId: string | null;
  lines: PlanLine[];
  moveIds: string[];
}

type Move = Pick<StockMove, "id" | "itemId" | "locationId" | "branchId" | "kind" | "qty" | "value" | "refType" | "refId" | "groupId" | "reason" | "at">;

const counterKey = (m: Move, stock: number, itemKey: StockKey): string => {
  switch (m.kind) {
    case "opening": return "opening";
    case "receive": return "purchases.accrued";
    case "sale": return itemKey === "stock.packaging" ? "cogs.packaging" : "cogs.raw";
    case "waste": return m.reason === "staff_meal" ? "staff.meals" : "waste.store";
    case "staff_meal": return "staff.meals";
    case "transfer_out": case "transfer_in": return "stock.transit";
    case "production_out": case "production_in": return "stock.wip";
    case "count_adjust": return stock >= 0 ? "count.gain" : "count.loss";
    default: return "price.variance";
  }
};
const side = (amount: number) => (amount >= 0 ? { debit: amount, credit: 0 } : { debit: 0, credit: -amount });
export const groupOf = (m: Pick<Move, "id" | "kind" | "refType" | "refId" | "groupId">) => ({ refType: m.refType ?? m.kind, refId: m.refId ?? m.groupId ?? m.id });

/** One plan per action, oldest first. `valued` says what each movement is worth under the costing method. */
export function planEntries(moves: Move[], valued: Map<string, Valued>, items: Map<string, StockItem>, lists: MfgLists | null | undefined): Plan[] {
  const plans = new Map<string, Plan>();
  for (const m of [...moves].sort((a, b) => a.at.localeCompare(b.at))) {
    const v = valued.get(m.id) ?? { stock: m.value, counter: m.value };
    const g = groupOf(m);
    const id = `${g.refType}|${g.refId}`;
    const plan = plans.get(id) ?? plans.set(id, { group: id, ...g, at: m.at, branchId: m.branchId, lines: [], moveIds: [] }).get(id)!;
    plan.moveIds.push(m.id);
    const key = stockKeyOf(items.get(m.itemId), lists);
    if (v.stock) plan.lines.push({ target: { key, itemId: m.itemId, locationId: m.locationId }, ...side(v.stock), branchId: m.branchId });
    const other = counterKey(m, v.stock, key);
    // transit and work in progress carry no branch, so the two sides of one action cancel out
    if (v.counter) plan.lines.push({ target: { key: other }, ...side(-v.counter), branchId: other === "stock.transit" || other === "stock.wip" ? null : m.branchId });
    const diff = v.stock - v.counter;
    if (diff) plan.lines.push({ target: { key: "price.variance" }, ...side(-diff), branchId: m.branchId });
  }
  for (const p of plans.values()) {
    // what stays in work in progress after the products came in was lost in the making (or gained: a costing difference)
    const wip = p.lines.filter((l) => l.target.key === "stock.wip").reduce((a, l) => a + l.debit - l.credit, 0);
    if (p.lines.some((l) => l.target.key === "stock.wip")) {
      p.lines = p.lines.filter((l) => l.target.key !== "stock.wip");
      if (wip) p.lines.push({ target: { key: wip > 0 ? "waste.mfg" : "mfg.variance" }, ...side(wip), branchId: p.branchId });
    }
  }
  return [...plans.values()];
}

/** Lines on the same account and branch become one line; what cancels out disappears. */
export function netLines(lines: FinLine[]): FinLine[] {
  const m = new Map<string, FinLine>();
  for (const l of lines) {
    const k = `${l.account}|${l.branchId ?? ""}|${l.centreId ?? ""}`;
    const cur = m.get(k);
    if (cur) { cur.debit += l.debit; cur.credit += l.credit; } else m.set(k, { ...l });
  }
  const out: FinLine[] = [];
  for (const l of m.values()) {
    const net = l.debit - l.credit;
    if (net) out.push({ ...l, ...side(net) });
  }
  return out.sort((a, b) => Number(b.debit > 0) - Number(a.debit > 0));
}
