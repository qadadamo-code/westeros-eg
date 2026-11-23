import { lazy } from "react";
import { Receipt } from "lucide-react";
import { defineModule } from "../../types";
import { useLive } from "@/data/hooks";

/** Open checks on this branch (badge). */
function useOpenChecks() {
  return useLive("checks", { where: { status: ["open", "bill_requested"] } }).data.length || null;
}

/** نقطة البيع (الكاشير): صالة وتيك أواي وتوصيل، الدفع والوردية. Part of المبيعات (Mohammed, 2026-11-23). */
export default defineModule({
  id: "cc-pos",
  status: "ready",
  icon: Receipt,
  title: { ar: "الكاشير", en: "POS" },
  description: { ar: "طلبات الصالة والتيك أواي والتوصيل، الدفع، تقسيم الشيك والوردية", en: "Dine-in, takeaway and delivery orders, payments, split bills and shifts" },
  permission: "pos.use",
  homeFor: ["cashier"],
  nav: { path: "/pos", group: "service", order: 7, mobile: true, useBadge: useOpenChecks },
  routes: [{ path: "/pos/*", element: lazy(() => import("@/modules/pos/PosPage")) }],
  keywords: ["cashier", "كاشير", "نقطة البيع", "فاتورة", "وردية", "صالة", "تيك أواي", "ديلفري"],
});
