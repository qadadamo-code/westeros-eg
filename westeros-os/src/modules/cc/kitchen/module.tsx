import { lazy } from "react";
import { ChefHat } from "lucide-react";
import { defineModule } from "../../types";
import { useKitchenQueue } from "@/modules/badges";

/** شاشة المطبخ: الطلبات اللي اتبعتت من الكاشير، حسب الوقت. */
export default defineModule({
  id: "cc-kitchen",
  status: "ready",
  icon: ChefHat,
  title: { ar: "شاشة المطبخ", en: "Kitchen display" },
  description: { ar: "طلبات الكاشير في المطبخ: بيتعمل ثم جاهز", en: "Orders from the till in the kitchen: preparing, then ready" },
  permission: "kitchen.view",
  nav: { path: "/kitchen", group: "service", order: 9, mobile: true, useBadge: useKitchenQueue },
  routes: [
    { path: "/kitchen/*", element: lazy(() => import("@/modules/kitchen/KitchenPage")) },
    { path: "/kds", element: lazy(() => import("@/modules/kitchen/KdsKiosk")), layout: "bare", title: { ar: "شاشة المطبخ", en: "Kitchen display" } },
  ],
  keywords: ["kds", "مطبخ", "شيف", "تذاكر"],
});
