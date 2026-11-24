/** ملخص كل قسم من أقسام الحسابات: أرقام الفترة، رسم آخر ستة شهور، وأهم التفاصيل، وروابط لصفحات القسم. */
import { useViewBranchState } from "@/auth/viewBranch";
import { useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Banknote, BookOpen, ChevronLeft, CircleDollarSign, Clock, ContactRound, FileWarning, HandCoins, Landmark, Package, Receipt, ReceiptText, Scale, ShoppingCart, TrendingDown, TrendingUp, Truck, Undo2, Users, Wallet } from "lucide-react";
import type { FinDoc } from "@/data/financeTypes";
import { useLive } from "@/data/hooks";
import { cn } from "@/lib/cn";
import { BarChart, Card, StatTile, type Tone } from "@/ui";
import { advanceBalances, EMPLOYEE, employeeOf, PAYROLL, payrollOf } from "./payroll";
import { PURCHASE, PURCHASE_RETURN, purchaseOf, SUPPLIER, supplierBook } from "./purchases";
import { CHANNELS, SALES_DAY, salesOf, waitingAccounts } from "./sales";
import { useFinSections } from "./sections";
import { incomeStatement, kpis, netByCode } from "./statements";
import { addMonths, MONEY_KINDS, monthEnd } from "./treasury";
import { BranchSelect, fmt, GroupTitle, periodLabel, periodOf, PeriodPicker, today, Toolbar, type Period } from "./ui";
import { useFinance, type Fin } from "./useFinance";

interface Tile { label: string; value: string; sub?: string; icon: JSX.Element; tone?: Tone }
type Filter = { from: string | null; to: string | null; branchId: string | null };

const inPeriod = (d: { date: string | null; branchId: string | null }, f: Filter) => !!d.date && (!f.from || d.date >= f.from) && (!f.to || d.date <= f.to) && (!f.branchId || d.branchId === f.branchId);
const live = (d: FinDoc) => d.status !== "cancelled";
const sixMonths = () => { const cur = today().slice(0, 7); return Array.from({ length: 6 }, (_, i) => addMonths(cur, i - 5)); };
const monthLabel = (m: string) => m.split("-").reverse().join("/");

/** the period and branch filters shared by every summary */
export function useFilter(fin: Fin) {
  const [period, setPeriod] = useState<Period>(periodOf("month", fin.settings.yearStartMonth));
  const [branch, setBranch] = useViewBranchState();
  const f = useMemo<Filter>(() => ({ from: period.from, to: period.to, branchId: branch || null }), [period, branch]);
  const bar = (
    <Toolbar note={periodLabel(period)}>
      <PeriodPicker value={period} onChange={setPeriod} startMonth={fin.settings.yearStartMonth} />
      <BranchSelect fin={fin} value={branch} onChange={setBranch} />
    </Toolbar>
  );
  return { f, bar };
}

export function Tiles({ title, tiles }: { title: string; tiles: Tile[] }) {
  return (
    <section className="grid gap-2.5">
      <GroupTitle>{title}</GroupTitle>
      <div className={cn("grid grid-cols-2 gap-3", tiles.length >= 4 ? "lg:grid-cols-4" : tiles.length === 3 ? "lg:grid-cols-3" : "", tiles.length % 2 ? "max-lg:[&>*:last-child]:col-span-2" : "")}>
        {tiles.map((t, i) => <StatTile key={t.label} index={i} label={t.label} value={<span className="num" dir="ltr">{t.value}</span>} sub={t.sub} icon={t.icon} tone={t.tone} />)}
      </div>
    </section>
  );
}

function Bars({ title, rows }: { title: string; rows: { month: string; value: number }[] }) {
  return (
    <Card className="grid content-start gap-3 p-4">
      <h2 className="text-[16px] font-bold">{title}</h2>
      <BarChart ariaLabel={title} highlight={today().slice(0, 7)} data={rows.map((r) => ({ key: r.month, label: monthLabel(r.month), value: r.value / 100000, tip: `${monthLabel(r.month)}: ${fmt(r.value)}` }))} />
    </Card>
  );
}

