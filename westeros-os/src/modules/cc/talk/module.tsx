import { lazy } from "react";
import { RadioTower } from "lucide-react";
import { defineModule } from "../../types";

/** اللاسلكي for the employee (Saqr 2026-11-25): opened from the floating mic, shown only to employees management allowed. */
export default defineModule({
  id: "cc-talk",
  status: "ready",
  icon: RadioTower,
  title: { ar: "اللاسلكي", en: "Radio" },
  description: { ar: "اضغط واتكلم مع الموظفين والمجموعات المسموح لك بيها", en: "Push to talk with the people and groups you are allowed" },
  routes: [{ path: "/radio", element: lazy(() => import("./TalkPage")) }],
});
