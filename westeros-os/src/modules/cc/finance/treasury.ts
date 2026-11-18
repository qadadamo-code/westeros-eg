/** الخزينة والبنوك: the pure rules behind vouchers, transfers, expenses, prepaid expenses, cash counts and bank reconciliation. */
import type { FinAccount, FinDoc, FinEntry, FinLine } from "@/data/financeTypes";
import { UNITS_PER_MAJOR, type Units } from "@/lib/money";

export const MONEY_KINDS: FinAccount["kind"][] = ["cash", "bank", "wallet"];
export const MONEY_LABEL: Record<string, string> = { cash: "خزينة", bank: "بنك", wallet: "محفظة إلكترونية" };
/** the accounts money sits in: tills, safes, bank accounts and wallets that take entries */
export const moneyAccounts = <T extends Pick<FinAccount, "postable" | "kind" | "active">>(accounts: T[]) => accounts.filter((a) => a.postable && a.active && MONEY_KINDS.includes(a.kind));

export type VoucherType = "receipt" | "payment" | "transfer" | "expense";
export const VOUCHER_LABEL: Record<VoucherType, string> = { receipt: "سند قبض", payment: "سند صرف", transfer: "تحويل بين الخزائن والبنوك", expense: "مصروف" };
export const METHODS = ["نقدي", "تحويل بنكي", "شيك", "فيزا", "انستاباي", "محفظة إلكترونية"];

export interface VoucherInput {
  type: VoucherType;
  date: string;
  /** the till, safe or bank the money enters (receipt) or leaves (payment, transfer, cash expense); "" for an expense on credit */
  moneyId: string;
  /** receipt: the account credited · payment: the account debited · transfer: the till or bank that receives · expense: the expense account */
  otherId: string;
  amount: Units;
  /** expense only: recoverable VAT inside what was paid, on top of `amount` */
  vat?: Units;
  /** expense on credit: the supplier or accrued account that is owed */
  creditId?: string;
  party: string;
  memo: string;
  branchId: string | null;
  centreId?: string | null;
  method?: string;
  ref?: string;
  attachments?: FinEntry["attachments"];
}

/** The balanced lines of a voucher. */
export function voucherLines(v: VoucherInput, vatInputId?: string): FinLine[] {
  const c = v.centreId ? { centreId: v.centreId } : {};
  const total = v.amount + (v.type === "expense" ? v.vat ?? 0 : 0);
  switch (v.type) {
    case "receipt": return [{ account: v.moneyId, debit: v.amount, credit: 0 }, { account: v.otherId, debit: 0, credit: v.amount, ...c }];
    case "payment": return [{ account: v.otherId, debit: v.amount, credit: 0, ...c }, { account: v.moneyId, debit: 0, credit: v.amount }];
    case "transfer": return [{ account: v.otherId, debit: v.amount, credit: 0 }, { account: v.moneyId, debit: 0, credit: v.amount }];
    case "expense": return [
      { account: v.otherId, debit: v.amount, credit: 0, ...c },
      ...(v.vat && vatInputId ? [{ account: vatInputId, debit: v.vat, credit: 0 }] : []),
      { account: v.creditId || v.moneyId, debit: 0, credit: total },
    ];
  }
}
export function voucherProblem(v: VoucherInput): string {
  if (!v.date) return "اختر التاريخ";
  if (!(v.amount > 0)) return "اكتب المبلغ";
  if (v.type === "expense" ? !(v.creditId || v.moneyId) : !v.moneyId) return v.type === "expense" ? "اختر الخزينة أو البنك، أو الحساب الآجل" : "اختر الخزينة أو البنك";
  if (!v.otherId) return v.type === "transfer" ? "اختر الخزينة أو البنك المستلم" : v.type === "expense" ? "اختر حساب المصروف" : "اختر الحساب المقابل";
  if (v.type === "transfer" && v.otherId === v.moneyId) return "التحويل بين خزينتين مختلفتين";
  if ((v.vat ?? 0) < 0) return "الضريبة لا تكون بالسالب";
  return "";
}
/** Vouchers of one type are numbered inside the year: قبض 1، 2 … صرف 1، 2 … */
export const nextVoucherNo = (entries: Pick<FinEntry, "kind" | "year" | "meta">[], type: VoucherType, year: number) =>
  Math.max(0, ...entries.filter((e) => e.kind === type && e.year === year).map((e) => Number(e.meta?.voucherNo) || 0)) + 1;

