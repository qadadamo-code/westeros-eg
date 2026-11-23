/** الحسابات: the chart of accounts and, around it, the journal, the reports and the settings. */
import { Link, Navigate, NavLink, Route, Routes, useLocation } from "react-router-dom";
import { Armchair, Banknote, BookOpen, FileBarChart, Flag, Gauge, HandCoins, ListTree, Lock, Percent, PiggyBank, ReceiptText, Settings as Cog, SlidersHorizontal, Target, Truck } from "lucide-react";
import { PageHeader } from "@/shell/PageHeader";
import { cn } from "@/lib/cn";
import Assets from "./Assets";
import Budget from "./Budget";
import Centres from "./Centres";
import Chart from "./Chart";
import Close from "./Close";
import Dashboard from "./Dashboard";
import Journal from "./Journal";
import Opening from "./Opening";
import Payroll from "./Payroll";
import Purchases from "./Purchases";
import { useFinPerms } from "./perms";
import { AreaGate, useMay } from "../useAccess";
import Reports, { ReportRedirect } from "./Reports";
import Sales from "./Sales";
import Settings from "./Settings";
import Tax from "./Tax";
import Treasury from "./Treasury";
import { useAutoRates } from "./useRates";
import { useFinance } from "./useFinance";
import { useDb } from "@/data/hooks";

interface Page { to: string; label: string; icon: JSX.Element; end?: boolean; area: string }
interface Group { id: string; label: string; short?: string; icon: JSX.Element; pages: Page[] }

/**
 * التنقل داخل الحسابات: five sections that always fit on one row, and under them the pages of the open section.
 * Nothing scrolls sideways and nothing hides, on a phone or a wide screen.
 */
function FinNav({ groups, current }: { groups: Group[]; current: Group }) {
  return (
    <div className="grid gap-3">
      <nav aria-label="أقسام الحسابات" className="grid auto-cols-fr grid-flow-col gap-1 rounded-2xl border border-line bg-surface-2 p-1">
        {groups.map((g) => {
          const on = g.id === current.id;
          return (
            <Link key={g.id} to={g.pages[0].to} aria-current={on ? "true" : undefined}
              className={cn("flex min-w-0 flex-col items-center justify-center gap-1 rounded-xl px-1 py-2 text-[12px] font-semibold transition-colors sm:flex-row sm:gap-2 sm:py-2.5 sm:text-[14.5px] [&_svg]:size-[18px] [&_svg]:shrink-0",
                on ? "bg-surface text-ink shadow-sf-sm ring-1 ring-line [&_svg]:text-brass-text" : "text-muted hover:text-ink")}>
              {g.icon}<span className={cn("max-w-full truncate", g.short && "max-sm:hidden")}>{g.label}</span>{g.short ? <span className="max-w-full truncate sm:hidden">{g.short}</span> : null}
            </Link>
          );
        })}
      </nav>
      {current.pages.length > 1 ? (
        <nav aria-label={current.label} className="flex flex-wrap gap-2">
          {current.pages.map((p) => (
            <NavLink key={p.to} to={p.to} end={p.end}
              className={({ isActive }) => cn("inline-flex h-9 items-center gap-2 rounded-full border px-3 text-[13px] font-semibold transition-colors max-sm:[&_svg]:hidden sm:h-10 sm:px-4 sm:text-[14px] [&_svg]:size-4",
                isActive ? "border-ink bg-ink text-surface" : "border-line bg-surface text-ink-2 hover:border-line-strong hover:text-ink")}>
              {p.icon}{p.label}
            </NavLink>
          ))}
        </nav>
      ) : null}
    </div>
  );
}

