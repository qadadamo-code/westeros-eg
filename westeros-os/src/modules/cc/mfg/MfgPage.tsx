/** 5- التصنيع: 5.1 طرق التصنيع (the four methods and their batch records), 5.2 الوصفات, the manufactured products and sale items, and the summary. */
import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { BarChart3, BookOpenCheck, ChefHat, ClipboardList, Factory, PlusCircle, UtensilsCrossed } from "lucide-react";
import { PageHeader } from "@/shell/PageHeader";
import { ViewBranchPicker } from "@/shell/ViewBranchPicker";
import { AreaGate, useTabs } from "../useAccess";
import { RouteTabs } from "@/modules/marketing/ui";
import { Skeleton } from "@/ui";
import Recipes from "./Recipes";
import Products from "../catalog/Products";
import SaleItems from "../catalog/SaleItems";
import MfgSummary from "./MfgSummary";

const NewBatchPage = lazy(() => import("@/modules/production/NewBatchPage"));
const BatchesPage = lazy(() => import("@/modules/production/BatchesPage"));

export default function MfgPage() {
  // the tabs this employee may see (المستخدمين ← الأدوار)
  const { tabs, first } = useTabs([
          { to: "/manufacturing", end: true, label: "تصنيع صنف", icon: <PlusCircle />, area: "mfg.make" },
          { to: "/manufacturing/recipes", label: "الوصفات", icon: <BookOpenCheck />, area: "mfg.recipes" },
          { to: "/manufacturing/log", label: "سجل التشغيلات", icon: <ClipboardList />, area: "mfg.log" },
          { to: "/manufacturing/products", label: "المنتجات المصنعة", icon: <ChefHat />, area: "catalog.products" },
          { to: "/manufacturing/sale", label: "أصناف البيع", icon: <UtensilsCrossed />, area: "catalog.sale" },
          { to: "/manufacturing/summary", label: "الملخص", icon: <BarChart3 />, area: "mfg.summary" },
        ]);
  return (
    <div className="grid gap-5">
      <PageHeader icon={<Factory />} title="التصنيع" actions={<ViewBranchPicker />} />
      <RouteTabs
        label="التصنيع"
        items={tabs}
      />
      <Suspense fallback={<Skeleton className="h-96" rounded="rounded-[20px]" />}>
        <Routes>
          <Route index element={<AreaGate id="mfg.make" fallback={first}><NewBatchPage /></AreaGate>} />
          <Route path="recipes" element={<AreaGate id="mfg.recipes" fallback={first}><Recipes /></AreaGate>} />
          <Route path="log" element={<AreaGate id="mfg.log" fallback={first}><BatchesPage /></AreaGate>} />
          <Route path="products" element={<AreaGate id="catalog.products" fallback={first}><Products /></AreaGate>} />
          <Route path="sale" element={<AreaGate id="catalog.sale" fallback={first}><SaleItems /></AreaGate>} />
          <Route path="summary" element={<AreaGate id="mfg.summary" fallback={first}><MfgSummary /></AreaGate>} />
          <Route path="*" element={<Navigate to="/manufacturing" replace />} />
        </Routes>
      </Suspense>
    </div>
  );
}
