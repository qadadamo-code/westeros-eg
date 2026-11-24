/** the tabs of المخازن والفروع this employee may see; the page and the phone menu both use them */
import { ArrowLeftRight, BarChart3, Boxes, Building2, ClipboardCheck, ShoppingCart, Truck, Warehouse } from "lucide-react";
import { useTabs } from "../useAccess";
import { useStoreTabCounts } from "./SupplyAlerts";

export function useStoresTabs() {
  // the menu count, split over the tabs it waits in
  const counts = useStoreTabCounts();
  // the tabs this employee may see (المستخدمين ← الأدوار)
  const { tabs, first } = useTabs([
          { to: "/stores", end: true, label: "المخازن", icon: <Warehouse />, area: "stores.warehouses" },
          { to: "/stores/branches", label: "الفروع", icon: <Building2 />, area: "stores.branches" },
          { to: "/stores/raws", label: "مواد الخام", icon: <Boxes />, area: "catalog.raws" },
          { to: "/stores/moves", label: "الحركات المخزنية", icon: <ArrowLeftRight />, area: "stores.moves" },
          { to: "/stores/count", label: "جرد المخزن", icon: <ClipboardCheck />, area: "stores.count" },
          { to: "/stores/supply", label: "طلب توريد", icon: <Truck />, count: counts.supply, area: "stores.supply" },
          { to: "/stores/purchase", label: "طلب شراء", icon: <ShoppingCart />, count: counts.purchase, area: "stores.purchase" },
          { to: "/stores/summary", label: "الملخص", icon: <BarChart3 />, area: "stores.summary" },
        ]);
  return { tabs, first };
}
