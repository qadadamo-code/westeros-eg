import { lazy } from "react";
import { Users } from "lucide-react";
import { defineModule } from "../../types";

/** المستخدمين: the list the document refers to for the chef of a batch and the keeper of a warehouse. */
export default defineModule({
  id: "cc-users",
  status: "ready",
  icon: Users,
  title: { ar: "المستخدمين", en: "Users" },
  description: { ar: "الموظفين والأدوار والصلاحيات", en: "Employees, roles and permissions" },
  permission: "staff.manage",
  nav: { path: "/users", group: "admin", order: 10 },
  routes: [
    { path: "/users/*", element: lazy(() => import("./UsersPage")) },
    { path: "/settings/history", element: lazy(() => import("@/modules/settings/history/HistoryPage")), permission: "settings.view" },
  ],
});
