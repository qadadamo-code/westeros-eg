/**
 * حركات الموظفين: العهد (صرف، تسوية بمصروف، رد)، الحوافز وبونص المبيعات والخصومات والمدخرات اللي بتدخل كشف رواتب الشهر، وسحب المدخرات.
 * Each move is one document; a money move posts its voucher right away, a payroll move waits (status open) until the month's payroll takes it (used).
 */
import type { Db } from "@/data/hooks";
import type { FinAccount, FinDoc, FinEntry } from "@/data/financeTypes";
import type { Units } from "@/lib/money";
import { fiscalYear, JournalError } from "./journal";
import { journalContext, reverseEntry, submitEntry, type Actor } from "./journalOps";
import { partyAccount } from "./parties";
import { CUSTODY_LINK, EMPLOYEE, SAVINGS_LINK } from "./payroll";
import { nextVoucherNo } from "./treasury";

export const STAFF_MOVE = "staff-move";
export const MOVE_TYPES = ["custody.give", "custody.spend", "custody.return", "bonus", "sales_bonus", "deduction", "savings", "savings.withdraw"] as const;
export type MoveType = (typeof MOVE_TYPES)[number];
export const MOVE_LABEL: Record<MoveType, string> = {
  "custody.give": "صرف عهدة", "custody.spend": "تسوية عهدة بمصروف", "custody.return": "رد عهدة",
  bonus: "حافز", sales_bonus: "بونص مبيعات", deduction: "خصم", savings: "مدخرات من الراتب", "savings.withdraw": "صرف من المدخرات",
};
/** moves that wait for the month's payroll */
export const PAYROLL_TYPES: MoveType[] = ["bonus", "sales_bonus", "deduction", "savings"];
export const needsMoney = (t: MoveType) => t === "custody.give" || t === "custody.return" || t === "savings.withdraw";

export interface MoveData {
  type: MoveType;
  employeeId: string;
  amount: Units;
  /** payroll moves: the month they go into ("YYYY-MM") */
  month: string | null;
  moneyId: string | null;
  /** تسوية عهدة: the expense it was spent on */
  expenseId: string | null;
  /** بونص مبيعات: the sales it was worked out from and the percent (basis points) */
  sales?: Units; pctBp?: number;
  memo: string;
  entryId: string | null;
  payrollId: string | null;
  cancelEntryId?: string | null;
  by: string;
  paidIn?: { currency: string; amount: Units; rate: number };
}
export const moveOf = (d: FinDoc) => d.data as unknown as MoveData;

export interface MoveInput { type: MoveType; employeeId: string; date: string; amount: Units; month?: string | null; moneyId?: string | null; expenseId?: string | null; sales?: Units; pctBp?: number; memo: string; paidIn?: MoveData["paidIn"] }

export function moveProblem(v: MoveInput): string {
  if (!v.employeeId) return "اختر الموظف";
  if (!v.date) return "اختر التاريخ";
  if (!(v.amount > 0)) return "اكتب المبلغ";
  if (needsMoney(v.type) && !v.moneyId) return "اختر الخزينة أو البنك";
  if (v.type === "custody.spend" && !v.expenseId) return "اختر حساب المصروف";
  if (PAYROLL_TYPES.includes(v.type) && !/^\d{4}-\d{2}$/.test(v.month ?? "")) return "اختر شهر الراتب";
  return "";
}

/** بونص المبيعات: percent of the sales */
export const salesBonus = (sales: Units, pctBp: number) => Math.round((sales * pctBp) / 10_000);

/** what each employee's payroll of `month` takes from the waiting moves */
export function payrollAdds(docs: FinDoc[], month: string): Map<string, { bonus: Units; deductions: Units; savings: Units; ids: string[] }> {
  const out = new Map<string, { bonus: Units; deductions: Units; savings: Units; ids: string[] }>();
  for (const d of docs) {
    if (d.kind !== STAFF_MOVE || d.status !== "open") continue;
    const m = moveOf(d);
    if (m.month !== month || !PAYROLL_TYPES.includes(m.type)) continue;
    const x = out.get(m.employeeId) ?? { bonus: 0, deductions: 0, savings: 0, ids: [] };
    if (m.type === "bonus" || m.type === "sales_bonus") x.bonus += m.amount;
    else if (m.type === "deduction") x.deductions += m.amount;
    else x.savings += m.amount;
    x.ids.push(d.id);
    out.set(m.employeeId, x);
  }
  return out;
}

/** رصيد كل موظف على حساباته الخاصة (عهدة: عليه، مدخرات: له) */
export function partyBalances(accounts: FinAccount[], entries: FinEntry[], linkType: string, sign: 1 | -1): Map<string, Units> {
  const byAccount = new Map(accounts.filter((a) => a.linkType === linkType && a.linkId).map((a) => [a.id, a.linkId as string]));
  const out = new Map<string, Units>();
  for (const e of entries) if (e.status === "posted") for (const l of e.lines) { const id = byAccount.get(l.account); if (id) out.set(id, (out.get(id) ?? 0) + sign * (l.debit - l.credit)); }
  return out;
}
export const custodyBalances = (accounts: FinAccount[], entries: FinEntry[]) => partyBalances(accounts, entries, CUSTODY_LINK, 1);
export const savingsBalances = (accounts: FinAccount[], entries: FinEntry[]) => partyBalances(accounts, entries, SAVINGS_LINK, -1);

