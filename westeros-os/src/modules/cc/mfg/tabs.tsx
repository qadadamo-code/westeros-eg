/** the tabs of التصنيع this employee may see; the page and the phone menu both use them */
import { BarChart3, BookOpenCheck, ChefHat, ClipboardList, PlusCircle, UtensilsCrossed } from "lucide-react";
import { useTabs } from "../useAccess";

export function useMfgTabs() {
  // the tabs this employee may see (المستخدمين ← الأدوار)
  const { tabs, first } = useTabs([
          { to: "/manufacturing", end: true, label: "تصنيع صنف", icon: <PlusCircle />, area: "mfg.make" },
          { to: "/manufacturing/recipes", label: "الوصفات", icon: <BookOpenCheck />, area: "mfg.recipes" },
          { to: "/manufacturing/log", label: "سجل التشغيلات", icon: <ClipboardList />, area: "mfg.log" },
          { to: "/manufacturing/products", label: "المنتجات المصنعة", icon: <ChefHat />, area: "catalog.products" },
          { to: "/manufacturing/sale", label: "أصناف البيع", icon: <UtensilsCrossed />, area: "catalog.sale" },
          { to: "/manufacturing/summary", label: "الملخص", icon: <BarChart3 />, area: "mfg.summary" },
        ]);
  return { tabs, first };
}
