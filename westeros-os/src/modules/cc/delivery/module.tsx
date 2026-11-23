import { lazy } from "react";
import { Truck } from "lucide-react";
import { defineModule } from "../../types";
import { FINANCE_ON } from "../finance/flag";

/** خدمة التوصيل: طرق التوصيل ونسبة تحصيل الرسوم، ومندوبو التوصيل وحساباتهم. A main menu under الإعدادات, like المستخدمين (Mohammed, 2026-11-23). */
export default defineModule({
  id: "cc-delivery",
  status: "ready",
  hidden: !FINANCE_ON,
  icon: Truck,
  title: { ar: "خدمة التوصيل", en: "Delivery service" },
  description: { ar: "طرق التوصيل ونسبة تحصيل الرسوم، ومندوبو التوصيل وحساباتهم", en: "Delivery methods, fee shares, drivers and their accounts" },
  permission: "accounting.view",
  nav: { path: "/delivery", group: "admin", order: 11 },
  routes: [{ path: "/delivery/*", element: lazy(() => import("./DeliveryPage")) }],
  keywords: ["توصيل", "مندوب", "طيار", "ديلفري", "delivery", "driver"],
});
