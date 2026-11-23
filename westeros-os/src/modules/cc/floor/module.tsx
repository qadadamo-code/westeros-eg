import { lazy } from "react";
import { LayoutGrid } from "lucide-react";
import { defineModule } from "../../types";

/** شكل الصالة: الترابيزات وأماكنها وأحجامها وأرقامها. بيتفتح من قناة الصالة في الحسابات > المبيعات > قنوات البيع (Mohammed 2026-11-23). */
export default defineModule({
  id: "cc-floor",
  status: "ready",
  icon: LayoutGrid,
  title: { ar: "شكل الصالة", en: "Floor layout" },
  description: { ar: "عدد الترابيزات وشكلها وتوزيعها وأرقامها", en: "Tables, their shape, place and numbers" },
  permission: "floor.edit",
  routes: [{ path: "/floor/*", element: lazy(() => import("@/modules/floor/FloorPage")) }],
  keywords: ["floor", "صالة", "ترابيزات", "layout"],
});
