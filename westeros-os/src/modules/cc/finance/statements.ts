/**
 * القوائم المالية: قائمة الدخل، المركز المالي، التدفقات النقدية، حركة الخزائن، مؤشرات المطعم، وتوزيع المصروفات.
 * Pure: every function takes the chart and the journal and returns rows ready to show, one value per column
 * (a column is a period, a branch or a cost centre).
 */
import type { FinAccount, FinEntry, FinLine, FinSettingsData } from "@/data/financeTypes";
import type { Units } from "@/lib/money";
import { MONEY_KINDS } from "./treasury";
import { indexChart, movement, rollup, type BalanceFilter } from "./tree";

export interface StRow {
  id: string;
  label: string;
  code?: string;
  /** indentation, 0 = a heading or a total */
  level: number;
  kind: "section" | "account" | "total";
  values: Units[];
  accountId?: string;
  postable?: boolean;
}

/** debit − credit of every account (rolled up to its parents), by code */
export function netByCode(accounts: FinAccount[], entries: FinEntry[], f: BalanceFilter): Map<string, Units> {
  const r = rollup(accounts, movement(entries, f));
  return new Map([...r].map(([code, t]) => [code, t.debit - t.credit]));
}

const section = (accounts: FinAccount[], nets: Map<string, Units>[], type: FinAccount["type"], sign: 1 | -1, level: number): { rows: StRow[]; total: Units[] } => {
  const ix = indexChart(accounts);
  const rows: StRow[] = [];
  const total = nets.map(() => 0);
  const walk = (a: FinAccount, depth: number) => {
    const values = nets.map((n) => sign * (n.get(a.code) ?? 0) || 0);
    if (values.every((v) => !v)) return;
    const lvl = ix.level(a.code);
    // the root of the type is the section heading, not a row
    if (lvl > 1) rows.push({ id: a.id, label: a.name.ar, code: a.code, level: depth, kind: "account", values, accountId: a.id, postable: a.postable });
    if (lvl < level) for (const k of ix.kids(a.code)) walk(k as FinAccount, lvl > 1 ? depth + 1 : depth);
  };
  for (const root of ix.kids(null).filter((r) => r.type === type) as FinAccount[]) {
    nets.forEach((n, i) => { total[i] += sign * (n.get(root.code) ?? 0) || 0; });
    walk(root, 1);
  }
  return { rows, total };
};
const head = (id: string, label: string, n: number): StRow => ({ id, label, level: 0, kind: "section", values: Array(n).fill(0) });
const sumRow = (id: string, label: string, values: Units[]): StRow => ({ id, label, level: 0, kind: "total", values });

/** قائمة الدخل: إيرادات، تكلفة مبيعات، مجمل ربح، مصروفات، صافي ربح. One value per filter. */
/** قيد إقفال السنة يصفر الإيرادات والمصروفات في الدفتر، لكن قوائم الدخل تقرأ السنة قبل إقفالها */
export const beforeClosing = (entries: FinEntry[]) => (entries.some((e) => e.kind === "closing") ? entries.filter((e) => e.kind !== "closing") : entries);

export function incomeStatement(accounts: FinAccount[], all: FinEntry[], cols: BalanceFilter[], level = 3) {
  const entries = beforeClosing(all);
  const nets = cols.map((f) => netByCode(accounts, entries, f));
  const rev = section(accounts, nets, "revenue", -1, level);
  const cogs = section(accounts, nets, "cogs", 1, level);
  const exp = section(accounts, nets, "expense", 1, level);
  const gross = rev.total.map((v, i) => v - cogs.total[i]);
  const net = gross.map((v, i) => v - exp.total[i]);
  const n = cols.length;
  const rows: StRow[] = [
    head("h-rev", "الإيرادات", n), ...rev.rows, sumRow("t-rev", "إجمالي الإيرادات", rev.total),
    head("h-cogs", "تكلفة المبيعات", n), ...cogs.rows, sumRow("t-cogs", "إجمالي تكلفة المبيعات", cogs.total),
    sumRow("t-gross", "مجمل الربح", gross),
    head("h-exp", "المصروفات", n), ...exp.rows, sumRow("t-exp", "إجمالي المصروفات", exp.total),
    sumRow("t-net", "صافي الربح", net),
  ];
  return { rows, revenue: rev.total, cogs: cogs.total, gross, expenses: exp.total, net };
}

