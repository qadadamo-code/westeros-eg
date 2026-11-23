import { lazy } from "react";
import { IdCard } from "lucide-react";
import { defineModule } from "../../types";
import { useHrSub } from "./sections";
import { usePendingForMe } from "./usePending";

/** الموارد البشرية (Mohammed, 2026-11-23): a main menu of its own, every list and record editable from management. */
export default defineModule({
  id: "cc-hr",
  status: "ready",
  icon: IdCard,
  title: { ar: "الموارد البشرية", en: "HR" },
  description: { ar: "الموظفين والهيكل والتوظيف والعقود والورديات والحضور والطلبات والتقييم والتدريب والإنذارات ونهاية الخدمة", en: "People, org, hiring, contracts, rota, attendance, requests, reviews, training, discipline and exits" },
  permission: "staff.view",
  nav: { path: "/hr", group: "manage", order: 30, useSub: useHrSub, useBadge: usePendingForMe },
  routes: [{ path: "/hr/*", element: lazy(() => import("./HrPage")) }],
  keywords: ["hr", "موارد بشرية", "موظف", "توظيف", "عقد", "إنذار", "تقييم", "تدريب", "إجازة", "حضور", "بصمة", "ورديات"],
});
