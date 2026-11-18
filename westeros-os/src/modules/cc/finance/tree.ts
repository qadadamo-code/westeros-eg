/** Pure rules of the chart of accounts: levels, codes, types, what may be changed, and balances rolled up the tree. */
import type { FinAccount, FinAccountType, FinEntry, FinLine } from "@/data/financeTypes";
import type { Units } from "@/lib/money";
import { DEFAULT_TREE, type SeedAccount } from "./chart";

/** code length at each level (1 … 5) */
export const LEVEL_LEN = [1, 2, 4, 6, 8] as const;
export const MAX_LEVEL = LEVEL_LEN.length;

export const TYPES: { id: FinAccountType; digit: string; ar: string; en: string; debit: boolean; statement: "balance" | "income" }[] = [
  { id: "asset", digit: "1", ar: "أصول", en: "Assets", debit: true, statement: "balance" },
  { id: "liability", digit: "2", ar: "التزامات", en: "Liabilities", debit: false, statement: "balance" },
  { id: "equity", digit: "3", ar: "حقوق ملكية", en: "Equity", debit: false, statement: "balance" },
  { id: "revenue", digit: "4", ar: "إيرادات", en: "Revenue", debit: false, statement: "income" },
  { id: "cogs", digit: "5", ar: "تكلفة المبيعات", en: "Cost of sales", debit: true, statement: "income" },
  { id: "expense", digit: "6", ar: "مصروفات", en: "Expenses", debit: true, statement: "income" },
];
export const typeInfo = (t: FinAccountType) => TYPES.find((x) => x.id === t)!;
export const typeOfCode = (code: string): FinAccountType | null => TYPES.find((x) => x.digit === code[0])?.id ?? null;
/** طبيعة الحساب: true = مدين */
export const isDebit = (t: FinAccountType) => typeInfo(t).debit;

export const KINDS: { id: FinAccount["kind"]; ar: string }[] = [
  { id: "general", ar: "عادي" }, { id: "cash", ar: "خزينة" }, { id: "bank", ar: "بنك" }, { id: "wallet", ar: "محفظة إلكترونية" },
  { id: "inventory", ar: "مخزون" }, { id: "supplier", ar: "مورد" }, { id: "customer", ar: "عميل" }, { id: "employee", ar: "موظف" },
  { id: "tax", ar: "ضريبة" }, { id: "fixed_asset", ar: "أصل ثابت" },
];
export const CASHFLOWS: { id: NonNullable<FinAccount["cashflow"]>; ar: string }[] = [
  { id: "operating", ar: "تشغيلي" }, { id: "investing", ar: "استثماري" }, { id: "financing", ar: "تمويلي" },
];

export type Acc = Pick<FinAccount, "id" | "code" | "parentCode" | "type" | "postable" | "active" | "system" | "name">;

export class ChartError extends Error {}

export function indexChart<T extends Acc>(accounts: T[]) {
  const byCode = new Map<string, T>();
  const children = new Map<string | null, T[]>();
  for (const x of accounts) byCode.set(x.code, x);
  for (const x of [...accounts].sort((p, q) => p.code.localeCompare(q.code, "en", { numeric: false }))) {
    const k = x.parentCode && byCode.has(x.parentCode) ? x.parentCode : null;
    (children.get(k) ?? children.set(k, []).get(k)!).push(x);
  }
  const level = (code: string): number => {
    let n = 1;
    for (let c = byCode.get(code)?.parentCode ?? null; c && byCode.has(c) && n < 20; c = byCode.get(c)!.parentCode) n++;
    return n;
  };
  const path = (code: string): T[] => {
    const out: T[] = [];
    for (let c: string | null = code; c && byCode.has(c) && out.length < 20; c = byCode.get(c)!.parentCode) out.unshift(byCode.get(c)!);
    return out;
  };
  const descendants = (code: string): T[] => {
    const out: T[] = [];
    const walk = (c: string) => { for (const k of children.get(c) ?? []) { out.push(k); walk(k.code); } };
    walk(code);
    return out;
  };
  /** depth-first, parents before children */
  const ordered = (): T[] => {
    const out: T[] = [];
    const walk = (c: string | null) => { for (const k of children.get(c) ?? []) { out.push(k); walk(k.code); } };
    walk(null);
    return out;
  };
  return { byCode, children, level, path, descendants, ordered, kids: (code: string | null) => children.get(code) ?? [] };
}
export type ChartIndex<T extends Acc = Acc> = ReturnType<typeof indexChart<T>>;

