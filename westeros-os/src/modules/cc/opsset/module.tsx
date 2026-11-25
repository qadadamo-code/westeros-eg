import { lazy } from "react";
import { SlidersHorizontal } from "lucide-react";
import { defineModule } from "../../types";

/** اعدادات التشغيل (Saqr 2026-11-25): printers, receipt and kitchen-ticket design, print station, per branch. Under التشغيل. */
export default defineModule({
  id: "cc-opsset",
  status: "ready",
  icon: SlidersHorizontal,
  title: { ar: "اعدادات التشغيل", en: "Operations settings" },
  description: { ar: "الطابعات وشكل الفاتورة وطلبية المطبخ ومحطة الطباعة لكل فرع", en: "Printers, receipt and kitchen ticket, print station, per branch" },
  nav: { path: "/ops-settings", group: "service", order: 90 },
  routes: [{ path: "/ops-settings", element: lazy(() => import("./OpsSettingsPage")) }],
  keywords: ["طابعة", "طابعات", "فاتورة", "محطة", "printer", "receipt"],
});