/** a ranked list with a bar under each row */
function Ranked({ title, rows, empty }: { title: string; rows: { label: string; value: number; sub?: string }[]; empty: string }) {
  const top = Math.max(1, ...rows.map((r) => Math.abs(r.value)));
  return (
    <Card className="grid content-start gap-3 p-4">
      <h2 className="text-[16px] font-bold">{title}</h2>
      {rows.length ? (
        <ul className="grid gap-2.5">
          {rows.map((r) => (
            <li key={r.label} className="grid gap-1">
              <div className="flex items-baseline justify-between gap-3 text-[14px]"><span className="min-w-0 truncate font-semibold">{r.label}{r.sub ? <span className="ms-2 text-[12.5px] font-normal text-muted">{r.sub}</span> : null}</span><span className="num shrink-0 font-bold" dir="ltr">{fmt(r.value)}</span></div>
              <div className="h-1.5 overflow-hidden rounded-full bg-surface-2"><div className="h-full rounded-full bg-brass" style={{ width: `${Math.max(2, (Math.abs(r.value) / top) * 100)}%` }} /></div>
            </li>
          ))}
        </ul>
      ) : <p className="py-6 text-center text-[14px] text-muted">{empty}</p>}
    </Card>
  );
}

/** روابط صفحات القسم */
function Doors({ section }: { section: string }) {
  const g = useFinSections().find((x) => x.id === section);
  const pages = g?.pages.filter((p) => p.label !== "ملخص") ?? [];
  if (!pages.length) return null;
  return (
    <section className="grid gap-2.5">
      <GroupTitle>صفحات القسم</GroupTitle>
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        {pages.map((p) => (
          <Link key={p.to} to={p.to} className="flex min-h-14 items-center gap-3 rounded-2xl border border-line bg-surface px-3 py-2.5 text-[14px] font-semibold text-ink-2 transition-colors hover:border-line-strong hover:text-ink [&>svg:first-child]:size-5 [&>svg:first-child]:shrink-0 [&>svg:first-child]:text-brass-text">
            {p.icon}<span className="min-w-0 flex-1">{p.label}</span><ChevronLeft className="size-4 shrink-0 text-muted rtl:rotate-0 ltr:rotate-180" />
          </Link>
        ))}
      </div>
    </section>
  );
}

function Page({ bar, children, section }: { bar: ReactNode; children: ReactNode; section: string }) {
  return <div className="grid gap-4">{bar}{children}<Doors section={section} /></div>;
}

/* ───────── الحسابات العامة ───────── */

