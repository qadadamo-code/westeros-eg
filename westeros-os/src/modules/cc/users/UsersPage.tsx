/** المستخدمين: two tabs, the employees (المستخدمين) and the roles with their permissions (الأدوار). */
import { Link, Navigate, Route, Routes } from "react-router-dom";
import { History, ShieldCheck, Users } from "lucide-react";
import { PageHeader } from "@/shell/PageHeader";
import { RouteTabs } from "@/modules/marketing/ui";
import UsersList from "./UsersList";
import Roles from "./Roles";

export default function UsersPage() {
  return (
    <div className="grid gap-5">
      <PageHeader icon={<Users />} title="المستخدمين"
        actions={<Link to="/settings/history" className="inline-flex h-11 items-center gap-2 rounded-xl border border-line px-4 text-[15px] font-semibold hover:bg-surface-2"><History className="size-4" />السجل والاسترجاع</Link>} />
      <RouteTabs
        label="المستخدمين"
        items={[
          { to: "/users", end: true, label: "المستخدمين", icon: <Users /> },
          { to: "/users/roles", label: "الأدوار", icon: <ShieldCheck /> },
        ]}
      />
      <Routes>
        <Route index element={<UsersList />} />
        <Route path="roles" element={<Roles />} />
        <Route path="*" element={<Navigate to="/users" replace />} />
      </Routes>
    </div>
  );
}