/** المركز المالي في تاريخ: أصول = التزامات + حقوق ملكية (ومعها ربح الفترة الذي لم يقفل بعد). */
export function balanceSheet(accounts: FinAccount[], entries: FinEntry[], cols: { to: string | null; branchId?: string | null }[], level = 3) {
  const nets = cols.map((c) => netByCode(accounts, entries, { to: c.to, branchId: c.branchId }));
  const assets = section(accounts, nets, "asset", 1, level);
  const liab = section(accounts, nets, "liability", -1, level);
  const eq = section(accounts, nets, "equity", -1, level);
  const ix = indexChart(accounts);
  const roots = ix.kids(null) as FinAccount[];
  // income and cost accounts that no closing entry has emptied yet: the profit of the open period
  const open = nets.map((n) => -roots.filter((r) => r.type === "revenue" || r.type === "cogs" || r.type === "expense").reduce((s, r) => s + (n.get(r.code) ?? 0), 0) || 0);
  const equity = eq.total.map((v, i) => v + open[i]);
  const n = cols.length;
  const rows: StRow[] = [
    head("h-as", "الأصول", n), ...assets.rows, sumRow("t-as", "إجمالي الأصول", assets.total),
    head("h-li", "الالتزامات", n), ...liab.rows, sumRow("t-li", "إجمالي الالتزامات", liab.total),
    head("h-eq", "حقوق الملكية", n), ...eq.rows, { id: "open-profit", label: "صافي ربح الفترة (لم يقفل)", level: 1, kind: "account", values: open }, sumRow("t-eq", "إجمالي حقوق الملكية", equity),
    sumRow("t-le", "إجمالي الالتزامات وحقوق الملكية", liab.total.map((v, i) => v + equity[i])),
  ];
  return { rows, assets: assets.total, liabilities: liab.total, equity, balanced: assets.total.every((v, i) => v === liab.total[i] + equity[i]) };
}

const inFilter = (e: FinEntry, l: FinLine, f: BalanceFilter) => (!f.branchId || (l.branchId ?? e.branchId) === f.branchId) && (!f.centreId || l.centreId === f.centreId);

/**
 * التدفقات النقدية (الطريقة المباشرة): every entry that touches a till or a bank is explained by its other lines, each
 * under the cash-flow heading of its account. Money moving between two tills is no flow at all.
 */