export function GeneralSummary() {
  const fin = useFinance();
  const { f, bar } = useFilter(fin);
  const data = useMemo(() => {
    const at = netByCode(fin.accounts, fin.entries, { to: f.to, branchId: f.branchId });
    const k = kpis(fin.accounts, fin.entries, fin.settings, f);
    const leaf = fin.accounts.filter((a) => a.postable);
    const sumType = (t: string) => leaf.filter((a) => a.type === t).reduce((s, a) => s + (at.get(a.code) ?? 0), 0);
    const assetsFixed = leaf.filter((a) => a.kind === "fixed_asset").reduce((s, a) => s + (at.get(a.code) ?? 0), 0);
    const money = leaf.filter((a) => MONEY_KINDS.includes(a.kind)).map((a) => ({ label: a.name.ar, value: at.get(a.code) ?? 0 })).filter((r) => r.value).sort((a, b) => b.value - a.value);
    const inP = fin.entries.filter((e) => inPeriod(e, f));
    const vouchers = (kind: string) => inP.filter((e) => e.kind === kind && e.status === "posted").reduce((s, e) => s + e.lines.reduce((x, l) => x + l.debit, 0), 0);
    return {
      k, money,
      assets: sumType("asset"), liabilities: -sumType("liability"), equity: -sumType("equity"), assetsFixed,
      posted: inP.filter((e) => e.status === "posted").length, pending: fin.entries.filter((e) => e.status === "pending").length,
      receipts: vouchers("receipt"), payments: vouchers("payment") + vouchers("expense"),
    };
  }, [fin.accounts, fin.entries, fin.settings, f]);
  const months = useMemo(() => sixMonths().map((m) => ({ month: m, value: fin.entries.filter((e) => e.status === "posted" && e.date.startsWith(m) && (!f.branchId || e.branchId === f.branchId)).length * 100000 })), [fin.entries, f.branchId]);
  return (
    <Page bar={bar} section="general">
      <Tiles title="الأرصدة في نهاية الفترة" tiles={[
        { label: "النقدية والبنوك", value: fmt(data.k.cash), icon: <Banknote /> },
        { label: "إجمالي الأصول", value: fmt(data.assets), sub: data.assetsFixed ? `منها أصول ثابتة ${fmt(data.assetsFixed)}` : "", icon: <Landmark />, tone: "info" },
        { label: "الالتزامات", value: fmt(data.liabilities), icon: <Scale />, tone: "warn" },
        { label: "حقوق الملكية", value: fmt(data.equity), icon: <CircleDollarSign />, tone: "ok" },
      ]} />
      <Tiles title="حركة الفترة" tiles={[
        { label: "قيود مرحلة", value: String(data.posted), icon: <BookOpen /> },
        { label: "قيود في انتظار الاعتماد", value: String(data.pending), icon: <Clock />, tone: data.pending ? "warn" : "ok" },
        { label: "سندات القبض", value: fmt(data.receipts), icon: <TrendingUp />, tone: "ok" },
        { label: "سندات الصرف والمصروفات", value: fmt(data.payments), icon: <TrendingDown />, tone: "danger" },
      ]} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Ranked title="أرصدة الخزائن والبنوك" rows={data.money} empty="لا توجد أرصدة في الخزائن والبنوك" />
        <Ranked title="الإيرادات والمصروفات في الفترة" rows={[{ label: "الإيرادات", value: data.k.sales }, { label: "تكلفة المبيعات", value: data.k.cogs }, { label: "المصروفات", value: data.k.expenses }, { label: "صافي الربح", value: data.k.net }].filter((r) => r.value)} empty="لا توجد حركة في الفترة" />
      </div>
      <Card className="grid content-start gap-3 p-4">
        <h2 className="text-[16px] font-bold">عدد القيود آخر ستة شهور</h2>
        <BarChart ariaLabel="عدد القيود آخر ستة شهور" highlight={today().slice(0, 7)} data={months.map((r) => ({ key: r.month, label: monthLabel(r.month), value: r.value / 100000, tip: `${monthLabel(r.month)}: ${r.value / 100000} قيد` }))} />
      </Card>
    </Page>
  );
}

/* ───────── المشتريات والمصاريف ───────── */

