import { lazy } from "react";
import { UserRound } from "lucide-react";
import { defineModule } from "../../types";

/** صفحتي: every employee's own page (Mohammed, 2026-11-23): attendance, schedule, requests, leave, training, reviews, warnings, payslips. */
export default defineModule({
  id: "cc-me",
  status: "ready",
  icon: UserRound,
  title: { ar: "صفحتي", en: "Me" },
  description: { ar: "حضوري وجدولي وطلباتي وإجازاتي وتدريبي وتقييمي وقسائم راتبي", en: "My attendance, schedule, requests, leave, training, reviews and payslips" },
  permission: "hr.self",
  nav: { path: "/me", group: "admin", order: 90, mobile: true },
  routes: [{ path: "/me/*", element: lazy(() => import("./MePage")) }],
  keywords: ["me", "صفحتي", "بصمة", "حضور", "إجازة", "طلب", "مرتب", "قسيمة", "تدريب"],
});