export function cashFlow(accounts: FinAccount[], entries: FinEntry[], f: BalanceFilter) {
  const byId = new Map(accounts.map((a) => [a.id, a]));
  const isMoney = (id: string) => MONEY_KINDS.includes(byId.get(id)?.kind ?? "general");
  const flows = new Map<string, Units>();
  let opening = 0, change = 0;
  for (const e of entries) {
    if (e.status !== "posted" || (f.to && e.date > f.to)) continue;
    const cash = e.lines.filter((l) => isMoney(l.account) && inFilter(e, l, f)).reduce((s, l) => s + l.debit - l.credit, 0);
    if (f.from && e.date < f.from) { opening += cash; continue; }
    if (!e.lines.some((l) => isMoney(l.account))) continue;
    change += cash;
    for (const l of e.lines) if (!isMoney(l.account) && inFilter(e, l, f)) flows.set(l.account, (flows.get(l.account) ?? 0) - (l.debit - l.credit));
  }
  const groups = { operating: [] as StRow[], investing: [] as StRow[], financing: [] as StRow[] };
  const totals = { operating: 0, investing: 0, financing: 0 };
  for (const [id, v] of flows) {
    const a = byId.get(id);
    if (!a || !v) continue;
    const g = a.cashflow ?? "operating";
    groups[g].push({ id, label: a.name.ar, code: a.code, level: 1, kind: "account", values: [v], accountId: id, postable: true });
    totals[g] += v;
  }
  const order = (r: StRow[]) => r.sort((x, y) => (x.code ?? "").localeCompare(y.code ?? ""));
  const rows: StRow[] = [
    sumRow("open", "رصيد النقدية أول الفترة", [opening]),
    head("h-op", "أنشطة التشغيل", 1), ...order(groups.operating), sumRow("t-op", "صافي التدفق من التشغيل", [totals.operating]),
    head("h-in", "أنشطة الاستثمار", 1), ...order(groups.investing), sumRow("t-in", "صافي التدفق من الاستثمار", [totals.investing]),
    head("h-fi", "أنشطة التمويل", 1), ...order(groups.financing), sumRow("t-fi", "صافي التدفق من التمويل", [totals.financing]),
    sumRow("chg", "صافي التغير في النقدية", [change]),
    sumRow("close", "رصيد النقدية آخر الفترة", [opening + change]),
  ];
  // what the other lines explain must be the change in cash; a filter by branch can leave a remainder (the other side sits in another branch)
  return { rows, opening, change, closing: opening + change, ...totals, unexplained: change - (totals.operating + totals.investing + totals.financing) };
}

/** حركة الخزائن والبنوك: one row per day with what came in, what went out and the balance at the end of the day. */
export function cashMovement(accountIds: string[], entries: FinEntry[], f: BalanceFilter) {
  const ids = new Set(accountIds);
  let opening = 0;
  const days = new Map<string, { in: Units; out: Units }>();
  for (const e of entries) {
    if (e.status !== "posted" || (f.to && e.date > f.to)) continue;
    for (const l of e.lines) {
      if (!ids.has(l.account) || !inFilter(e, l, f)) continue;
      if (f.from && e.date < f.from) { opening += l.debit - l.credit; continue; }
      const d = days.get(e.date) ?? days.set(e.date, { in: 0, out: 0 }).get(e.date)!;
      d.in += l.debit;
      d.out += l.credit;
    }
  }
  let bal = opening;
  const rows = [...days].sort(([a], [b]) => a.localeCompare(b)).map(([date, d]) => { const open = bal; bal += d.in - d.out; return { date, opening: open, in: d.in, out: d.out, closing: bal }; });
  return { opening, rows, closing: bal, in: rows.reduce((s, r) => s + r.in, 0), out: rows.reduce((s, r) => s + r.out, 0) };
}

/* ───────── مؤشرات المطعم ───────── */

