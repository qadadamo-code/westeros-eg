/** 2- المخازن والفروع: warehouses, branches, raw materials, movements, count, supply and purchase requests, and their summary. */
import { Navigate, Route, Routes } from "react-router-dom";
import { Warehouse } from "lucide-react";
import { PageHeader } from "@/shell/PageHeader";
import { ViewBranchPicker } from "@/shell/ViewBranchPicker";
import { AreaGate } from "../useAccess";
import { useStoresTabs } from "./tabs";
import { RouteTabs } from "@/modules/marketing/ui";
import Branches from "./Branches";
import Warehouses from "./Warehouses";
import Moves from "./Moves";
import Counts from "./Counts";
import Requests from "./Requests";
import Purchases from "./Purchases";
import RawMaterials from "../catalog/RawMaterials";
import StoresSummary from "./StoresSummary";

export default function StoresPage() {
  const { tabs, first } = useStoresTabs();
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
