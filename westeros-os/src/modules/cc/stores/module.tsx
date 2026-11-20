import { lazy } from "react";
import { Warehouse } from "lucide-react";
import { defineModule } from "../../types";
import { useSupplyBadge } from "./SupplyAlerts";

/** Cost Control, section 2: المخازن والفروع. */
export default defineModule({
  id: "cc-stores",
  status: "ready",
  icon: Warehouse,
  title: { ar: "المخازن والفروع", en: "Warehouses and branches" },
  description: { ar: "المخازن، الفروع، الحركات المخزنية، جرد المخزن، طلب توريد", en: "Warehouses, stock movements, stock count, supply requests" },
  permission: "inventory.view",
  nav: { path: "/stores", group: "service", order: 2, mobile: true, useBadge: useSupplyBadge },
  routes: [{ path: "/stores/*", element: lazy(() => import("./StoresPage")) }],
});
