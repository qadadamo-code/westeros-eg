/** 2- المخازن والفروع: branches, warehouses, movements, count, supply and purchase requests. */
import { Navigate, Route, Routes } from "react-router-dom";
import { ArrowLeftRight, Building2, ClipboardCheck, ShoppingCart, Truck, Warehouse } from "lucide-react";
import { PageHeader } from "@/shell/PageHeader";
import { AreaGate, useTabs } from "../useAccess";
import { RouteTabs } from "@/modules/marketing/ui";
import Branches from "./Branches";
import Warehouses from "./Warehouses";
import Moves from "./Moves";
import Counts from "./Counts";
import Requests from "./Requests";
import Purchases from "./Purchases";
import { useStoreTabCounts } from "./SupplyAlerts";

export default function StoresPage() {
  // the menu count, split over the tabs it waits in
  const counts = useStoreTabCounts();
  // the tabs this employee may see (المستخدمين ← الأدوار)
  const { tabs, first } = useTabs([
          { to: "/stores", end: true, label: "المخازن", icon: <Warehouse />, area: "stores.warehouses" },
          { to: "/stores/branches", label: "الفروع", icon: <Building2 />, area: "stores.branches" },
          { to: "/stores/moves", label: "الحركات المخزنية", icon: <ArrowLeftRight />, area: "stores.moves" },
          { to: "/stores/count", label: "جرد المخزن", icon: <ClipboardCheck />, area: "stores.count" },
          { to: "/stores/supply", label: "طلب توريد", icon: <Truck />, count: counts.supply, area: "stores.supply" },
          { to: "/stores/purchase", label: "طلب شراء", icon: <ShoppingCart />, count: counts.purchase, area: "stores.purchase" },
        ]);
  return (
    <div className="grid gap-5">
      <PageHeader icon={<Warehouse />} title="المخازن والفروع" />
      <RouteTabs
        label="المخازن والفروع"
        items={tabs}
      />
      <Routes>
        <Route index element={<AreaGate id="stores.warehouses" fallback={first}><Warehouses /></AreaGate>} />
        <Route path="moves" element={<AreaGate id="stores.moves" fallback={first}><Moves /></AreaGate>} />
        <Route path="count" element={<AreaGate id="stores.count" fallback={first}><Counts /></AreaGate>} />
        <Route path="branches" element={<AreaGate id="stores.branches" fallback={first}><Branches /></AreaGate>} />
        <Route path="supply" element={<AreaGate id="stores.supply" fallback={first}><Requests /></AreaGate>} />
        <Route path="purchase" element={<AreaGate id="stores.purchase" fallback={first}><Purchases /></AreaGate>} />
        <Route path="*" element={<Navigate to="/stores" replace />} />
      </Routes>
    </div>
  );
}