/* ───────── التفقيط: المبلغ بالحروف ───────── */

const ONES = ["", "واحد", "اثنان", "ثلاثة", "أربعة", "خمسة", "ستة", "سبعة", "ثمانية", "تسعة", "عشرة", "أحد عشر", "اثنا عشر", "ثلاثة عشر", "أربعة عشر", "خمسة عشر", "ستة عشر", "سبعة عشر", "ثمانية عشر", "تسعة عشر"];
const TENS = ["", "", "عشرون", "ثلاثون", "أربعون", "خمسون", "ستون", "سبعون", "ثمانون", "تسعون"];
const HUNDREDS = ["", "مائة", "مائتان", "ثلاثمائة", "أربعمائة", "خمسمائة", "ستمائة", "سبعمائة", "ثمانمائة", "تسعمائة"];
const SCALES: [string, string, string][] = [["ألف", "ألفان", "آلاف"], ["مليون", "مليونان", "ملايين"], ["مليار", "ملياران", "مليارات"]];
function below1000(n: number): string {
  const parts: string[] = [];
  const h = Math.floor(n / 100), r = n % 100;
  if (h) parts.push(HUNDREDS[h]);
  if (r && r < 20) parts.push(ONES[r]);
  else if (r) parts.push(r % 10 ? `${ONES[r % 10]} و${TENS[Math.floor(r / 10)]}` : TENS[Math.floor(r / 10)]);
  return parts.join(" و");
}
export function numberWords(n: number): string {
  if (n === 0) return "صفر";
  const groups: string[] = [];
  for (let i = 0, rest = Math.floor(n); rest > 0; i++, rest = Math.floor(rest / 1000)) {
    const g = rest % 1000;
    if (!g) continue;
    if (i === 0) groups.unshift(below1000(g));
    else {
      const [one, two, many] = SCALES[i - 1] ?? SCALES[2];
      groups.unshift(g === 1 ? one : g === 2 ? two : g <= 10 ? `${below1000(g)} ${many}` : `${below1000(g)} ${one}`);
    }
  }
  return groups.join(" و");
}
/** "فقط ألف ومائتان وخمسون جنيها وخمسون قرشا لا غير" */
export function tafqeet(u: Units): string {
  const piastres = Math.round(Math.abs(u) / (UNITS_PER_MAJOR / 100));
  const pounds = Math.floor(piastres / 100), p = piastres % 100;
  const a = pounds ? `${numberWords(pounds)} جنيها` : "";
  const b = p ? `${numberWords(p)} قرشا` : "";
  return `فقط ${[a, b].filter(Boolean).join(" و") || "صفر"} لا غير`;
}

/* ───────── المصروفات المقدمة ───────── */

export const PREPAID = "prepaid";
export interface PrepaidData {
  total: Units;
  months: number;
  /** first month charged, "YYYY-MM" */
  start: string;
  prepaidAccount: string;
  expenseAccount: string;
  centreId: string | null;
  /** months already charged */
  posted: string[];
}
export const addMonths = (month: string, n: number) => {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};
export const monthEnd = (month: string) => {
  const [y, m] = month.split("-").map(Number);
  return `${month}-${String(new Date(y, m, 0).getDate()).padStart(2, "0")}`;
};
/** Equal months; the last one takes what rounding left. */
export function prepaidSchedule(d: Pick<PrepaidData, "total" | "months" | "start">): { month: string; amount: Units }[] {
  const n = Math.max(1, Math.round(d.months));
  const each = Math.floor(d.total / n);
  return Array.from({ length: n }, (_, i) => ({ month: addMonths(d.start, i), amount: i === n - 1 ? d.total - each * (n - 1) : each }));
}
/** The months of a prepaid expense that are due by `today` and not charged yet. */
export const prepaidDue = (d: PrepaidData, today: string) => prepaidSchedule(d).filter((s) => s.month <= today.slice(0, 7) && !d.posted.includes(s.month));

