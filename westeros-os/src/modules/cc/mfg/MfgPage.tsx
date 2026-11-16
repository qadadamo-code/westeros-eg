/** 5- التصنيع: 5.1 طرق التصنيع (the four methods and their batch records), 5.2 الوصفات. */
import { lazy, Suspense } from "react";
import { Route, Routes } from "react-router-dom";
import { BookOpenCheck, ClipboardList, Factory, PlusCircle } from "lucide-react";
import { PageHeader } from "@/shell/PageHeader";
import { RouteTabs } from "@/modules/marketing/ui";
import { Skeleton } from "@/ui";
import Recipes from "./Recipes";

const NewBatchPage = lazy(() => import("@/modules/production/NewBatchPage"));
const BatchesPage = lazy(() => import("@/modules/production/BatchesPage"));

export default function MfgPage() {
  return (
    <div className="grid gap-5">
      <PageHeader icon={<Factory />} title="التصنيع" />
      <RouteTabs
        label="التصنيع"
        items={[
          { to: "/manufacturing", end: true, label: "طرق التصنيع", icon: <PlusCircle /> },
          { to: "/manufacturing/recipes", label: "الوصفات", icon: <BookOpenCheck /> },
          { to: "/manufacturing/log", label: "سجل التشغيلات", icon: <ClipboardList /> },
        ]}
      />
      <Suspense fallback={<Skeleton className="h-96" rounded="rounded-[20px]" />}>
        <Routes>
          <Route index element={<NewBatchPage />} />
          <Route path="recipes" element={<Recipes />} />
          <Route path="log" element={<BatchesPage />} />
        </Routes>
      </Suspense>
    </div>
  );
}
