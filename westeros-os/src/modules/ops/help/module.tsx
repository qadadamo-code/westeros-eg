import { lazy } from "react";
import { CircleHelp } from "lucide-react";
import { defineModule } from "../../types";

/** Westeros technical support for restaurant staff: help center, "اطلب دعم" with diagnostics, my tickets, system status. */
export default defineModule({
  id: "help",
  status: "ready",
  icon: CircleHelp,
  title: { ar: "المساعدة والدعم الفني", en: "Help & support" },
  description: { ar: "مقالات المساعدة واطلب دعم من فريق وستروس وحالة النظام", en: "Help articles, request Westeros support and system status" },
  permission: "help.view",
  nav: { path: "/help", group: "admin", order: 90 },
  keywords: ["help", "support", "status", "مساعدة", "دعم", "مشكلة", "حالة"],
  routes: [{ path: "/help/*", element: lazy(() => import("../support/HelpPage")) }],
  data: ["supportTickets"],
});