/** The next free code under a parent: the parent's code + the next serial, as wide as the child's level asks. */
export function nextCode(parentCode: string, accounts: Acc[]): string {
  const ix = indexChart(accounts);
  const lvl = ix.level(parentCode) + 1;
  if (!ix.byCode.has(parentCode)) throw new ChartError("الحساب الأب غير موجود");
  if (lvl > MAX_LEVEL) throw new ChartError(`الشجرة ${MAX_LEVEL} مستويات فقط، لا يمكن إضافة حساب تحت المستوى الأخير`);
  const width = Math.max(1, LEVEL_LEN[lvl - 1] - parentCode.length);
  const used = new Set(accounts.map((x) => x.code));
  const taken = ix.kids(parentCode).map((k) => (k.code.startsWith(parentCode) ? Number(k.code.slice(parentCode.length)) : NaN)).filter((n) => Number.isFinite(n));
  for (let n = Math.max(0, ...taken) + 1; n < 10 ** width; n++) {
    const code = parentCode + String(n).padStart(width, "0");
    if (!used.has(code)) return code;
  }
  for (let n = 1; n < 10 ** width; n++) {
    const code = parentCode + String(n).padStart(width, "0");
    if (!used.has(code)) return code;
  }
  throw new ChartError("لا يوجد كود متاح تحت هذا الحساب");
}

const sameName = (p: string, q: string) => p.trim().replace(/\s+/g, " ") === q.trim().replace(/\s+/g, " ");

/** What stops an account from being saved; "" when it may be. `id` is the row being edited. */
export function accountProblem(next: { id?: string; code: string; nameAr: string; parentCode: string | null }, accounts: Acc[]): string {
  const code = next.code.trim();
  if (!/^\d+$/.test(code)) return "الكود أرقام فقط";
  if (!next.nameAr.trim()) return "اكتب اسم الحساب";
  if (accounts.some((x) => x.code === code && x.id !== next.id)) return `الكود ${code} مستخدم لحساب آخر`;
  if (!next.parentCode) return typeOfCode(code) && code.length === 1 ? "" : "الحساب الرئيسي كوده رقم واحد من 1 إلى 6";
  const parent = accounts.find((x) => x.code === next.parentCode);
  if (!parent) return "اختر الحساب الأب";
  if (code[0] !== parent.code[0]) return "أول رقم في الكود لازم يكون نفس رقم النوع";
  const ix = indexChart(accounts.filter((x) => x.id !== next.id));
  if (ix.level(parent.code) + 1 > MAX_LEVEL) return `الشجرة ${MAX_LEVEL} مستويات فقط`;
  if (ix.kids(parent.code).some((k) => sameName(k.name.ar, next.nameAr))) return "يوجد حساب بنفس الاسم تحت نفس الأب";
  return "";
}

export interface Usage {
  /** number of journal lines on the account, in any status */
  lines: number;
  children: number;
}
export function usageOf(acc: Pick<Acc, "id" | "code">, accounts: Acc[], entries: Pick<FinEntry, "lines">[]): Usage {
  let lines = 0;
  for (const e of entries) for (const l of e.lines) if (l.account === acc.id) lines++;
  return { lines, children: accounts.filter((x) => x.parentCode === acc.code).length };
}
/** Why an account cannot be deleted; "" when it can. */
export function deleteProblem(acc: Acc, u: Usage): string {
  if (!acc.parentCode) return "الحسابات الرئيسية الستة لا تحذف";
  if (acc.system) return "حساب نظام مربوط بقسم في السيستم، لا يحذف. تقدر تغير اسمه فقط.";
  if (u.children) return "الحساب تحته حسابات فرعية. احذفها أو انقلها أولا.";
  if (u.lines) return "الحساب عليه حركات، لا يحذف. تقدر توقفه بدل الحذف.";
  return "";
}
/** Why an account cannot move under `toParent`; "" when it can. */
export function moveProblem(acc: Acc, toParent: Acc | undefined, accounts: Acc[]): string {
  if (!acc.parentCode) return "الحسابات الرئيسية لا تنقل";
  if (!toParent) return "اختر الحساب الأب الجديد";
  if (toParent.code === acc.code) return "لا ينقل الحساب تحت نفسه";
  if (toParent.type !== acc.type) return "النقل يكون داخل نفس النوع فقط";
  const ix = indexChart(accounts);
  if (ix.descendants(acc.code).some((d) => d.code === toParent.code)) return "لا ينقل الحساب تحت أحد فروعه";
  const depth = 1 + Math.max(0, ...ix.descendants(acc.code).map((d) => ix.level(d.code) - ix.level(acc.code)));
  if (ix.level(toParent.code) + depth > MAX_LEVEL) return `النقل يتجاوز ${MAX_LEVEL} مستويات`;
  return "";
}

