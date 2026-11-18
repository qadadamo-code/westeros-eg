/** الحسابات: the chart of accounts and, around it, the journal, the reports and the settings. */
import { Navigate, Route, Routes } from "react-router-dom";
import { Banknote, BookOpen, FileBarChart, Flag, Gauge, Landmark, ListTree, Settings as Cog, Target } from "lucide-react";
import { PageHeader } from "@/shell/PageHeader";
import { RouteTabs } from "@/modules/marketing/ui";
import Centres from "./Centres";
import Chart from "./Chart";
import Dashboard from "./Dashboard";
import Journal from "./Journal";
import Opening from "./Opening";
import { useFinPerms } from "./perms";
import Reports, { ReportRedirect } from "./Reports";
import Settings from "./Settings";
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
        ...(reports ? [{ to: "/finance/reports", label: "التقارير", icon: <FileBarChart /> }] : []),
        { to: "/finance/centres", label: "مراكز التكلفة", icon: <Target /> },
        { to: "/finance/opening", label: "الأرصدة الافتتاحية", icon: <Flag /> },
        { to: "/finance/settings", label: "الإعدادات وربط الحسابات", icon: <Cog /> },
      ]} />
      <Routes>
        <Route index element={<Dashboard />} />
        <Route path="chart" element={<Chart />} />
        <Route path="journal" element={<Journal />} />
        <Route path="treasury" element={<Treasury />} />
        {reports ? <Route path="reports/*" element={<Reports />} /> : null}
        <Route path="centres" element={<Centres />} />
        <Route path="opening" element={<Opening />} />
        <Route path="settings" element={<Settings />} />
        {["ledger", "trial", "stock"].map((r) => <Route key={r} path={r} element={<ReportRedirect to={r} />} />)}
        <Route path="*" element={<Navigate to="/finance" replace />} />
      </Routes>
    </div>
  );
}