export interface Kpis {
  sales: Units; cogs: Units; gross: Units; expenses: Units; net: Units;
  /** basis points of sales; null when there are no sales */
  foodCostBp: number | null; payrollBp: number | null; rentBp: number | null; wasteBp: number | null; grossBp: number | null; netBp: number | null;
  waste: Units; payroll: Units; rent: Units;
  cash: Units; payables: Units; stock: Units;
  /** المبيعات الشهرية اللازمة لتغطية المصروفات؛ null without a gross margin */
  breakEven: Units | null;
}
export function kpis(accounts: FinAccount[], entries: FinEntry[], settings: Pick<FinSettingsData, "links">, f: BalanceFilter): Kpis {
  const pl = incomeStatement(accounts, entries, [f], 1);
  const net = netByCode(accounts, beforeClosing(entries), f);
  const at = netByCode(accounts, entries, { to: f.to, branchId: f.branchId });
  const ix = indexChart(accounts);
  const code = (key: string) => settings.links[key] ?? "";
  const of = (key: string, m = net) => m.get(code(key)) ?? 0;
  const sales = pl.revenue[0], cogs = pl.cogs[0], gross = pl.gross[0], expenses = pl.expenses[0];
  const bp = (v: Units) => (sales > 0 ? Math.round((v / sales) * 10_000) : null);
  // payroll = the group the salaries account sits in (رواتب وأجور)
  const salaries = ix.byCode.get(code("salaries"));
  const payroll = salaries?.parentCode ? net.get(salaries.parentCode) ?? 0 : of("salaries");
  const waste = of("waste.mfg") + of("waste.store") + of("count.loss");
  const money = accounts.filter((a) => a.postable && MONEY_KINDS.includes(a.kind)).reduce((s, a) => s + (at.get(a.code) ?? 0), 0);
  const months = f.from && f.to ? Math.max(1, Math.round((Date.parse(f.to) - Date.parse(f.from)) / (30.4 * 86_400_000))) : 1;
  return {
    sales, cogs, gross, expenses, net: pl.net[0], waste, payroll, rent: of("exp.rent"),
    foodCostBp: bp(cogs), payrollBp: bp(payroll), rentBp: bp(of("exp.rent")), wasteBp: bp(waste), grossBp: bp(gross), netBp: bp(pl.net[0]),
    cash: money, payables: -(at.get(code("suppliers")) ?? 0) - (at.get(code("purchases.accrued")) ?? 0),
    stock: ["stock.raw", "stock.product", "stock.packaging", "stock.supplies"].reduce((s, k) => s + of(k, at), 0),
    breakEven: sales > 0 && gross > 0 ? Math.round(expenses / months / (gross / sales)) : null,
  };
}

/* ───────── توزيع المصروفات ───────── */

/** Splits `amount` by weights; the last share takes what rounding left. Zero weights get nothing. */
export function split(amount: Units, weights: Record<string, number>): Record<string, Units> {
  const keys = Object.keys(weights).filter((k) => weights[k] > 0);
  const sum = keys.reduce((s, k) => s + weights[k], 0);
  const out: Record<string, Units> = {};
  let given = 0;
  keys.forEach((k, i) => { const v = i === keys.length - 1 ? amount - given : Math.round((amount * weights[k]) / sum); out[k] = v; given += v; });
  return out;
}
/** Moves an expense from where it was booked to the branches (or cost centres) that share it. */
export function allocationLines(accountId: string, amount: Units, from: { branchId?: string | null; centreId?: string | null }, weights: Record<string, number>, by: "branch" | "centre"): FinLine[] {
  const shares = split(amount, weights);
  return [
    ...Object.entries(shares).filter(([, v]) => v).map(([k, v]) => ({ account: accountId, debit: v, credit: 0, ...(by === "branch" ? { branchId: k } : { centreId: k, branchId: from.branchId ?? null }) })),
    { account: accountId, debit: 0, credit: amount, branchId: from.branchId ?? null, ...(from.centreId ? { centreId: from.centreId } : {}) },
  ];
}
/** مبيعات كل فرع في الفترة: the weights of a split by sales. */
export function salesByBranch(accounts: FinAccount[], entries: FinEntry[], f: BalanceFilter, branchIds: string[]): Record<string, number> {
  return Object.fromEntries(branchIds.map((b) => [b, Math.max(0, incomeStatement(accounts, entries, [{ ...f, branchId: b }], 1).revenue[0])]));
}
/** The expense lines booked on one branch in a period, summed per account: what the central kitchen cost. */
export function expensesOfBranch(accounts: FinAccount[], entries: FinEntry[], f: BalanceFilter & { branchId: string }): { account: FinAccount; amount: Units }[] {
  const own = movement(entries, f);
  return accounts.filter((a) => a.postable && a.type === "expense").map((a) => ({ account: a, amount: (own.get(a.id)?.debit ?? 0) - (own.get(a.id)?.credit ?? 0) })).filter((x) => x.amount > 0);
}