export function BuyingSummary() {
  const fin = useFinance();
  const docs = useLive("finDocs").data;
  const { f, bar } = useFilter(fin);
  const data = useMemo(() => {
    const purchases = docs.filter((d) => d.kind === PURCHASE && live(d) && inPeriod(d, f));
    const returns = docs.filter((d) => d.kind === PURCHASE_RETURN && live(d) && inPeriod(d, f));
    const bought = purchases.reduce((s, d) => s + (purchaseOf(d).total ?? 0), 0);
    const back = returns.reduce((s, d) => s + (Number((d.data as { total?: number }).total) || 0), 0);
    const book = supplierBook(docs.filter((d) => d.kind === SUPPLIER), fin.entries, today());
    const owed = book.reduce((s, x) => s + x.open.balance, 0), overdue = book.reduce((s, x) => s + x.overdue, 0);
    const paid = fin.entries.filter((e) => e.status === "posted" && e.kind === "payment" && e.meta?.supplierId && inPeriod(e, f)).reduce((s, e) => s + e.lines.reduce((x, l) => x + l.credit, 0), 0) / 2;
    const bySupplier = new Map<string, number>();
    for (const d of purchases) bySupplier.set(d.name, (bySupplier.get(d.name) ?? 0) + (purchaseOf(d).total ?? 0));
    const net = netByCode(fin.accounts, fin.entries, f);
    const expenses = fin.accounts.filter((a) => a.postable && a.type === "expense").map((a) => ({ label: a.name.ar, value: net.get(a.code) ?? 0 })).filter((r) => r.value > 0).sort((a, b) => b.value - a.value);
    return { bought, back, count: purchases.length, owed, overdue, paid, expenses, totalExp: expenses.reduce((s, r) => s + r.value, 0), top: [...bySupplier].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value).slice(0, 8) };
  }, [docs, fin.entries, fin.accounts, f]);
  const months = useMemo(() => sixMonths().map((m) => ({ month: m, value: docs.filter((d) => d.kind === PURCHASE && live(d) && (d.date ?? "").startsWith(m) && (!f.branchId || d.branchId === f.branchId)).reduce((s, d) => s + (purchaseOf(d).total ?? 0), 0) })), [docs, f.branchId]);
  return (
    <Page bar={bar} section="buying">
      <Tiles title="المشتريات في الفترة" tiles={[
        { label: "فواتير الشراء", value: fmt(data.bought), sub: data.count ? `${data.count} فاتورة` : "", icon: <ShoppingCart /> },
        { label: "المرتجعات", value: fmt(data.back), icon: <Undo2 />, tone: "warn" },
        { label: "المدفوع للموردين", value: fmt(data.paid), icon: <HandCoins />, tone: "ok" },
        { label: "المصروفات", value: fmt(data.totalExp), icon: <Wallet />, tone: "danger" },
      ]} />
      <Tiles title="الموردون اليوم" tiles={[
        { label: "مستحق للموردين", value: fmt(data.owed), icon: <Truck />, tone: "warn" },
        { label: "متأخر عن ميعاده", value: fmt(data.overdue), icon: <FileWarning />, tone: data.overdue ? "danger" : "ok" },
      ]} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Bars title="المشتريات آخر ستة شهور" rows={months} />
        <Ranked title="أكبر الموردين في الفترة" rows={data.top} empty="لا توجد فواتير شراء في الفترة" />
      </div>
      <Ranked title="المصروفات حسب الحساب" rows={data.expenses.slice(0, 10)} empty="لا توجد مصروفات في الفترة" />
    </Page>
  );
}

/* ───────── المبيعات ───────── */

export function SellingSummary() {
  const fin = useFinance();
  const docs = useLive("finDocs").data;
  const customers = useLive("customers").data;
  const { f, bar } = useFilter(fin);
  const data = useMemo(() => {
    const days = docs.filter((d) => d.kind === SALES_DAY && live(d) && inPeriod(d, f)).map(salesOf);
    const k = kpis(fin.accounts, fin.entries, fin.settings, f);
    const orders = days.reduce((s, d) => s + (d.orders || 0), 0);
    const diff = days.reduce((s, d) => s + (d.diff || 0), 0);
    const off = days.reduce((s, d) => s + (d.discounts || 0) + (d.returns || 0), 0);
    const at = netByCode(fin.accounts, fin.entries, { to: f.to, branchId: f.branchId });
    const waiting = waitingAccounts(fin.accounts).map((a) => ({ label: a.name.ar, value: at.get(a.code) ?? 0 })).filter((r) => r.value);
    const net = netByCode(fin.accounts, fin.entries, f);
    const channels = [...CHANNELS.map((c) => ({ label: c.label, key: c.key as string })), { label: "رسوم التوصيل", key: "sales.fees" }].map((c) => ({ label: c.label, value: -(net.get(fin.settings.links[c.key] ?? "") ?? 0) })).filter((r) => r.value);
    return { k, days: days.length, orders, diff, off, waiting, channels };
  }, [docs, fin.accounts, fin.entries, fin.settings, f]);
  const months = useMemo(() => sixMonths().map((m) => ({ month: m, value: incomeStatement(fin.accounts, fin.entries, [{ from: `${m}-01`, to: monthEnd(m), branchId: f.branchId }], 1).revenue[0] })), [fin.accounts, fin.entries, f.branchId]);
  return (
    <Page bar={bar} section="selling">
      <Tiles title="المبيعات في الفترة" tiles={[
        { label: "المبيعات", value: fmt(data.k.sales), sub: data.days ? `${data.days} يوم أو وردية` : "", icon: <TrendingUp /> },
        { label: "متوسط اليوم", value: fmt(data.days ? Math.round(data.k.sales / data.days) : 0), icon: <ReceiptText />, tone: "info" },
        { label: "عدد الطلبات", value: String(data.orders), sub: data.orders ? `متوسط الطلب ${fmt(Math.round(data.k.sales / data.orders))}` : "", icon: <Receipt />, tone: "brass" },
        { label: "الزبائن", value: String(customers.length), icon: <ContactRound />, tone: "ok" },
      ]} />
      <Tiles title="التحصيل" tiles={[
        { label: "تحت التسوية الآن", value: fmt(data.waiting.reduce((s, r) => s + r.value, 0)), icon: <Clock />, tone: "warn" },
        { label: data.diff < 0 ? "عجز التحصيل" : "زيادة التحصيل", value: fmt(Math.abs(data.diff)), icon: <Scale />, tone: data.diff < 0 ? "danger" : "ok" },
        { label: "خصومات ومرتجعات", value: fmt(data.off), icon: <Undo2 />, tone: "danger" },
      ]} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Bars title="المبيعات آخر ستة شهور" rows={months} />
        <Ranked title="المبيعات حسب القناة" rows={data.channels} empty="لا توجد مبيعات في الفترة" />
      </div>
      {data.waiting.length ? <Ranked title="مبالغ تحت التسوية" rows={data.waiting} empty="" /> : null}
    </Page>
  );
}

