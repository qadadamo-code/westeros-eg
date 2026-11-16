import { lazy } from "react";
import { Warehouse } from "lucide-react";
import { defineModule } from "../../types";

/** Cost Control, section 2: المخازن. */
export default defineModule({
  id: "cc-stores",
  status: "ready",
  icon: Warehouse,
  title: { ar: "المخازن", en: "Warehouses" },
  description: { ar: "المخازن، الحركات المخزنية، جرد المخزن، طلب شراء، طلب توريد للفرع", en: "Warehouses, stock movements, stock count, purchase and branch supply requests" },
  permission: "inventory.view",
  nav: { path: "/stores", group: "service", order: 2, mobile: true },
  routes: [{ path: "/stores/*", element: lazy(() => import("./StoresPage")) }],
});
