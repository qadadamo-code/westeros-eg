import { lazy } from "react";
import { Printer } from "lucide-react";
import { defineModule } from "../../types";

/** محطة الطباعة (Saqr 2026-11-25): the screen the print-station PC keeps open. Its own permission (print.station). */
export default defineModule({
  id: "cc-station",
  status: "ready",
  icon: Printer,
  title: { ar: "محطة الطباعة", en: "Print station" },
  description: { ar: "بتطبع طلبات كل الأجهزة على الطابعات بالـ IP", en: "Prints every device's jobs to the printers by IP" },
  routes: [{ path: "/print-station", element: lazy(() => import("./StationPage")), layout: "bare", title: { ar: "محطة الطباعة", en: "Print station" } }],
});
