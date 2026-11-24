/** 2- المخازن والفروع: warehouses, branches, raw materials, movements, count, supply and purchase requests, and their summary. */
import { Navigate, Route, Routes } from "react-router-dom";
import { ArrowLeftRight, BarChart3, Boxes, Building2, ClipboardCheck, ShoppingCart, Truck, Warehouse } from "lucide-react";
import { PageHeader } from "@/shell/PageHeader";
import { ViewBranchPicker } from "@/shell/ViewBranchPicker";
import { AreaGate, useTabs } from "../useAccess";
import { RouteTabs } from "@/modules/marketing/ui";
import Branches from "./Branches";
import Warehouses from "./Warehouses";
import Moves from "./Moves";
import Counts from "./Counts";
import Requests from "./Requests";
import Purchases from "./Purchases";
import { useStoreTabCounts } from "./SupplyAlerts";
import RawMaterials from "../catalog/RawMaterials";
import StoresSummary from "./StoresSummary";

export default function StoresPage() {
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
  return (
    <div className="grid gap-5">
      <PageHeader icon={<Warehouse />} title="المخازن والفروع" actions={<ViewBranchPicker />} />
      <RouteTabs
        label="المخازن والفروع"
        items={tabs}
      />
      <Routes>
        <Route index element={<AreaGate id="stores.warehouses" fallback={first}><Warehouses /></AreaGate>} />
        <Route path="moves" element={<AreaGate id="stores.moves" fallback={first}><Moves /></AreaGate>} />
        <Route path="count" element={<AreaGate id="stores.count" fallback={first}><Counts /></AreaGate>} />
        <Route path="raws" element={<AreaGate id="catalog.raws" fallback={first}><RawMaterials /></AreaGate>} />
        <Route path="summary" element={<AreaGate id="stores.summary" fallback={first}><StoresSummary /></AreaGate>} />
        <Route path="branches" element={<AreaGate id="stores.branches" fallback={first}><Branches /></AreaGate>} />
        <Route path="supply" element={<AreaGate id="stores.supply" fallback={first}><Requests /></AreaGate>} />
        <Route path="purchase" element={<AreaGate id="stores.purchase" fallback={first}><Purchases /></AreaGate>} />
        <Route path="*" element={<Navigate to="/stores" replace />} />
      </Routes>
    </div>
  );
}
