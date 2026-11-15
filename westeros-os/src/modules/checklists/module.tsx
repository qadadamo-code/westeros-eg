import { lazy } from "react";
import { ListChecks } from "lucide-react";
import { useSession } from "@/auth/session";
import { useLive } from "@/data/hooks";
import { defineModule } from "../types";
import { cairoDay, progress, visibleTo } from "./lib";

/** Nav badge: today's lists of your department that are not finished yet. */
function useOpenLists(): number | null {
  const { role, can, branchId } = useSession();
  const day = cairoDay(new Date().toISOString());
  const templates = useLive("checklistTemplates").data;
  const runs = useLive("checklistRuns", { where: { day } }).data;
  const mine = templates.filter((t) => visibleTo(t, role, false) || (can("checklists.manage") && !t.roles.length));
  const n = mine.filter((t) => progress(runs.find((r) => r.templateId === t.id && (!branchId || r.branchId === branchId))?.items, t.items.length).status !== "done").length;
  return n || null;
}

/**
 * Shift opening / closing checklists: each department ticks its daily tasks under the name of who did them, and the
 * manager follows what was done and what was skipped. Schema: supabase/migrations/0016_checklists.sql.
 */
export default defineModule({
  id: "checklists",
  status: "ready",
  icon: ListChecks,
  title: { ar: "قوائم الوردية", en: "Shift checklists" },
  description: { ar: "مهام فتح وقفل الوردية لكل قسم، باسم الموظف ووقته، ومتابعة المدير", en: "Opening and closing tasks per department, signed and timed, with the manager's follow-up" },
  permission: "checklists.do",
  nav: { path: "/checklists", group: "service", order: 34, mobile: true, useBadge: useOpenLists },
  keywords: ["checklist", "opening", "closing", "shift", "tasks", "قائمة", "قوائم", "فتح", "قفل", "وردية", "مهام", "تشيك ليست"],
  routes: [{ path: "/checklists/*", element: lazy(() => import("./ChecklistsPage")) }],
  data: ["checklistTemplates", "checklistRuns"],
});
