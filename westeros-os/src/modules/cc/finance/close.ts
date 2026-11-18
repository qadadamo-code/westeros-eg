/**
 * الإقفال: what must be in place before a month is closed, the close itself (open → closed → locked), and the year-end
 * entry that empties income and cost accounts into أرباح العام.
 */
import type { Db } from "@/data/hooks";
import type { FinAccount, FinDoc, FinEntry, FinLine, FinPeriodStatus, FinSettingsData } from "@/data/financeTypes";
import type { StockItem, StockMove, StorageLocation } from "@/data/inventoryTypes";
import type { MfgLists } from "@/data/types";
import type { Units } from "@/lib/money";
import { depreciationDue } from "./assets";
import { kitchenPlan } from "./centres";
import { EMPLOYEE, PAYROLL, payrollOf } from "./payroll";
import { cairoDay, JournalError, monthOf, periodStatus } from "./journal";
import { journalContext, postClosing, RECURRING, type Actor, type RecurringData } from "./journalOps";
import { saveSettings } from "./ops";
import { inTransit, postedMoves, stockRecon } from "./sync";
import { addMonths, BANK_RECON, CASH_COUNT, monthEnd, PREPAID, prepaidDue, type BankReconData, type PrepaidData } from "./treasury";
import { isDebit } from "./tree";

export const YEAR_CLOSE = "year-close";
export const PERIOD_LABEL: Record<FinPeriodStatus, string> = { open: "مفتوح", closed: "مقفول", locked: "مقفول نهائيا" };
const label = (m: string) => m.split("-").reverse().join("/");

/** The twelve months of a financial year, in order. `year` is the year it starts in. */
export const monthsOfYear = (year: number, startMonth = 1) => Array.from({ length: 12 }, (_, i) => addMonths(`${year}-${String(startMonth).padStart(2, "0")}`, i));

export interface CloseCheck { id: string; label: string; ok: boolean; detail: string; to: string; /** a failed required check stops the close; the others only warn */ required: boolean }
export interface CloseData {
  accounts: FinAccount[]; entries: FinEntry[]; settings: FinSettingsData; docs: FinDoc[];
  moves: StockMove[]; items: Map<string, StockItem>; locations: Map<string, StorageLocation>; lists: MfgLists | null;
  branches: { id: string; isCentral?: boolean }[];
}

