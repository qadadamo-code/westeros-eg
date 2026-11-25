import { lazy } from "react";
import { RadioTower } from "lucide-react";
import { defineModule } from "../../types";

/** اللاسلكي under الإعدادات (Saqr 2026-11-25): who may use the walkie-talkie and with whom, group chats, and the log. */
export default defineModule({
  id: "cc-radio",
  status: "ready",
  icon: RadioTower,
  title: { ar: "اللاسلكي", en: "Radio" },
  description: { ar: "صلاحيات اللاسلكي لكل موظف، والمجموعات، وسجل المحادثات", en: "Who may use the radio and with whom, groups and the log" },
  permission: "staff.manage",
  nav: { path: "/radio-settings", group: "admin", order: 12 },
  routes: [{ path: "/radio-settings/*", element: lazy(() => import("./RadioSettingsPage")) }],
  keywords: ["لاسلكي", "واكي", "مايك", "radio", "walkie", "ptt"],
});
