/** 2- المخازن: the five screens of the document, in its order. */
import { Route, Routes } from "react-router-dom";
import { ArrowLeftRight, ClipboardCheck, ShoppingCart, Truck, Warehouse } from "lucide-react";
import { PageHeader } from "@/shell/PageHeader";
import { RouteTabs } from "@/modules/marketing/ui";
import Warehouses from "./Warehouses";
import Moves from "./Moves";
import Counts from "./Counts";
import Requests from "./Requests";

export default function StoresPage() {
  return (
    <div className="grid gap-5">
      <PageHeader icon={<Warehouse />} title="المخازن" />
      <RouteTabs
        label="المخازن"
        items={[
          { to: "/stores", end: true, label: "المخازن", icon: <Warehouse /> },
          { to: "/stores/moves", label: "الحركات المخزنية", icon: <ArrowLeftRight /> },
          { to: "/stores/count", label: "جرد المخزن", icon: <ClipboardCheck /> },
          { to: "/stores/purchase", label: "طلب شراء", icon: <ShoppingCart /> },
          { to: "/stores/supply", label: "طلب توريد للفرع", icon: <Truck /> },
        ]}
      />
      <Routes>
        <Route index element={<Warehouses />} />
        <Route path="moves" element={<Moves />} />
        <Route path="count" element={<Counts />} />
        <Route path="purchase" element={<Requests kind="purchase" />} />
        <Route path="supply" element={<Requests kind="supply" />} />
      </Routes>
    </div>
  );
}
