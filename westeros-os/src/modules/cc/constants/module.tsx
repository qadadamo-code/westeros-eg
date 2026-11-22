import { lazy } from "react";
import { Settings2 } from "lucide-react";
import { defineModule } from "../../types";

/** Cost Control, section 4: ثوابت النظام. */
export default defineModule({
  id: "cc-constants",
  status: "ready",
  icon: Settings2,
  title: { ar: "ثوابت النظام", en: "System constants" },
  description: { ar: "الوحدات والفئات وأنواع المخازن والبرجر واللحوم وأسماء الوصفات", en: "Units, categories, warehouse and burger types, meats and recipe names" },
  permission: "production.manage",
  nav: { path: "/constants", group: "service", order: 4 },
  routes: [{ path: "/constants/*", element: lazy(() => import("./ConstantsPage")) }],
});
