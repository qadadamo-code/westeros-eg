import { lazy, Suspense, useEffect, type ComponentType, type LazyExoticComponent } from "react";
import { Factory } from "lucide-react";
import { EmptyState } from "@/ui";
import { useCentralBranch } from "@/shell/nav";
import { useSession } from "@/auth/session";

/** الكاشير والطلبات don't open on a central-kitchen branch: it only manufactures (Saqr 2026-11-24) */
export function tillOnly(load: () => Promise<{ default: ComponentType }>) {
  const Page: LazyExoticComponent<ComponentType> = lazy(load);
  return function TillOnly() {
    const central = useCentralBranch();
    // on كل الفروع the working branch under the cashier must be a real branch, never the central kitchen
    const { branchId, branches, switchBranch } = useSession();
    const onCentral = !!branches.find((b) => b.id === branchId)?.isCentral;
    const till = branches.find((b) => !b.isCentral);
    useEffect(() => { if (!central && onCentral && till) switchBranch(till.id); }, [central, onCentral, till, switchBranch]);
    if (central) return <EmptyState className="mt-16" icon={<Factory />} title="الفرع ده مطبخ مركزي" body="المطبخ المركزي للتصنيع بس، ملوش كاشير ولا طلبات. اختار فرع تاني من فوق." />;
    return <Suspense fallback={null}><Page /></Suspense>;
  };
}
