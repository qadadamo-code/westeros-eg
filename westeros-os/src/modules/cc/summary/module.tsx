import { lazy } from "react";
import { BarChart3 } from "lucide-react";
import { defineModule } from "../../types";

/** Cost Control, section 1: الملخص. Open to everyone who signs in, so every role has a first screen. */
export default defineModule({
  id: "cc-summary",
  status: "ready",
  icon: BarChart3,
  title: { ar: "الملخص", en: "Summary" },
  description: { ar: "انجاز الانتاج، انجاز الشيفات، كميات مخزن المنتجات", en: "Production achieved, chefs' output, product stock" },
  nav: { path: "/summary", group: "service", order: 1, mobile: true },
  routes: [{ path: "/summary", element: lazy(() => import("./SummaryPage")) }],
});