export default function FinancePage() {
  const perms = useFinPerms();
  const reports = perms.has("reports");
  const budget = perms.has("budget") || perms.has("profit");
  const { pathname } = useLocation();
  const may = useMay();
  const fin = useFinance();
  useAutoRates(useDb(), fin.settings, !fin.loading);
  const all: Group[] = [
    { id: "home", label: "المؤشرات", icon: <Gauge />, pages: [{ to: "/finance", end: true, label: "المؤشرات", icon: <Gauge />, area: "finance.dashboard" }] },
    { id: "books", label: "الدفاتر", icon: <BookOpen />, pages: [
      { to: "/finance/chart", label: "شجرة الحسابات", icon: <ListTree />, area: "finance.chart" },
      { to: "/finance/journal", label: "القيود اليومية", icon: <BookOpen />, area: "finance.journal" },
      { to: "/finance/opening", label: "الأرصدة الافتتاحية", icon: <Flag />, area: "finance.opening" },
      { to: "/finance/centres", label: "مراكز التكلفة", icon: <Target />, area: "finance.centres" },
    ] },
    { id: "ops", label: "العمليات", icon: <Banknote />, pages: [
      { to: "/finance/treasury", label: "الخزينة والبنوك", icon: <Banknote />, area: "finance.treasury" },
      { to: "/finance/sales", label: "المبيعات", icon: <ReceiptText />, area: "finance.sales" },
      { to: "/finance/purchases", label: "المشتريات والموردون", icon: <Truck />, area: "finance.purchases" },
      { to: "/finance/payroll", label: "الرواتب", icon: <HandCoins />, area: "finance.payroll" },
      { to: "/finance/assets", label: "الأصول الثابتة", icon: <Armchair />, area: "finance.assets" },
    ] },
    ...(reports || budget ? [{ id: "reports", label: "التقارير", icon: <FileBarChart />, pages: [
      ...(reports ? [{ to: "/finance/reports", label: "التقارير المالية", icon: <FileBarChart />, area: "finance.reports" }, { to: "/finance/tax", label: "الضرائب", icon: <Percent />, area: "finance.tax" }] : []),
      ...(budget ? [{ to: "/finance/budget", label: "الموازنة", icon: <PiggyBank />, area: "finance.budget" }] : []),
    ] }] : []),
    { id: "setup", label: "الإقفال والإعدادات", short: "الإعدادات", icon: <Cog />, pages: [
      { to: "/finance/close", label: "الإقفال", icon: <Lock />, area: "finance.close" },
      { to: "/finance/settings", label: "الإعدادات وربط الحسابات", icon: <SlidersHorizontal />, area: "finance.settings" },
    ] },
  ];
  // the pages this employee may see (المستخدمين ← الأدوار), and the sections left with a page
  const groups = all.map((g) => ({ ...g, pages: g.pages.filter((p) => may(p.area, "view")) })).filter((g) => g.pages.length);
  const first = groups[0]?.pages[0]?.to ?? null;
  const gate = (area: string, el: JSX.Element) => <AreaGate id={area} fallback={first}>{el}</AreaGate>;
  const at = (p: Page) => (p.end ? pathname.replace(/\/$/, "") === p.to : pathname === p.to || pathname.startsWith(`${p.to}/`));
  if (!groups.length) return <AreaGate id="finance.dashboard">{null}</AreaGate>;
  const current = groups.find((g) => g.pages.some(at)) ?? groups[0];
  const page = current.pages.find(at) ?? current.pages[0];
  return (
    <div className="grid gap-5">
      <PageHeader icon={page.icon} kicker={page.label === "المؤشرات" ? undefined : "الحسابات"} title={page.label === "المؤشرات" ? "الحسابات" : page.label} />
      <FinNav groups={groups} current={current} />
      <Routes>
        <Route index element={gate("finance.dashboard", <Dashboard />)} />
        <Route path="chart" element={gate("finance.chart", <Chart />)} />
        <Route path="journal" element={gate("finance.journal", <Journal />)} />
        <Route path="treasury" element={gate("finance.treasury", <Treasury />)} />
        <Route path="sales" element={gate("finance.sales", <Sales />)} />
        <Route path="purchases" element={gate("finance.purchases", <Purchases />)} />
        <Route path="payroll" element={gate("finance.payroll", <Payroll />)} />
        {reports ? <Route path="tax" element={gate("finance.tax", <Tax />)} /> : null}
        <Route path="assets" element={gate("finance.assets", <Assets />)} />
        {reports ? <Route path="reports/*" element={gate("finance.reports", <Reports />)} /> : null}
        <Route path="centres" element={gate("finance.centres", <Centres />)} />
        {perms.has("budget") || perms.has("profit") ? <Route path="budget" element={gate("finance.budget", <Budget />)} /> : null}
        <Route path="close" element={gate("finance.close", <Close />)} />
        <Route path="opening" element={gate("finance.opening", <Opening />)} />
        <Route path="settings" element={gate("finance.settings", <Settings />)} />
        {["ledger", "trial", "stock"].map((r) => <Route key={r} path={r} element={<ReportRedirect to={r} />} />)}
        <Route path="*" element={<Navigate to="/finance" replace />} />
      </Routes>
    </div>
  );
}
