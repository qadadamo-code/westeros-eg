/** Pure rules of the journal: what makes an entry valid, its number, an account's statement and the trial balance. */
import type { FinAccount, FinEntry, FinEntryKind, FinLine, FinPeriodStatus, FinSettingsData } from "@/data/financeTypes";
import type { Units } from "@/lib/money";
import { balanceOf, indexChart, isDebit, movement, rollup, type BalanceFilter, type Totals } from "./tree";

export class JournalError extends Error {}

export const KIND_LABEL: Record<FinEntryKind, string> = {
  manual: "قيد يدوي", auto: "قيد تلقائي", opening: "قيد افتتاحي", adjust: "قيد تسوية", closing: "قيد إقفال", reversal: "قيد عكسي",
  receipt: "سند قبض", payment: "سند صرف", transfer: "تحويل", expense: "مصروف",
};
export const STATUS_LABEL: Record<FinEntry["status"], string> = { draft: "مسودة", pending: "ينتظر الاعتماد", posted: "مرحل", rejected: "مرفوض" };

export const monthOf = (date: string) => date.slice(0, 7);
export const periodStatus = (s: Pick<FinSettingsData, "periods">, date: string): FinPeriodStatus => s.periods[monthOf(date)] ?? "open";
/** The financial year a day belongs to, named by the calendar year it starts in. */
export function fiscalYear(date: string, startMonth = 1): number {
  const [y, m] = date.split("-").map(Number);
  return m >= startMonth ? y : y - 1;
}
export const totalsOf = (lines: Pick<FinLine, "debit" | "credit">[]): Totals => lines.reduce((t, l) => ({ debit: t.debit + l.debit, credit: t.credit + l.credit }), { debit: 0, credit: 0 });
/** the amount of an entry: the sum of its debit side */
export const amountOf = (e: Pick<FinEntry, "lines">) => totalsOf(e.lines).debit;
export const cleanLines = (lines: FinLine[]): FinLine[] => lines.filter((l) => l.account && (l.debit || l.credit)).map((l) => ({ ...l, debit: Math.round(l.debit), credit: Math.round(l.credit) }));

type Acc = Pick<FinAccount, "id" | "code" | "name" | "postable" | "active" | "allowManual" | "requireCentre">;

/** What stops an entry from being posted; "" when nothing does. `manual` = typed by a person (not produced by the system). */
export function entryProblem(e: { date: string; lines: FinLine[] }, byId: Map<string, Acc>, settings: Pick<FinSettingsData, "periods">, opts: { manual?: boolean } = {}): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(e.date)) return "اختر تاريخ القيد";
  const lines = cleanLines(e.lines);
  if (lines.length < 2) return "القيد سطرين على الأقل";
  for (const l of lines) {
    const a = byId.get(l.account);
    if (!a) return "يوجد سطر على حساب غير موجود";
    if (l.debit < 0 || l.credit < 0) return "المبالغ لا تكون بالسالب";
    if (l.debit && l.credit) return `السطر على "${a.name.ar}" فيه مدين ودائن معا`;
    if (!a.postable) return `"${a.name.ar}" حساب تجميعي لا يقبل قيود`;
    if (!a.active) return `"${a.name.ar}" حساب موقوف`;
    if (opts.manual && !a.allowManual) return `"${a.name.ar}" يتحرك من السيستم فقط ولا يقبل قيد يدوي`;
    if (a.requireCentre && !l.centreId) return `"${a.name.ar}" يحتاج مركز تكلفة`;
  }
  const t = totalsOf(lines);
  if (t.debit !== t.credit) return "القيد غير متوازن: مجموع المدين لا يساوي مجموع الدائن";
  const st = periodStatus(settings, e.date);
  if (st !== "open") return `شهر ${monthOf(e.date).split("-").reverse().join("/")} مقفول، لا يقبل قيود`;
  return "";
}

/** The next serial of the year (posted entries only carry one). */
export const nextNo = (entries: Pick<FinEntry, "no" | "year">[], year: number) => Math.max(0, ...entries.filter((e) => e.year === year).map((e) => e.no)) + 1;
/** "2026/15" */
export const entryRef = (e: Pick<FinEntry, "no" | "year" | "status">) => (e.no ? `${e.year}/${e.no}` : "—");