export interface Totals { debit: Units; credit: Units }
export interface BalanceFilter { from?: string | null; to?: string | null; branchId?: string | null; centreId?: string | null }
const lineIn = (e: Pick<FinEntry, "branchId">, l: FinLine, f: BalanceFilter) =>
  (!f.branchId || (l.branchId ?? e.branchId) === f.branchId) && (!f.centreId || l.centreId === f.centreId);

/** Posted movement per account id (own lines only; a line names its account by id, so a code may change freely). */
export function movement(entries: Pick<FinEntry, "status" | "date" | "lines" | "branchId">[], f: BalanceFilter = {}): Map<string, Totals> {
  const out = new Map<string, Totals>();
  for (const e of entries) {
    if (e.status !== "posted") continue;
    if (f.from && e.date < f.from) continue;
    if (f.to && e.date > f.to) continue;
    for (const l of e.lines) {
      if (!lineIn(e, l, f)) continue;
      const t = out.get(l.account) ?? out.set(l.account, { debit: 0, credit: 0 }).get(l.account)!;
      t.debit += l.debit;
      t.credit += l.credit;
    }
  }
  return out;
}
/** Movement of every account including everything under it, by account code. */
export function rollup(accounts: Acc[], own: Map<string, Totals>): Map<string, Totals> {
  const ix = indexChart(accounts);
  const out = new Map<string, Totals>();
  const walk = (x: Acc): Totals => {
    const t = { ...(own.get(x.id) ?? { debit: 0, credit: 0 }) };
    for (const k of ix.kids(x.code)) { const s = walk(k); t.debit += s.debit; t.credit += s.credit; }
    out.set(x.code, t);
    return t;
  };
  for (const r of ix.kids(null)) walk(r);
  return out;
}
/** The balance in the account's own direction (a debit-natured account with more debit is positive). */
export const balanceOf = (type: FinAccountType, t: Totals | undefined): Units => (t ? (isDebit(type) ? t.debit - t.credit : t.credit - t.debit) : 0);

/** The default tree as rows to insert, leaving out the codes that already exist. */
export function seedRows(existing: Set<string>, tree: SeedAccount[] = DEFAULT_TREE) {
  const codes = new Set(tree.map((x) => x.code));
  const parentOf = (code: string): string | null => {
    for (let i = LEVEL_LEN.length - 1; i >= 0; i--) if (LEVEL_LEN[i] < code.length && codes.has(code.slice(0, LEVEL_LEN[i]))) return code.slice(0, LEVEL_LEN[i]);
    return null;
  };
  const hasKids = new Set(tree.map((x) => parentOf(x.code)).filter(Boolean) as string[]);
  return tree.filter((x) => !existing.has(x.code)).map((x) => ({
    code: x.code, name: { ar: x.ar, en: x.en }, parentCode: parentOf(x.code), type: typeOfCode(x.code)!, postable: !hasKids.has(x.code),
    kind: x.kind ?? "general", cashflow: x.cashflow ?? (x.code[0] === "3" ? "financing" as const : x.code.startsWith("12") ? "investing" as const : "operating" as const),
    branchId: null, requireCentre: false, allowManual: !x.auto, system: x.key ?? (x.code.length === 1 ? `root.${x.code}` : null),
    linkType: null, linkId: null, alertMin: null, alertMax: null, active: true, note: "",
  }));
}
