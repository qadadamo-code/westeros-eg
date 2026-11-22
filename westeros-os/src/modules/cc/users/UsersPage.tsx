/** المستخدمين: two tabs, the employees (المستخدمين) and the roles with their permissions (الأدوار). */
import { Link, Navigate, Route, Routes } from "react-router-dom";
import { BarChart3, History, ShieldCheck, Users } from "lucide-react";
import { PageHeader } from "@/shell/PageHeader";
import { AreaGate, useTabs } from "../useAccess";
import { RouteTabs } from "@/modules/marketing/ui";
import UsersList from "./UsersList";
import Roles from "./Roles";
import UsersSummary from "./UsersSummary";

export default function UsersPage() {
  // the tabs this employee may see (المستخدمين ← الأدوار)
  const { tabs, first } = useTabs([
          { to: "/users", end: true, label: "المستخدمين", icon: <Users />, area: "users.list" },
          { to: "/users/roles", label: "الأدوار", icon: <ShieldCheck />, area: "users.roles" },
          { to: "/users/summary", label: "الملخص", icon: <BarChart3 />, area: "users.summary" },
        ]);
  return (
    <div className="grid gap-5">
      <PageHeader icon={<Users />} title="المستخدمين"
        actions={<Link to="/settings/history" className="inline-flex h-11 items-center gap-2 rounded-xl border border-line px-4 text-[15px] font-semibold hover:bg-surface-2"><History className="size-4" />السجل والاسترجاع</Link>} />
      <RouteTabs
        label="المستخدمين"
        items={tabs}
      />
      <Routes>
        <Route index element={<AreaGate id="users.list" fallback={first}><UsersList /></AreaGate>} />
        <Route path="roles" element={<AreaGate id="users.roles" fallback={first}><Roles /></AreaGate>} />
        <Route path="summary" element={<AreaGate id="users.summary" fallback={first}><UsersSummary /></AreaGate>} />
        <Route path="*" element={<Navigate to="/users" replace />} />
      </Routes>
    </div>
  );
}
