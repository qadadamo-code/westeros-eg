/** الحسابات: the chart of accounts and, around it, the journal, the reports and the settings. */
import { Navigate, Route, Routes } from "react-router-dom";
import { BookOpen, FileText, Flag, Landmark, ListTree, Scale } from "lucide-react";
import { PageHeader } from "@/shell/PageHeader";
import { RouteTabs } from "@/modules/marketing/ui";
import Chart from "./Chart";
import Journal from "./Journal";
import Ledger from "./Ledger";
import Opening from "./Opening";
import TrialBalance from "./TrialBalance";

export default function FinancePage() {
  return (
    <div className="grid gap-5">
      <PageHeader icon={<Landmark />} title="الحسابات" />
      <RouteTabs label="الحسابات" items={[
        { to: "/finance", end: true, label: "شجرة الحسابات", icon: <ListTree /> },
        { to: "/finance/journal", label: "القيود اليومية", icon: <BookOpen /> },
        { to: "/finance/ledger", label: "كشف حساب", icon: <FileText /> },
        { to: "/finance/trial", label: "ميزان المراجعة", icon: <Scale /> },
        { to: "/finance/opening", label: "الأرصدة الافتتاحية", icon: <Flag /> },
      ]} />
      <Routes>
        <Route index element={<Chart />} />
        <Route path="journal" element={<Journal />} />
        <Route path="ledger" element={<Ledger />} />
        <Route path="trial" element={<TrialBalance />} />
        <Route path="opening" element={<Opening />} />
        <Route path="*" element={<Navigate to="/finance" replace />} />
      </Routes>
    </div>
  );
}
