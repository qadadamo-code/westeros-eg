import { lazy } from "react";
import { Landmark } from "lucide-react";
import { defineModule } from "../../types";
import { FINANCE_ON } from "./flag";

/** الحسابات: chart of accounts, journal, treasury, reports and closing, fed automatically by the other sections. */
export default defineModule({
  id: "cc-finance",
  status: "ready",
  hidden: !FINANCE_ON,
  icon: Landmark,
  title: { ar: "الحسابات", en: "Accounts" },
  description: { ar: "شجرة الحسابات، القيود، الخزينة والبنوك، التقارير المالية والإقفال", en: "Chart of accounts, journal, treasury, financial reports and closing" },
  permission: "accounting.view",
  nav: { path: "/finance", group: "service", order: 6 },
  routes: [{ path: "/finance/*", element: lazy(() => import("./FinancePage")) }],
  keywords: ["شجرة الحسابات", "قيد", "قيود", "ميزان", "خزينة", "بنك", "حسابات", "accounts", "journal", "ledger"],
});