/** قائمة مراجعة إقفال الشهر */
export function monthChecks(a: CloseData, month: string): CloseCheck[] {
  const from = `${month}-01`, to = monthEnd(month);
  const inMonth = (d: string | null) => !!d && d >= from && d <= to;
  const out: CloseCheck[] = [];
  const add = (id: string, lbl: string, bad: number | boolean, detail: string, link: string, required = true) => out.push({ id, label: lbl, ok: !bad, detail: bad ? detail : "", to: link, required });

  const earlier = [...new Set(a.entries.filter((e) => e.status === "posted" && monthOf(e.date) < month).map((e) => monthOf(e.date)))].filter((m) => periodStatus(a.settings, `${m}-01`) === "open").sort();
  add("earlier", "الشهور السابقة مقفولة", earlier.length, `شهر ${label(earlier[0] ?? month)} ما زال مفتوح`, "/finance/close");
  const waiting = a.entries.filter((e) => (e.status === "draft" || e.status === "pending") && inMonth(e.date));
  add("drafts", "لا توجد مسودات أو قيود تنتظر الاعتماد", waiting.length, `${waiting.length} قيد بتاريخ هذا الشهر لم يرحل`, "/finance/journal");

  const start = a.settings.startDate;
  if (start && start <= to) {
    const done = postedMoves(a.entries);
    const unposted = a.moves.filter((m) => !done.has(m.id) && cairoDay(m.at) >= start && cairoDay(m.at) <= to).length;
    add("moves", "كل حركات المخازن لها قيود", unposted, `${unposted} حركة لم يسجل قيدها`, "/finance/reports/stock");
    const diff = unposted ? 0 : stockRecon({ accounts: a.accounts, entries: a.entries, settings: a.settings, moves: a.moves, items: a.items, locations: a.locations, lists: a.lists, to }).reduce((s, r) => s + Math.abs(r.diff), 0);
    add("stock", "قيمة المخازن تطابق حسابات المخزون", diff, "يوجد فرق في مطابقة المخزون آخر الشهر", "/finance/reports/stock");
    const late = inTransit(a.moves.filter((m) => cairoDay(m.at) <= to)).filter((t) => cairoDay(t.at) >= start).length;
    add("transit", "لا توجد بضاعة بالطريق آخر الشهر", late, `${late} تحويل خرج ولم يستلم`, "/finance/reports/stock", false);
  }

  const prepaid = a.docs.filter((d) => d.kind === PREPAID && d.status === "active").filter((d) => prepaidDue(d.data as unknown as PrepaidData, to).length).length;
  add("prepaid", "أقساط المصروفات المقدمة مسجلة", prepaid, `${prepaid} مصروف مقدم له قسط لم يسجل`, "/finance/treasury");
  const recurring = a.docs.filter((d) => d.kind === RECURRING && d.status === "active").filter((d) => { const r = d.data as unknown as RecurringData; return (!r.lastRun || r.lastRun < month) && (!r.until || monthOf(r.until) >= month); }).length;
  add("recurring", "القيود المتكررة أنشئت", recurring, `${recurring} قيد متكرر لم ينشأ لهذا الشهر`, "/finance/journal");

  const staff = a.docs.filter((d) => d.kind === EMPLOYEE && d.status === "active" && (!d.date || d.date <= to));
  if (staff.length) {
    const paid = new Set(a.docs.filter((d) => d.kind === PAYROLL && d.status !== "cancelled" && payrollOf(d).month === month).flatMap((d) => payrollOf(d).lines.map((l) => l.employeeId)));
    const missing = staff.filter((d) => !paid.has(d.id)).length;
    add("payroll", "رواتب الشهر مسجلة", missing, `${missing} موظف بدون كشف رواتب عن الشهر`, "/finance/payroll");
  }

  const dep = depreciationDue(a.docs, month);
  add("depreciation", "إهلاك الأصول الثابتة مسجل", dep.length, `${new Set(dep.map((d) => d.doc.id)).size} أصل له إهلاك لم يسجل`, "/finance/assets");

  if (a.settings.kitchenAllocation !== "none") {
    const plan = kitchenPlan({ accounts: a.accounts, entries: a.entries, settings: a.settings, branches: a.branches, moves: a.moves, locations: a.locations }, month);
    add("kitchen", "مصروفات المطبخ المركزي موزعة", plan.total > 0, plan.problem && plan.total ? plan.problem : "مصروفات على المطبخ المركزي لم توزع على الفروع", "/finance/centres");
  }

  const tills = a.accounts.filter((x) => x.postable && x.active && x.kind === "cash");
  const counted = new Set(a.docs.filter((d) => d.kind === CASH_COUNT && inMonth(d.date)).map((d) => (d.data as { accountId?: string }).accountId));
  const uncounted = tills.filter((t) => !counted.has(t.id) && a.entries.some((e) => e.status === "posted" && inMonth(e.date) && e.lines.some((l) => l.account === t.id)));
  add("count", "الخزائن اتجردت في الشهر", uncounted.length, `لم تجرد: ${uncounted.map((t) => t.name.ar).join("، ")}`, "/finance/treasury", false);
  const banks = a.accounts.filter((x) => x.postable && x.active && (x.kind === "bank" || x.kind === "wallet"));
  const reconciled = new Set(a.docs.filter((d) => d.kind === BANK_RECON && d.status === "closed" && (d.date ?? "") >= to).map((d) => (d.data as unknown as BankReconData).accountId));
  const open = banks.filter((b) => !reconciled.has(b.id) && a.entries.some((e) => e.status === "posted" && inMonth(e.date) && e.lines.some((l) => l.account === b.id)));
  add("bank", "حسابات البنوك متسوية", open.length, `بدون تسوية مقفولة: ${open.map((b) => b.name.ar).join("، ")}`, "/finance/treasury", false);

  const net = new Map<string, Units>();
  for (const e of a.entries) if (e.status === "posted" && e.date <= to) for (const l of e.lines) net.set(l.account, (net.get(l.account) ?? 0) + l.debit - l.credit);
  const negative = a.accounts.filter((x) => x.postable && ["cash", "bank", "wallet", "inventory"].includes(x.kind) && (isDebit(x.type) ? 1 : -1) * (net.get(x.id) ?? 0) < 0);
  add("negative", "لا يوجد رصيد خزينة أو مخزون بالسالب", negative.length, `بالسالب: ${negative.map((x) => x.name.ar).join("، ")}`, "/finance/chart", false);
  return out;
}

