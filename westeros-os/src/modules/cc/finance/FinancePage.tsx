/** الحسابات: the chart of accounts and, around it, the journal, the reports and the settings. */
import { Navigate, Route, Routes } from "react-router-dom";
import { Armchair, Banknote, BookOpen, FileBarChart, Flag, Gauge, HandCoins, Landmark, ListTree, Lock, Percent, PiggyBank, ReceiptText, Settings as Cog, Target, Truck } from "lucide-react";
import { PageHeader } from "@/shell/PageHeader";
import { RouteTabs } from "@/modules/marketing/ui";
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
import Reports, { ReportRedirect } from "./Reports";
import Sales from "./Sales";
import Settings from "./Settings";
import Tax from "./Tax";
import Treasury from "./Treasury";

export default function FinancePage() {
  const perms = useFinPerms();
  const reports = perms.has("reports");
  return (
    <div className="grid gap-5">
      <PageHeader icon={<Landmark />} title="الحسابات" />
      <RouteTabs label="الحسابات" items={[
        { to: "/finance", end: true, label: "المؤشرات", icon: <Gauge /> },
        { to: "/finance/chart", label: "شجرة الحسابات", icon: <ListTree /> },
        { to: "/finance/journal", label: "القيود اليومية", icon: <BookOpen /> },
        { to: "/finance/treasury", label: "الخزينة والبنوك", icon: <Banknote /> },
        { to: "/finance/sales", label: "المبيعات", icon: <ReceiptText /> },
        { to: "/finance/purchases", label: "المشتريات والموردون", icon: <Truck /> },
        { to: "/finance/payroll", label: "الرواتب", icon: <HandCoins /> },
        { to: "/finance/assets", label: "الأصول الثابتة", icon: <Armchair /> },
        ...(reports ? [{ to: "/finance/reports", label: "التقارير", icon: <FileBarChart /> }] : []),
        ...(reports ? [{ to: "/finance/tax", label: "الضرائب", icon: <Percent /> }] : []),
        { to: "/finance/centres", label: "مراكز التكلفة", icon: <Target /> },
        ...(perms.has("budget") || perms.has("profit") ? [{ to: "/finance/budget", label: "الموازنة", icon: <PiggyBank /> }] : []),
        { to: "/finance/close", label: "الإقفال", icon: <Lock /> },
        { to: "/finance/opening", label: "الأرصدة الافتتاحية", icon: <Flag /> },
        { to: "/finance/settings", label: "الإعدادات وربط الحسابات", icon: <Cog /> },
      ]} />
      <Routes>
        <Route index element={<Dashboard />} />
        <Route path="chart" element={<Chart />} />
        <Route path="journal" element={<Journal />} />
        <Route path="treasury" element={<Treasury />} />
        <Route path="sales" element={<Sales />} />
        <Route path="purchases" element={<Purchases />} />
        <Route path="payroll" element={<Payroll />} />
        {reports ? <Route path="tax" element={<Tax />} /> : null}
        <Route path="assets" element={<Assets />} />
        {reports ? <Route path="reports/*" element={<Reports />} /> : null}
        <Route path="centres" element={<Centres />} />
        {perms.has("budget") || perms.has("profit") ? <Route path="budget" element={<Budget />} /> : null}
        <Route path="close" element={<Close />} />
        <Route path="opening" element={<Opening />} />
        <Route path="settings" element={<Settings />} />
        {["ledger", "trial", "stock"].map((r) => <Route key={r} path={r} element={<ReportRedirect to={r} />} />)}
        <Route path="*" element={<Navigate to="/finance" replace />} />
      </Routes>
    </div>
  );
}
