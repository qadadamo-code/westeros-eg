/** الموازنة التقديرية: a figure per account per month, and what really happened against it. */
import type { Db } from "@/data/hooks";
import type { FinAccount, FinDoc, FinEntry } from "@/data/financeTypes";
import type { Units } from "@/lib/money";
import { JournalError } from "./journal";
import { beforeClosing, netByCode, split } from "./statements";
import { addMonths, monthEnd } from "./treasury";
import { indexChart } from "./tree";

export const BUDGET = "budget";
export interface BudgetData {
  /** the year the financial year starts in */
  year: number;
  /** account id → "YYYY-MM" → amount (revenue as a positive figure, like cost and expense) */
  lines: Record<string, Record<string, Units>>;
  note?: string;
}
export const budgetOf = (d: FinDoc | null | undefined): BudgetData => ({ year: 0, lines: {}, ...((d?.data ?? {}) as Partial<BudgetData>) });
/** One budget per year and branch (null = the whole restaurant). */
export const findBudget = (docs: FinDoc[], year: number, branchId: string | null) => docs.find((d) => d.kind === BUDGET && budgetOf(d).year === year && (d.branchId ?? null) === branchId) ?? null;

export async function saveBudget(db: Db, row: FinDoc | null, f: { year: number; branchId: string | null; lines: BudgetData["lines"]; note?: string }): Promise<FinDoc> {
  if (!f.year) throw new JournalError("اختر السنة");
  const lines: BudgetData["lines"] = {};
  for (const [acc, months] of Object.entries(f.lines)) { const kept = Object.fromEntries(Object.entries(months).filter(([, v]) => v)); if (Object.keys(kept).length) lines[acc] = kept; }
  const fields = { kind: BUDGET, code: String(f.year), name: `موازنة ${f.year}`, branchId: f.branchId, status: "active", date: `${f.year}-01-01`, data: { year: f.year, lines, note: f.note ?? "" } as unknown as Record<string, unknown> };
  if (!row) { const dup = findBudget(await db.list("finDocs", { where: { kind: BUDGET } }), f.year, f.branchId); if (dup) row = dup; }
  return row ? db.update("finDocs", row.id, fields) : db.insert("finDocs", fields);
}

/** سنة كاملة على اثني عشر شهر بالتساوي، والكسر على آخر شهر */
export const spread = (annual: Units, months: string[]): Record<string, Units> => split(annual, Object.fromEntries(months.map((m) => [m, 1])));
export const yearTotal = (m: Record<string, Units> | undefined) => Object.values(m ?? {}).reduce((s, v) => s + v, 0);

const SIGN: Partial<Record<FinAccount["type"], 1 | -1>> = { revenue: -1, cogs: 1, expense: 1 };
export const isBudgeted = (a: Pick<FinAccount, "type" | "postable">) => a.postable && a.type in SIGN;

/** What each income and cost account really carried in every month of a period: the base of "copy last year". */
export function actualByMonth(accounts: FinAccount[], entries: FinEntry[], months: string[], branchId: string | null): BudgetData["lines"] {
  const out: BudgetData["lines"] = {};
  const live = beforeClosing(entries);
  for (const m of months) {
    const net = netByCode(accounts, live, { from: `${m}-01`, to: monthEnd(m), branchId });
    for (const a of accounts) { if (!isBudgeted(a)) continue; const v = SIGN[a.type]! * (net.get(a.code) ?? 0); if (v) (out[a.id] ??= {})[m] = v; }
  }
  return out;
}
/** موازنة من فعلي سنة سابقة: last year's months moved onto this year's, raised or cut by a percentage. */
export function fromActual(actual: BudgetData["lines"], shiftMonths: number, percent: number): BudgetData["lines"] {
  const out: BudgetData["lines"] = {};
  for (const [acc, months] of Object.entries(actual)) for (const [m, v] of Object.entries(months)) (out[acc] ??= {})[addMonths(m, shiftMonths)] = Math.round(v * (1 + percent / 100));
  return out;
}

export interface BudgetRow { id: string; code: string; label: string; level: number; type: FinAccount["type"]; postable: boolean; budget: Units; actual: Units; /** actual − budget */ diff: Units; /** good news: more income, or less cost, than planned */ good: boolean }
/** الفعلي مقابل الموازنة لشهور كاملة، مجمع على الشجرة. */
export function budgetVsActual(accounts: FinAccount[], entries: FinEntry[], data: BudgetData, months: string[], branchId: string | null, level = 5) {
  const ix = indexChart(accounts);
  const actual = actualByMonth(accounts, entries, months, branchId);
  const sum = new Map<string, { budget: Units; actual: Units }>();
  for (const a of accounts) {
    if (!isBudgeted(a)) continue;
    const b = months.reduce((s, m) => s + (data.lines[a.id]?.[m] ?? 0), 0), v = yearTotal(actual[a.id]);
    if (!b && !v) continue;
    for (let c: string | null = a.code; c; c = ix.byCode.get(c)?.parentCode ?? null) { const t = sum.get(c) ?? sum.set(c, { budget: 0, actual: 0 }).get(c)!; t.budget += b; t.actual += v; }
  }
  const rows: BudgetRow[] = [];
  const total = { revenue: { budget: 0, actual: 0 }, cogs: { budget: 0, actual: 0 }, expense: { budget: 0, actual: 0 } };
  for (const a of ix.ordered() as FinAccount[]) {
    const t = sum.get(a.code);
    if (!t || !(a.type in SIGN)) continue;
    const lvl = ix.level(a.code);
    if (lvl === 1) { const k = a.type as keyof typeof total; total[k].budget += t.budget; total[k].actual += t.actual; }
    if (lvl > level) continue;
    const diff = t.actual - t.budget;
    rows.push({ id: a.id, code: a.code, label: a.name.ar, level: lvl, type: a.type, postable: a.postable, ...t, diff, good: a.type === "revenue" ? diff >= 0 : diff <= 0 });
  }
  const net = { budget: total.revenue.budget - total.cogs.budget - total.expense.budget, actual: total.revenue.actual - total.cogs.actual - total.expense.actual };
  return { rows, total, net };
}