/** Why the month cannot move to `to`; "" when it can. */
export function periodProblem(a: { settings: FinSettingsData; checks: CloseCheck[]; canMonth: boolean; canYear: boolean }, month: string, to: FinPeriodStatus): string {
  const cur = periodStatus(a.settings, `${month}-01`);
  if (cur === to) return "الشهر على هذه الحالة بالفعل";
  if (!a.canMonth) return "ليس لديك صلاحية إقفال وفتح الشهور";
  if ((cur === "locked" || to === "locked") && !a.canYear) return "القفل النهائي وفكه لصاحب صلاحية إقفال السنة";
  if (cur === "open") { const bad = a.checks.find((c) => c.required && !c.ok); if (bad) return `${bad.label}: ${bad.detail}`; }
  if (to === "open") {
    const later = Object.entries(a.settings.periods).filter(([m, s]) => m > month && s !== "open").map(([m]) => m).sort();
    if (later.length) return `افتح الشهور الأحدث أولا (${label(later[later.length - 1])})`;
  }
  return "";
}
export async function setPeriod(db: Db, month: string, to: FinPeriodStatus) {
  const j = await journalContext(db);
  const periods = { ...j.settings.periods };
  if (to === "open") delete periods[month]; else periods[month] = to;
  await saveSettings(db, { periods });
}

/* ───────── إقفال السنة ───────── */