/* ───────── الموظفين ───────── */

export function StaffSummary() {
  const fin = useFinance();
  const docs = useLive("finDocs").data;
  const { f, bar } = useFilter(fin);
  const data = useMemo(() => {
    const staff = docs.filter((d) => d.kind === EMPLOYEE && (!f.branchId || d.branchId === f.branchId));
    const active = staff.filter((d) => d.status === "active");
    const monthly = active.reduce((s, d) => { const e = employeeOf(d); return s + e.salary + e.allowances; }, 0);
    const runs = docs.filter((d) => d.kind === PAYROLL && live(d)).sort((a, b) => payrollOf(b).month.localeCompare(payrollOf(a).month));
    const last = runs[0] ? payrollOf(runs[0]) : null;
    const adv = advanceBalances(staff, fin.entries);
    const advances = staff.map((d) => ({ label: d.name, value: adv.get(d.id) ?? 0 })).filter((r) => r.value > 0).sort((a, b) => b.value - a.value);
    const k = kpis(fin.accounts, fin.entries, fin.settings, f);
    return { active: active.length, all: staff.length, monthly, last, advances, payroll: k.payroll, unpaid: runs.filter((d) => !payrollOf(d).payEntryId).length };
  }, [docs, fin.accounts, fin.entries, fin.settings, f]);
  const months = useMemo(() => sixMonths().map((m) => ({ month: m, value: docs.filter((d) => d.kind === PAYROLL && live(d) && payrollOf(d).month === m).reduce((s, d) => s + payrollOf(d).net, 0) })), [docs]);
  return (
    <Page bar={bar} section="staff">
      <Tiles title="الموظفين" tiles={[
        { label: "موظفين على رأس العمل", value: String(data.active), sub: data.all > data.active ? `من ${data.all}` : "", icon: <Users /> },
        { label: "الرواتب الشهرية الثابتة", value: fmt(data.monthly), sub: "الأساسي والبدلات", icon: <HandCoins />, tone: "info" },
        { label: "آخر كشف رواتب", value: data.last ? fmt(data.last.net) : "—", sub: data.last ? `شهر ${monthLabel(data.last.month)}${data.unpaid ? ` · ${data.unpaid} كشف لم يصرف` : ""}` : "لا توجد كشوف بعد", icon: <Package />, tone: data.unpaid ? "warn" : "ok" },
        { label: "سلف قائمة", value: fmt(data.advances.reduce((s, r) => s + r.value, 0)), sub: data.advances.length ? `${data.advances.length} موظف` : "", icon: <Wallet />, tone: "warn" },
      ]} />
      <Tiles title="الفترة" tiles={[{ label: "الرواتب والأجور في الحسابات", value: fmt(data.payroll), icon: <Banknote /> }]} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Bars title="صافي الرواتب آخر ستة شهور" rows={months} />
        <Ranked title="أكبر السلف القائمة" rows={data.advances.slice(0, 8)} empty="لا توجد سلف قائمة" />
      </div>
    </Page>
  );
}