/** The mirror image of an entry's lines. */
export const reversed = (lines: FinLine[]): FinLine[] => lines.map((l) => ({ ...l, debit: l.credit, credit: l.debit }));

export interface StatementRow { entry: FinEntry; line: FinLine; debit: Units; credit: Units; balance: Units }
/** كشف حساب: opening balance before `from`, then every posted line in order with the running balance (in the account's direction). */
export function statement(account: Pick<FinAccount, "id" | "type">, entries: FinEntry[], f: BalanceFilter = {}) {
  const sign = isDebit(account.type) ? 1 : -1;
  const mine = (e: FinEntry, l: FinLine) => l.account === account.id && (!f.branchId || (l.branchId ?? e.branchId) === f.branchId) && (!f.centreId || l.centreId === f.centreId);
  const posted = entries.filter((e) => e.status === "posted").sort((a, b) => a.date.localeCompare(b.date) || a.year - b.year || a.no - b.no || a.createdAt.localeCompare(b.createdAt));
  let opening = 0;
  const rows: StatementRow[] = [];
  for (const e of posted) {
    if (f.to && e.date > f.to) continue;
    for (const l of e.lines) {
      if (!mine(e, l)) continue;
      const delta = sign * (l.debit - l.credit);
      if (f.from && e.date < f.from) { opening += delta; continue; }
      rows.push({ entry: e, line: l, debit: l.debit, credit: l.credit, balance: 0 });
    }
  }
  let run = opening;
  for (const r of rows) { run += sign * (r.debit - r.credit); r.balance = run; }
  const t = totalsOf(rows);
  return { opening, rows, debit: t.debit, credit: t.credit, closing: run };
}

export interface TrialRow {
  account: FinAccount; level: number;
  openDebit: Units; openCredit: Units; moveDebit: Units; moveCredit: Units; closeDebit: Units; closeCredit: Units;
}
const side = (net: Units): [Units, Units] => (net >= 0 ? [net, 0] : [0, -net]);
/**
 * ميزان المراجعة: opening balance, movement of the period and closing balance of every account down to `level`.
 * A parent shows the sum of what is under it; with `leavesOnly` only the accounts that take entries are listed.
 */
export function trialBalance(accounts: FinAccount[], entries: FinEntry[], f: BalanceFilter & { level?: number; hideZero?: boolean; leavesOnly?: boolean } = {}) {
  const ix = indexChart(accounts);
  const before = f.from ? rollup(accounts, movement(entries, { ...f, from: null, to: dayBefore(f.from) })) : new Map<string, Totals>();
  const during = rollup(accounts, movement(entries, f));
  const rows: TrialRow[] = [];
  for (const a of ix.ordered()) {
    const level = ix.level(a.code);
    if (f.leavesOnly ? !a.postable : f.level && level > f.level) continue;
    const o = before.get(a.code) ?? { debit: 0, credit: 0 };
    const m = during.get(a.code) ?? { debit: 0, credit: 0 };
    const [openDebit, openCredit] = side(o.debit - o.credit);
    const [closeDebit, closeCredit] = side(o.debit - o.credit + m.debit - m.credit);
    if (f.hideZero && !openDebit && !openCredit && !m.debit && !m.credit) continue;
    rows.push({ account: a, level, openDebit, openCredit, moveDebit: m.debit, moveCredit: m.credit, closeDebit, closeCredit });
  }
  // totals come from the accounts that take entries, so a parent is never counted twice
  const leaves = accounts.filter((a) => a.postable);
  const sum = { openDebit: 0, openCredit: 0, moveDebit: 0, moveCredit: 0, closeDebit: 0, closeCredit: 0 };
  for (const a of leaves) {
    const o = before.get(a.code) ?? { debit: 0, credit: 0 };
    const m = during.get(a.code) ?? { debit: 0, credit: 0 };
    const [od, oc] = side(o.debit - o.credit);
    const [cd, cc] = side(o.debit - o.credit + m.debit - m.credit);
    sum.openDebit += od; sum.openCredit += oc; sum.moveDebit += m.debit; sum.moveCredit += m.credit; sum.closeDebit += cd; sum.closeCredit += cc;
  }
  return { rows, sum, balanced: sum.closeDebit === sum.closeCredit && sum.moveDebit === sum.moveCredit };
}
export function dayBefore(day: string): string {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}
export { balanceOf };
