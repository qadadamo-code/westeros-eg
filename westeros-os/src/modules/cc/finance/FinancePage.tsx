/** الحسابات: the chart of accounts and, around it, the journal, the reports and the settings. */
import { Navigate, Route, Routes } from "react-router-dom";
import { Landmark, ListTree } from "lucide-react";
import { PageHeader } from "@/shell/PageHeader";
import { RouteTabs } from "@/modules/marketing/ui";
import Chart from "./Chart";

export default function FinancePage() {
  return (
    <div className="grid gap-5">
      <PageHeader icon={<Landmark />} title="الحسابات" />
      <RouteTabs label="الحسابات" items={[{ to: "/finance", end: true, label: "شجرة الحسابات", icon: <ListTree /> }]} />
      <Routes>
        <Route index element={<Chart />} />
        <Route path="*" element={<Navigate to="/finance" replace />} />
      </Routes>
    </div>
  );
}