/* ───────── تسوية البنك ───────── */

export const BANK_RECON = "bank-recon";
export interface StatementLine { date: string; memo: string; /** + in, − out, as the bank shows it */ amount: Units; match?: string | null }
export interface BankReconData { accountId: string; statementBalance: Units; cleared: string[]; statement: StatementLine[] }
export interface BankRow { key: string; entry: FinEntry; line: FinLine; amount: Units; cleared: boolean }

export const lineKey = (e: Pick<FinEntry, "id">, i: number) => `${e.id}#${i}`;
/**
 * The lines of a bank account up to the statement date that earlier, closed reconciliations have not settled, and the
 * difference left between the statement and what was ticked: 0 means the bank and the books agree.
 */
export function bankRecon(accountId: string, entries: FinEntry[], doc: { date: string; data: BankReconData }, closed: Pick<FinDoc, "data">[]) {
  const before = new Set(closed.flatMap((d) => (d.data as unknown as BankReconData).cleared ?? []));
  const mine = new Set(doc.data.cleared);
  const rows: BankRow[] = [];
  let settled = 0, book = 0;
  for (const e of [...entries].filter((x) => x.status === "posted" && x.date <= doc.date).sort((a, b) => a.date.localeCompare(b.date) || a.no - b.no)) {
    e.lines.forEach((l, i) => {
      if (l.account !== accountId) return;
      const amount = l.debit - l.credit, key = lineKey(e, i);
      book += amount;
      if (before.has(key)) { settled += amount; return; }
      const cleared = mine.has(key);
      if (cleared) settled += amount;
      rows.push({ key, entry: e, line: l, amount, cleared });
    });
  }
  const uncleared = rows.filter((r) => !r.cleared);
  return {
    rows, book, settled,
    /** إيداعات بالطريق / مدفوعات لم تصرف */
    depositsInTransit: uncleared.filter((r) => r.amount > 0).reduce((s, r) => s + r.amount, 0),
    outstanding: uncleared.filter((r) => r.amount < 0).reduce((s, r) => s - r.amount, 0),
    difference: doc.data.statementBalance - settled,
  };
}
/** Pairs each statement line with a book line of the same amount within `days` days; each book line is used once. */
export function autoMatch(statement: StatementLine[], rows: Pick<BankRow, "key" | "amount" | "entry">[], days = 5): StatementLine[] {
  const used = new Set(statement.map((s) => s.match).filter(Boolean) as string[]);
  const gap = (a: string, b: string) => Math.abs(Date.parse(a) - Date.parse(b)) / 86_400_000;
  return statement.map((s) => {
    if (s.match) return s;
    const hit = rows.filter((r) => !used.has(r.key) && r.amount === s.amount && gap(r.entry.date, s.date) <= days).sort((a, b) => gap(a.entry.date, s.date) - gap(b.entry.date, s.date))[0];
    if (!hit) return s;
    used.add(hit.key);
    return { ...s, match: hit.key };
  });
}

/* ───────── جرد الخزينة ───────── */

export const CASH_COUNT = "cash-count";
export const DENOMINATIONS = [200, 100, 50, 20, 10, 5, 1, 0.5, 0.25];
export const countedTotal = (pieces: Record<string, number>): Units => Math.round(DENOMINATIONS.reduce((s, d) => s + d * (pieces[String(d)] || 0), 0) * UNITS_PER_MAJOR);
