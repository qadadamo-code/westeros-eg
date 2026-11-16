import { lazy } from "react";
import { ListChecks } from "lucide-react";
import { defineModule } from "../../types";

/** Cost Control, section 3: قائمة المنتجات والخامات. */
export default defineModule({
  id: "cc-catalog",
  status: "ready",
  icon: ListChecks,
  title: { ar: "قائمة المنتجات والخامات", en: "Products & raw materials" },
  description: { ar: "مواد الخام، المنتجات المصنعة، أصناف البيع", en: "Raw materials, manufactured products, sale items" },
  permission: "inventory.view",
  nav: { path: "/catalog", group: "service", order: 3 },
  routes: [{ path: "/catalog/*", element: lazy(() => import("./CatalogPage")) }],
});
