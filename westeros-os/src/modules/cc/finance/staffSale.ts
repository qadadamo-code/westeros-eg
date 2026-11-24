/**
 * فاتورة مبيعات للموظفين (Mohammed 2026-11-24): بيع خامات أو منتجات مصنعة من المخزن لموظف بس.
 * الشاشة بتعرض تكلفة الصنف، وسعر البيع بيتكتب بإيد المحاسب. الخروج من المخزن بقيده (تكلفة المبيعات) زي أي بيع،
 * والفاتورة بقيد: من حساب الموظف (بيتخصم من المرتب) أو من الخزينة، إلى حساب الإيراد.
 */
import type { Db } from "@/data/hooks";
import type { FinDoc } from "@/data/financeTypes";
import type { Units } from "@/lib/money";
import { applyMoves, levelId } from "@/modules/inventory/stock";
import { toBaseQty } from "../lib";
import { cairoDay, JournalError } from "./journal";
import { postSystem, type Actor } from "./journalOps";
import { partyAccount } from "./parties";
import { EMPLOYEE, EMPLOYEE_LINK } from "./payroll";
import { syncStock } from "./sync";

export const STAFF_SALE = "staff-sale";
export const STAFF_SALE_REF = "fin_staff_sale";

export interface StaffSaleLine { itemId: string; locationId: string; /** in the item's line unit (كيلو، كرتونة…) */ qty: number; /** per line unit */ price: Units }
export interface StaffSaleInput { employeeId: string; date: string; payment: "employee" | "cash"; moneyId: string | null; revenueId: string; lines: StaffSaleLine[]; note: string }
export interface StaffSaleData extends StaffSaleInput { total: Units; cost: Units; entryId: string | null; by: string }
export const staffSaleOf = (d: FinDoc) => d.data as unknown as StaffSaleData;

export const saleTotal = (lines: Pick<StaffSaleLine, "qty" | "price">[]) => lines.reduce((s, l) => s + Math.round(l.qty * l.price), 0);

export function staffSaleProblem(v: StaffSaleInput): string {
  if (!v.employeeId) return "اختر الموظف (البيع للموظفين بس)";
  if (!v.date) return "اختر التاريخ";
  if (!v.lines.length) return "ضيف صنف";
  for (const l of v.lines) {
    if (!l.itemId || !l.locationId) return "اختر الصنف والمخزن في كل سطر";
    if (!(l.qty > 0)) return "اكتب الكمية في كل سطر";
    if (!(l.price > 0)) return "اكتب سعر البيع في كل سطر";
  }
  if (!v.revenueId) return "اختر حساب الإيراد";
  if (v.payment === "cash" && !v.moneyId) return "اختر الخزينة أو البنك";
  return "";
}

const momentOf = (date: string) => (date === cairoDay(new Date().toISOString()) ? undefined : `${date}T10:00:00.000Z`);

export async function postStaffSale(db: Db, v: StaffSaleInput, actor: Actor): Promise<FinDoc> {
  const problem = staffSaleProblem(v);
  if (problem) throw new JournalError(problem);
  const emp = await db.get("finDocs", v.employeeId);
  if (!emp || emp.kind !== EMPLOYEE) throw new JournalError("الموظف غير موجود");
  const items = new Map((await db.list("stockItems")).map((i) => [i.id, i]));
  const locs = new Map((await db.list("storageLocations")).map((l) => [l.id, l]));
  // nothing leaves a warehouse that does not hold it
  const need = new Map<string, number>();
  for (const l of v.lines) {
    const item = items.get(l.itemId), loc = locs.get(l.locationId);
    if (!item || !loc) throw new JournalError("صنف أو مخزن في الفاتورة غير موجود");
    const k = levelId(db.restaurantId, loc.id, item.id);
    need.set(k, (need.get(k) ?? 0) + toBaseQty(l.qty, item));
  }
  for (const l of v.lines) {
    const item = items.get(l.itemId)!, loc = locs.get(l.locationId)!;
    const k = levelId(db.restaurantId, loc.id, item.id);
    const have = (await db.get("stockLevels", k))?.qty ?? 0;
    if ((need.get(k) ?? 0) > have + 1e-6) throw new JournalError(`الكمية المتوفرة من ${item.name.ar} في ${loc.name.ar} أقل من المطلوب`);
  }
  const total = saleTotal(v.lines);
  const docs = await db.list("finDocs", { where: { kind: STAFF_SALE } });
  const code = String(Math.max(0, ...docs.map((d) => Number(d.code) || 0)) + 1);
  const data: StaffSaleData = { ...v, moneyId: v.payment === "cash" ? v.moneyId : null, note: v.note.trim(), total, cost: 0, entryId: null, by: actor.name };
  const doc = await db.insert("finDocs", { kind: STAFF_SALE, code, name: emp.name, branchId: emp.branchId, status: "posted", date: v.date, data: data as unknown as Record<string, unknown> });
  const memo = `فاتورة مبيعات ${code} للموظف ${emp.name}`;
  const moves = await applyMoves(db, v.lines.map((l) => { const item = items.get(l.itemId)!, loc = locs.get(l.locationId)!; return { itemId: item.id, locationId: loc.id, branchId: loc.branchId, kind: "sale" as const, qty: -toBaseQty(l.qty, item), refType: STAFF_SALE_REF, refId: doc.id, groupId: doc.id, note: memo, at: momentOf(v.date) }; }), { items });
  await syncStock(db);
  const cost = moves.reduce((s, m) => s - m.value, 0);
  const debit = v.payment === "cash" ? v.moneyId! : (await partyAccount(db, { key: "staff.advances", linkType: EMPLOYEE_LINK, linkId: emp.id, name: emp.name, kind: "employee" })).id;
  const e = await postSystem(db, {
    date: v.date, memo, branchId: emp.branchId, kind: "auto", sourceType: STAFF_SALE, sourceId: doc.id, meta: { employeeId: emp.id, party: emp.name },
    lines: [{ account: debit, debit: total, credit: 0 }, { account: v.revenueId, debit: 0, credit: total, branchId: emp.branchId }],
  });
  return db.update("finDocs", doc.id, { data: { ...data, cost, entryId: e?.id ?? null } as unknown as Record<string, unknown> });
}