const nextNo = (docs: FinDoc[]) => String(Math.max(0, ...docs.map((d) => Number(d.code) || 0)) + 1);

export async function saveMove(db: Db, v: MoveInput, actor: Actor): Promise<FinDoc> {
  const problem = moveProblem(v);
  if (problem) throw new JournalError(problem);
  const emp = await db.get("finDocs", v.employeeId);
  if (!emp || emp.kind !== EMPLOYEE) throw new JournalError("الموظف غير موجود");
  const docs = await db.list("finDocs", { where: { kind: STAFF_MOVE } });
  const label = MOVE_LABEL[v.type];
  const memo = v.memo.trim() || `${label}: ${emp.name}`;
  let entry: FinEntry | null = null;
  if (!PAYROLL_TYPES.includes(v.type)) {
    const j = await journalContext(db);
    if (v.type === "savings.withdraw") {
      const acc = j.accounts.find((a) => a.linkType === SAVINGS_LINK && a.linkId === emp.id);
      const has = acc ? savingsBalances(j.accounts, j.entries).get(emp.id) ?? 0 : 0;
      if (!acc || v.amount > has) throw new JournalError(`مدخرات ${emp.name} المتاحة ${(has / 100000).toFixed(2)}`);
      const year = fiscalYear(v.date, j.settings.yearStartMonth), no = nextVoucherNo(j.entries, "payment", year);
      entry = await submitEntry(db, null, { date: v.date, memo, branchId: emp.branchId, kind: "payment", sourceType: "voucher", sourceId: `payment:${year}:${no}`, lines: [{ account: acc.id, debit: v.amount, credit: 0 }, { account: v.moneyId!, debit: 0, credit: v.amount }], meta: { voucherNo: no, party: emp.name, employeeId: emp.id, staffMove: v.type, ...(v.paidIn ? { paidIn: v.paidIn } : {}) } }, actor);
    } else {
      const acc = await partyAccount(db, { key: "staff.advances", linkType: CUSTODY_LINK, linkId: emp.id, name: `عهدة ${emp.name}`, kind: "employee" });
      const j2 = await journalContext(db);
      if (v.type !== "custody.give") {
        const has = custodyBalances(j2.accounts, j2.entries).get(emp.id) ?? 0;
        if (v.amount > has) throw new JournalError(`رصيد عهدة ${emp.name} ${(has / 100000).toFixed(2)} بس`);
      }
      const kind = v.type === "custody.give" ? "payment" : v.type === "custody.return" ? "receipt" : "expense";
      const year = fiscalYear(v.date, j2.settings.yearStartMonth), no = nextVoucherNo(j2.entries, kind, year);
      const lines = v.type === "custody.give" ? [{ account: acc.id, debit: v.amount, credit: 0 }, { account: v.moneyId!, debit: 0, credit: v.amount }]
        : v.type === "custody.return" ? [{ account: v.moneyId!, debit: v.amount, credit: 0 }, { account: acc.id, debit: 0, credit: v.amount }]
        : [{ account: v.expenseId!, debit: v.amount, credit: 0, branchId: emp.branchId }, { account: acc.id, debit: 0, credit: v.amount }];
      entry = await submitEntry(db, null, { date: v.date, memo, branchId: emp.branchId, kind, sourceType: "voucher", sourceId: `${kind}:${year}:${no}`, lines, meta: { voucherNo: no, party: emp.name, employeeId: emp.id, staffMove: v.type, ...(v.paidIn ? { paidIn: v.paidIn } : {}) } }, actor);
    }
  }
  const data: MoveData = { type: v.type, employeeId: emp.id, amount: v.amount, month: PAYROLL_TYPES.includes(v.type) ? v.month ?? null : null, moneyId: v.moneyId ?? null, expenseId: v.expenseId ?? null, ...(v.type === "sales_bonus" ? { sales: v.sales ?? 0, pctBp: v.pctBp ?? 0 } : {}), memo: v.memo.trim(), entryId: entry?.id ?? null, payrollId: null, by: actor.name, ...(v.paidIn ? { paidIn: v.paidIn } : {}) };
  return db.insert("finDocs", { kind: STAFF_MOVE, code: nextNo(docs), name: emp.name, branchId: emp.branchId, status: PAYROLL_TYPES.includes(v.type) ? "open" : entry?.status === "pending" ? "pending" : "posted", date: v.date, data: data as unknown as Record<string, unknown> });
}

/** إلغاء حركة: a payroll move not taken yet is just cancelled; a money move is reversed. */
export async function cancelMove(db: Db, id: string, actor: Actor, today: string): Promise<FinDoc> {
  const doc = await db.get("finDocs", id);
  if (!doc || doc.kind !== STAFF_MOVE) throw new JournalError("الحركة غير موجودة");
  if (doc.status === "used") throw new JournalError("الحركة دخلت كشف رواتب. ألغِ الكشف الأول.");
  if (doc.status === "cancelled") throw new JournalError("الحركة ملغية بالفعل");
  const m = moveOf(doc);
  const rev = m.entryId ? await reverseEntry(db, m.entryId, { date: today, memo: `إلغاء ${MOVE_LABEL[m.type]}: ${doc.name}` }, actor) : null;
  return db.update("finDocs", id, { status: "cancelled", data: { ...doc.data, cancelEntryId: rev?.id ?? null } });
}
