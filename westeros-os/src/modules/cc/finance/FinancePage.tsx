/** الحسابات: the chart of accounts and, around it, the journal, the reports and the settings. */
import { Link, Navigate, NavLink, Route, Routes, useLocation } from "react-router-dom";
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
import { AreaGate } from "../useAccess";
import { useFinSections, type FinPage as Page, type FinSection as Group } from "./sections";
import { BuyingSummary, GeneralSummary, SellingSummary, StaffSummary } from "./Summaries";
import Reports, { ReportRedirect } from "./Reports";
import Sales from "./Sales";
import { SalesChannels } from "./SalesChannels";
import Settings from "./Settings";
import Tax from "./Tax";
import Treasury from "./Treasury";
import Customers from "./Customers";
import PosAudit from "./PosAudit";
import StaffMoves from "./StaffMoves";
import { useAutoRates } from "./useRates";
import { useFinance } from "./useFinance";
import { useDb } from "@/data/hooks";

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
  const { pathname } = useLocation();
  const fin = useFinance();
  useAutoRates(useDb(), fin.settings, !fin.loading);
  // the pages this employee may see (المستخدمين ← الأدوار), and the sections left with a page
  const groups = useFinSections();
  const first = groups[0]?.pages[0]?.to ?? null;
  const gate = (area: string, el: JSX.Element) => <AreaGate id={area} fallback={first}>{el}</AreaGate>;
  const at = (p: Page) => (p.end ? pathname.replace(/\/$/, "") === p.to : pathname === p.to || pathname.startsWith(`${p.to}/`));
  if (!groups.length) return <AreaGate id="finance.dashboard">{null}</AreaGate>;
  const current = groups.find((g) => g.pages.some(at)) ?? groups[0];
  const page = current.pages.find(at) ?? current.pages[0];
  return (
    <div className="grid gap-5">
      <PageHeader icon={page.label === "ملخص" ? current.icon : page.icon} kicker={current.id === "home" ? undefined : `الحسابات · ${current.label}`} title={current.id === "home" ? "الحسابات" : page.label === "ملخص" ? `ملخص ${current.label}` : page.label} />
      <FinNav groups={groups} current={current} />
      <Routes>
        <Route index element={gate("finance.dashboard", <Dashboard />)} />
        <Route path="chart" element={gate("finance.chart", <Chart />)} />
        <Route path="journal" element={gate("finance.journal", <Journal />)} />
        <Route path="general" element={gate("finance.chart", <GeneralSummary />)} />
        <Route path="buying" element={gate("finance.purchases", <BuyingSummary />)} />
        <Route path="selling" element={gate("finance.sales", <SellingSummary />)} />
        <Route path="staff" element={gate("finance.payroll", <StaffSummary />)} />
        <Route path="treasury" element={gate("finance.treasury", <Treasury key="t" />)} />
        <Route path="vouchers" element={gate("finance.treasury", <Treasury key="v" start="vouchers" />)} />
        <Route path="expenses" element={gate("finance.treasury", <Treasury key="e" start="vouchers" kind="expense" />)} />
        <Route path="sales" element={gate("finance.sales", <Sales />)} />
        <Route path="channels" element={gate("finance.sales", <SalesChannels can={perms.has("vouchers") || perms.has("settings")} />)} />
        <Route path="purchases" element={gate("finance.purchases", <Purchases />)} />
        <Route path="customers" element={gate("finance.sales", <Customers />)} />
        <Route path="pos-audit" element={gate("finance.sales", <PosAudit />)} />
        <Route path="staff-moves" element={gate("finance.payroll", <StaffMoves />)} />
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
