/** 2- المخازن والفروع: branches, warehouses, movements, count, supply and purchase requests. */
import { Navigate, Route, Routes } from "react-router-dom";
import { ArrowLeftRight, Building2, ClipboardCheck, ShoppingCart, Truck, Warehouse } from "lucide-react";
import { PageHeader } from "@/shell/PageHeader";
import { RouteTabs } from "@/modules/marketing/ui";
import Branches from "./Branches";
import Warehouses from "./Warehouses";
import Moves from "./Moves";
import Counts from "./Counts";
import Requests from "./Requests";
import Purchases from "./Purchases";

export default function StoresPage() {
  return (
    <div className="grid gap-5">
      <PageHeader icon={<Warehouse />} title="المخازن والفروع" />
      <RouteTabs
        label="المخازن والفروع"
        items={[
          { to: "/stores", end: true, label: "المخازن", icon: <Warehouse /> },
          { to: "/stores/branches", label: "الفروع", icon: <Building2 /> },
          { to: "/stores/moves", label: "الحركات المخزنية", icon: <ArrowLeftRight /> },
          { to: "/stores/count", label: "جرد المخزن", icon: <ClipboardCheck /> },
          { to: "/stores/supply", label: "طلب توريد", icon: <Truck /> },
          { to: "/stores/purchase", label: "طلب شراء", icon: <ShoppingCart /> },
        ]}
      />
      <Routes>
        <Route index element={<Warehouses />} />
        <Route path="moves" element={<Moves />} />
        <Route path="count" element={<Counts />} />
        <Route path="branches" element={<Branches />} />
        <Route path="supply" element={<Requests />} />
        <Route path="purchase" element={<Purchases />} />
        <Route path="*" element={<Navigate to="/stores" replace />} />
      </Routes>
    </div>
  );
}
