/** 3- قائمة المنتجات والخامات. */
import { Route, Routes } from "react-router-dom";
import { Boxes, ChefHat, ListChecks, UtensilsCrossed } from "lucide-react";
import { PageHeader } from "@/shell/PageHeader";
import { RouteTabs } from "@/modules/marketing/ui";
import RawMaterials from "./RawMaterials";
import Products from "./Products";
import SaleItems from "./SaleItems";

export default function CatalogPage() {
  return (
    <div className="grid gap-5">
      <PageHeader icon={<ListChecks />} title="قائمة المنتجات والخامات" />
      <RouteTabs
        label="قائمة المنتجات والخامات"
        items={[
          { to: "/catalog", end: true, label: "مواد الخام", icon: <Boxes /> },
          { to: "/catalog/products", label: "المنتجات المصنعة", icon: <ChefHat /> },
          { to: "/catalog/sale", label: "أصناف البيع", icon: <UtensilsCrossed /> },
        ]}
      />
      <Routes>
        <Route index element={<RawMaterials />} />
        <Route path="products" element={<Products />} />
        <Route path="sale" element={<SaleItems />} />
      </Routes>
    </div>
  );
}
