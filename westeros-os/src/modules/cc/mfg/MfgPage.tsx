/** 5- التصنيع: 5.1 طرق التصنيع (the four methods and their batch records), 5.2 الوصفات. */
import { lazy, Suspense } from "react";
import { Route, Routes } from "react-router-dom";
import { BookOpenCheck, ClipboardList, Factory, PlusCircle } from "lucide-react";
import { PageHeader } from "@/shell/PageHeader";
import { AreaGate, useTabs } from "../useAccess";
import { RouteTabs } from "@/modules/marketing/ui";
import { Skeleton } from "@/ui";
import Recipes from "./Recipes";

const NewBatchPage = lazy(() => import("@/modules/production/NewBatchPage"));
const BatchesPage = lazy(() => import("@/modules/production/BatchesPage"));

export default function MfgPage() {
  // the tabs this employee may see (المستخدمين ← الأدوار)
  const { tabs, first } = useTabs([
          { to: "/manufacturing", end: true, label: "تصنيع صنف", icon: <PlusCircle />, area: "mfg.make" },
          { to: "/manufacturing/recipes", label: "الوصفات", icon: <BookOpenCheck />, area: "mfg.recipes" },
          { to: "/manufacturing/log", label: "سجل التشغيلات", icon: <ClipboardList />, area: "mfg.log" },
        ]);
  return (
    <div className="grid gap-5">
      <PageHeader icon={<Factory />} title="التصنيع" />
      <RouteTabs
        label="التصنيع"
        items={tabs}
      />
      <Suspense fallback={<Skeleton className="h-96" rounded="rounded-[20px]" />}>
        <Routes>
          <Route index element={<AreaGate id="mfg.make" fallback={first}><NewBatchPage /></AreaGate>} />
          <Route path="recipes" element={<AreaGate id="mfg.recipes" fallback={first}><Recipes /></AreaGate>} />
          <Route path="log" element={<AreaGate id="mfg.log" fallback={first}><BatchesPage /></AreaGate>} />
        </Routes>
      </Suspense>
    </div>
  );
}
