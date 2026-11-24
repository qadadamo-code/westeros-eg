import { lazy, Suspense, type ComponentType, type LazyExoticComponent } from "react";
import { Factory } from "lucide-react";
import { EmptyState } from "@/ui";
import { useCentralBranch } from "@/shell/nav";

/** الكاشير والطلبات don't open on a central-kitchen branch: it only manufactures (Saqr 2026-11-24) */
export function tillOnly(load: () => Promise<{ default: ComponentType }>) {
  const Page: LazyExoticComponent<ComponentType> = lazy(load);
  return function TillOnly() {
    const central = useCentralBranch();
    if (central) return <EmptyState className="mt-16" icon={<Factory />} title="الفرع ده مطبخ مركزي" body="المطبخ المركزي للتصنيع بس، ملوش كاشير ولا طلبات. اختار فرع تاني من فوق." />;
    return <Suspense fallback={null}><Page /></Suspense>;
  };
}
