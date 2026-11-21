/** 3- قائمة المنتجات والخامات. */
import { Route, Routes } from "react-router-dom";
import { Boxes, ChefHat, ListChecks, UtensilsCrossed } from "lucide-react";
import { PageHeader } from "@/shell/PageHeader";
import { AreaGate, useTabs } from "../useAccess";
import { RouteTabs } from "@/modules/marketing/ui";
import RawMaterials from "./RawMaterials";
import Products from "./Products";
import SaleItems from "./SaleItems";

export default function CatalogPage() {
  // the tabs this employee may see (المستخدمين ← الأدوار)
  const { tabs, first } = useTabs([
          { to: "/catalog", end: true, label: "مواد الخام", icon: <Boxes />, area: "catalog.raws" },
          { to: "/catalog/products", label: "المنتجات المصنعة", icon: <ChefHat />, area: "catalog.products" },
          { to: "/catalog/sale", label: "أصناف البيع", icon: <UtensilsCrossed />, area: "catalog.sale" },
        ]);
  return (
    <div className="grid gap-5">
      <PageHeader icon={<ListChecks />} title="قائمة المنتجات والخامات" />
      <RouteTabs
        label="قائمة المنتجات والخامات"
        items={tabs}
      />
      <Routes>
        <Route index element={<AreaGate id="catalog.raws" fallback={first}><RawMaterials /></AreaGate>} />
        <Route path="products" element={<AreaGate id="catalog.products" fallback={first}><Products /></AreaGate>} />
        <Route path="sale" element={<AreaGate id="catalog.sale" fallback={first}><SaleItems /></AreaGate>} />
      </Routes>
    </div>
  );
}
