import { lazy } from "react";
import { ClipboardList } from "lucide-react";
import { defineModule } from "../../types";
import { useActiveOrders } from "@/modules/badges";

/** الطلبات: كل طلبات الصالة والتيك أواي والتوصيل، إعادة الطباعة والمرتجعات. */
export default defineModule({
  id: "cc-orders",
  status: "ready",
  icon: ClipboardList,
  title: { ar: "الطلبات", en: "Orders" },
  description: { ar: "كل الطلبات: صالة وتيك أواي وتوصيل، إعادة الطباعة والمرتجعات", en: "Every order: dine-in, takeaway and delivery, reprints and refunds" },
  permission: "orders.create",
  nav: { path: "/orders", group: "service", order: 8, useBadge: useActiveOrders },
  routes: [{ path: "/orders/*", element: lazy(() => import("@/modules/orders/OrdersPage")) }],
  keywords: ["orders", "طلبات", "مرتجع", "طباعة"],
});
