import { lazy } from "react";
import { BookOpen } from "lucide-react";
import { defineModule } from "../../types";

/** المنيو: الفئات والأصناف ومجموعات الخيارات (الحجم، كومبو، إكسترا، ملاحظات) وأسعارها، زي Bonbell (Mohammed, 2026-11-23). */
export default defineModule({
  id: "cc-menu",
  status: "ready",
  icon: BookOpen,
  title: { ar: "المنيو", en: "Menu" },
  description: { ar: "الفئات والأصناف والإضافات والملاحظات وأسعارها، اللي بتظهر للكاشير", en: "Categories, items, options and notes with their prices, as the till shows them" },
  permission: "pos.use",
  nav: { path: "/menu", group: "service", order: 6 },
  routes: [{ path: "/menu/*", element: lazy(() => import("./MenuPage")) }],
  keywords: ["menu", "منيو", "اصناف", "إضافات", "اضافات", "ملاحظات", "اكسترا", "كومبو", "bonbell", "بونبيل"],
});
