/** الضرائب: إقرار القيمة المضافة شهر بشهر (مخرجات، مدخلات، رصيد مرحل، مستحق) وتسويته بقيد، وكشف الخصم من المنبع. */
import type { Db } from "@/data/hooks";
import type { FinAccount, FinEntry, FinLine, FinSettingsData } from "@/data/financeTypes";
import type { Units } from "@/lib/money";
import { JournalError, monthOf } from "./journal";
import { journalContext, postSystem } from "./journalOps";
import { linkedAccount } from "./sales";

export const VAT_SETTLE = "vat-settle";
const isSettle = (e: Pick<FinEntry, "sourceType">) => e.sourceType === VAT_SETTLE || e.sourceType === `reversal:${VAT_SETTLE}`;
/** ids of the linked account and everything under it */
export const under = (accounts: Pick<FinAccount, "id" | "code">[], code: string | undefined) => new Set(code ? accounts.filter((a) => a.code.startsWith(code)).map((a) => a.id) : []);

export interface VatRow { month: string; output: Units; input: Units; net: Units; /** credit brought from earlier months (≥ 0) */ carryIn: Units; payable: Units; carryOut: Units; settled: FinEntry | null }
/** Every month that has tax on it, oldest first. A month whose input is more than its output carries the credit to the next. */
export function vatRows(accounts: FinAccount[], entries: FinEntry[], settings: Pick<FinSettingsData, "links">): VatRow[] {
  const out = under(accounts, settings.links["vat.output"]), inp = under(accounts, settings.links["vat.input"]);
  const by = new Map<string, { output: Units; input: Units }>();
  const settled = new Map<string, FinEntry>();
  for (const e of entries) {
    if (e.status !== "posted") continue;
    if (isSettle(e)) { if (e.sourceType === VAT_SETTLE && !e.reversedBy && e.sourceId) settled.set(e.sourceId, e); continue; }
    for (const l of e.lines) {
      const o = out.has(l.account), i = inp.has(l.account);
      if (!o && !i) continue;
      const m = by.get(monthOf(e.date)) ?? { output: 0, input: 0 };
      if (o) m.output += l.credit - l.debit; else m.input += l.debit - l.credit;
      by.set(monthOf(e.date), m);
    }
  }
  let carry = 0;
  return [...by.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([month, m]) => {
    const net = m.output - m.input, due = net - carry;
    const row: VatRow = { month, output: m.output, input: m.input, net, carryIn: carry, payable: Math.max(due, 0), carryOut: Math.max(-due, 0), settled: settled.get(month) ?? null };
    carry = row.carryOut;
    return row;
  });
}

/** قيد التسوية: the month's output is cleared against its input and the credit carried in; what is left is paid. A credit stays on the input account. */
export function vatSettleLines(r: Pick<VatRow, "output" | "input" | "carryIn" | "payable">, ids: { output: string; input: string; money: string | null }): FinLine[] {
  const lines: FinLine[] = [];
  const used = r.output - r.payable; // the input (this month's and what was carried) the output swallows
  if (r.output) lines.push({ account: ids.output, debit: Math.max(r.output, 0), credit: Math.max(-r.output, 0), memo: "ضريبة المخرجات" });
  if (used) lines.push({ account: ids.input, debit: Math.max(-used, 0), credit: Math.max(used, 0), memo: "ضريبة المدخلات" });
  if (r.payable && ids.money) lines.push({ account: ids.money, debit: 0, credit: r.payable, memo: "سداد ضريبة القيمة المضافة" });
  return lines;
}

/** تسوية شهر: only after every earlier month is settled, so the carried credit is right. */
export async function settleVat(db: Db, month: string, v: { date: string; moneyId: string | null }): Promise<FinEntry> {
  const j = await journalContext(db);
  const rows = vatRows(j.accounts, j.entries, j.settings);
  const row = rows.find((r) => r.month === month);
  if (!row) throw new JournalError("لا توجد ضريبة على هذا الشهر");
  if (row.settled) throw new JournalError("الشهر متسوي بالفعل");
  const earlier = rows.find((r) => r.month < month && !r.settled);
  if (earlier) throw new JournalError(`سوِّ شهر ${earlier.month.split("-").reverse().join("/")} أولا`);
  if (row.payable && !v.moneyId) throw new JournalError("اختر الخزينة أو البنك الذي يسدد الضريبة");
  if (v.date < `${month}-01`) throw new JournalError("تاريخ التسوية قبل الشهر نفسه");
  const lines = vatSettleLines(row, { output: linkedAccount(j, "vat.output"), input: linkedAccount(j, "vat.input"), money: v.moneyId });
  if (!lines.length) throw new JournalError("لا يوجد ما يتسوى في هذا الشهر");
  const e = await postSystem(db, { date: v.date, memo: `تسوية ضريبة القيمة المضافة عن ${month.split("-").reverse().join("/")}`, branchId: null, kind: "auto", sourceType: VAT_SETTLE, sourceId: month, meta: { month, output: row.output, input: row.input, carryIn: row.carryIn, payable: row.payable }, lines }, j);
  if (!e) throw new JournalError("لا يوجد ما يتسوى في هذا الشهر");
  return e;
}

export interface TaxMove { month: string; added: Units; paid: Units }
/** What was added to a tax or insurance liability each month and what was paid off it. */
export function liabilityByMonth(accounts: FinAccount[], entries: FinEntry[], code: string | undefined): { rows: TaxMove[]; balance: Units } {
  const ids = under(accounts, code);
  const by = new Map<string, TaxMove>();
  let balance = 0;
  for (const e of entries) {
    if (e.status !== "posted") continue;
    for (const l of e.lines) if (ids.has(l.account)) {
      const m = by.get(monthOf(e.date)) ?? { month: monthOf(e.date), added: 0, paid: 0 };
      m.added += l.credit; m.paid += l.debit; balance += l.credit - l.debit;
      by.set(m.month, m);
    }
  }
  return { rows: [...by.values()].sort((a, b) => a.month.localeCompare(b.month)), balance };
}