export interface YearPlan { year: number; from: string; to: string; lines: FinLine[]; profit: Units; carried: Units; problem: string; closed: FinEntry | null }
/** The closing entry of a financial year: every income and cost account back to zero, the difference to أرباح العام. */
export function yearPlan(a: { accounts: FinAccount[]; entries: FinEntry[]; settings: FinSettingsData }, year: number, today?: string): YearPlan {
  const months = monthsOfYear(year, a.settings.yearStartMonth);
  const from = `${months[0]}-01`, to = monthEnd(months[11]);
  const closed = a.entries.find((e) => e.sourceType === YEAR_CLOSE && e.sourceId === String(year) && !e.reversedBy) ?? null;
  const plan: YearPlan = { year, from, to, lines: [], profit: 0, carried: 0, problem: "", closed };
  if (closed) return { ...plan, problem: "السنة مقفولة" };
  const byCode = new Map(a.accounts.map((x) => [x.code, x]));
  const yearProfit = byCode.get(a.settings.links["year.profit"] ?? ""), retained = byCode.get(a.settings.links["retained"] ?? "");
  if (!yearProfit?.postable || !retained?.postable) return { ...plan, problem: "حساب أرباح العام أو الأرباح المرحلة غير موجود في ربط الحسابات" };
  const net = new Map<string, Units>();
  for (const e of a.entries) if (e.status === "posted" && e.date <= to) for (const l of e.lines) net.set(l.account, (net.get(l.account) ?? 0) + l.debit - l.credit);
  // last year's profit moves on to الأرباح المرحلة before this year's lands
  const carried = -(net.get(yearProfit.id) ?? 0);
  if (carried) plan.lines.push({ account: yearProfit.id, debit: Math.max(0, carried), credit: Math.max(0, -carried), memo: "ترحيل أرباح العام السابق" }, { account: retained.id, debit: Math.max(0, -carried), credit: Math.max(0, carried), memo: "ترحيل أرباح العام السابق" });
  let profit = 0;
  for (const x of a.accounts) {
    if (!x.postable || !["revenue", "cogs", "expense"].includes(x.type)) continue;
    const v = net.get(x.id) ?? 0;
    if (!v) continue;
    plan.lines.push({ account: x.id, debit: Math.max(0, -v), credit: Math.max(0, v) });
    profit -= v;
  }
  if (profit) plan.lines.push({ account: yearProfit.id, debit: Math.max(0, -profit), credit: Math.max(0, profit), memo: profit > 0 ? "صافي ربح السنة" : "صافي خسارة السنة" });
  plan.profit = profit; plan.carried = carried;
  // anything left on income and cost accounts before this year means the year before was never closed
  const before = new Map<string, Units>();
  for (const e of a.entries) if (e.status === "posted" && e.date < from) for (const l of e.lines) before.set(l.account, (before.get(l.account) ?? 0) + l.debit - l.credit);
  const earlier = a.accounts.some((x) => ["revenue", "cogs", "expense"].includes(x.type) && (before.get(x.id) ?? 0) !== 0);
  if (earlier) return { ...plan, problem: "اقفل السنة السابقة أولا" };
  if (today && to >= today) return { ...plan, problem: `السنة تنتهي ${to.split("-").reverse().join("/")}، تتقفل بعد نهايتها` };
  // an empty month has nothing to protect; the months that carry entries must be closed first
  const busy = new Set(a.entries.filter((e) => e.status !== "rejected").map((e) => monthOf(e.date)));
  const open = months.filter((m) => busy.has(m) && periodStatus(a.settings, `${m}-01`) === "open");
  if (open.length) return { ...plan, problem: `اقفل شهور السنة أولا. المفتوح: ${open.map(label).join("، ")}` };
  if (!plan.lines.length) return { ...plan, problem: "لا توجد إيرادات أو مصروفات في هذه السنة" };
  return plan;
}
/** Posts the closing entry and locks the twelve months. */
export async function closeYear(db: Db, year: number, actor: Actor, today?: string): Promise<FinEntry> {
  if (!actor.canApprove) throw new JournalError("ليس لديك صلاحية إقفال السنة");
  const j = await journalContext(db);
  const plan = yearPlan(j, year, today);
  if (plan.problem) throw new JournalError(plan.problem);
  const e = await postClosing(db, { date: plan.to, memo: `قيد إقفال السنة المالية ${year}`, lines: plan.lines, branchId: null, kind: "closing", sourceType: YEAR_CLOSE, sourceId: String(year), meta: { profit: plan.profit } }, actor);
  const periods = { ...j.settings.periods };
  for (const m of monthsOfYear(year, j.settings.yearStartMonth)) periods[m] = "locked";
  await saveSettings(db, { periods });
  return e;
}
/** فتح سنة مقفولة: the closing entry is reversed on its own day and the months go back to closed (not open). */
export async function reopenYear(db: Db, year: number, actor: Actor): Promise<void> {
  if (!actor.canApprove) throw new JournalError("ليس لديك صلاحية فتح السنة");
  const j = await journalContext(db);
  const e = j.entries.find((x) => x.sourceType === YEAR_CLOSE && x.sourceId === String(year) && !x.reversedBy);
  if (!e) throw new JournalError("السنة غير مقفولة");
  if (j.entries.some((x) => x.sourceType === YEAR_CLOSE && Number(x.sourceId) > year && !x.reversedBy)) throw new JournalError("افتح السنة الأحدث أولا");
  const rev = await postClosing(db, { date: e.date, memo: `فتح السنة المالية ${year}: عكس قيد الإقفال ${e.year}/${e.no}`, lines: e.lines.map((l) => ({ ...l, debit: l.credit, credit: l.debit })), branchId: null, kind: "closing", sourceType: `reversal:${YEAR_CLOSE}`, sourceId: String(year), reverses: e.id }, actor);
  await db.update("finEntries", e.id, { reversedBy: rev.id });
  const periods = { ...j.settings.periods };
  for (const m of monthsOfYear(year, j.settings.yearStartMonth)) periods[m] = "closed";
  await saveSettings(db, { periods });
}
