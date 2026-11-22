import { lazy } from "react";
import { Factory } from "lucide-react";
import { defineModule } from "../../types";

/** Cost Control, section 5: التصنيع. */
export default defineModule({
  id: "cc-mfg",
  status: "ready",
  icon: Factory,
  title: { ar: "التصنيع", en: "Manufacturing" },
  description: { ar: "تصنيع صنف، الوصفات، سجل التشغيلات، المنتجات المصنعة، أصناف البيع، الملخص", en: "Batches, recipes, runs log, manufactured products, sale items, summary" },
  permission: "production.view",
  homeFor: ["chef", "kitchen"],
  nav: { path: "/manufacturing", group: "service", order: 5, mobile: true },
  routes: [{ path: "/manufacturing/*", element: lazy(() => import("./MfgPage")) }],
});
