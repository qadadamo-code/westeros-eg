/**
 * قوائم فتح وقفل الوردية: a department's daily list (template) and that list on one business day in one branch (run).
 * Each task keeps who ticked it and when, so the manager sees what was done, by whom, and what was skipped.
 * Schema: supabase/migrations/0016_checklists.sql.
 */
import type { Db } from "@/data/hooks";
import type { ChecklistArea, ChecklistKind, ChecklistRun, ChecklistRunItem, ChecklistTemplate, Localized, Membership } from "@/data/types";
import { nowIso } from "@/lib/time";

export const KIND_LABEL: Record<ChecklistKind, Localized> = {
  opening: { ar: "فتح الوردية", en: "Opening" },
  closing: { ar: "قفل الوردية", en: "Closing" },
  other: { ar: "خلال اليوم", en: "During the day" },
};
export const AREA_LABEL: Record<ChecklistArea, Localized> = {
  kitchen: { ar: "المطبخ", en: "Kitchen" },
  cashier: { ar: "الكاشير", en: "Cashier" },
  floor: { ar: "الصالة", en: "Floor" },
  all: { ar: "كل الفريق", en: "Everyone" },
};
export const KIND_ORDER: ChecklistKind[] = ["opening", "other", "closing"];

/** Business day in Cairo, "YYYY-MM-DD". */
export const cairoDay = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Cairo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
export const dayAdd = (day: string, n: number) => new Date(Date.parse(`${day}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/** a list with no roles is everyone's; managers see every list */
export function visibleTo(t: Pick<ChecklistTemplate, "roles" | "active">, role: string | null, manage: boolean): boolean {
  if (!t.active) return false;
  return manage || !t.roles.length || (!!role && t.roles.includes(role));
}

export const blankItems = (t: Pick<ChecklistTemplate, "items">): ChecklistRunItem[] => t.items.map((i) => ({ taskId: i.id, text: i.text, doneBy: null, doneByName: "", doneAt: null, note: "" }));

export interface Progress {
  done: number;
  total: number;
  status: "none" | "partial" | "done";
}
export function progress(items: Pick<ChecklistRunItem, "doneAt">[] | undefined, total?: number): Progress {
  const n = items?.length ?? total ?? 0;
  const done = items?.filter((i) => i.doneAt).length ?? 0;
  return { done, total: n, status: !done ? "none" : done >= n ? "done" : "partial" };
}

/** The tasks of a run, brought in line with the list as it is today: new tasks appear, ticks are kept, removed tasks stay only if ticked. */
export function syncItems(run: Pick<ChecklistRun, "items">, t: Pick<ChecklistTemplate, "items">): ChecklistRunItem[] {
  const have = new Map(run.items.map((i) => [i.taskId, i]));
  const now = t.items.map((i) => ({ ...(have.get(i.id) ?? { taskId: i.id, doneBy: null, doneByName: "", doneAt: null, note: "" }), text: i.text }));
  const ids = new Set(t.items.map((i) => i.id));
  return [...now, ...run.items.filter((i) => !ids.has(i.taskId) && i.doneAt)];
}

export function tick(items: ChecklistRunItem[], taskId: string, done: boolean, by: Pick<Membership, "id" | "name"> | null, at: string): ChecklistRunItem[] {
  return items.map((i) => (i.taskId !== taskId ? i : done ? { ...i, doneBy: by?.id ?? null, doneByName: by?.name ?? "", doneAt: at } : { ...i, doneBy: null, doneByName: "", doneAt: null }));
}

/** Today's run of a list, created the first time someone opens it. */
export async function openRun(db: Db, t: ChecklistTemplate, p: { branchId: string; day: string; staff: Pick<Membership, "id" | "name"> | null }): Promise<ChecklistRun> {
  const [have] = await db.list("checklistRuns", { where: { templateId: t.id, day: p.day, branchId: p.branchId } });
  if (have) return have;
  return db.insert("checklistRuns", {
    branchId: p.branchId, templateId: t.id, templateName: t.name, kind: t.kind, area: t.area, day: p.day, items: blankItems(t),
    startedBy: p.staff?.id ?? null, startedByName: p.staff?.name ?? "", startedAt: nowIso(), completedAt: null,
  });
}

/** Ticks (or unticks) one task as the signed-in person. Reads the run again first so two people ticking at once both count. */
export async function setTask(db: Db, runId: string, t: ChecklistTemplate | undefined, p: { taskId: string; done: boolean; note?: string; staff: Pick<Membership, "id" | "name"> | null }): Promise<ChecklistRun> {
  const run = await db.get("checklistRuns", runId);
  if (!run) throw new Error("checklist run not found");
  const at = nowIso();
  let items = tick(t ? syncItems(run, t) : run.items, p.taskId, p.done, p.staff, at);
  if (p.note !== undefined) items = items.map((i) => (i.taskId === p.taskId ? { ...i, note: p.note ?? "" } : i));
  const all = items.length > 0 && items.every((i) => i.doneAt);
  return db.update("checklistRuns", run.id, { items, completedAt: all ? (run.completedAt ?? at) : null });
}

export interface FollowCell {
  day: string;
  run: ChecklistRun | undefined;
  progress: Progress;
  /** false for days before the list existed: they are not counted as missed */
  due: boolean;
}
export interface FollowRow {
  template: ChecklistTemplate;
  cells: FollowCell[];
  /** share of days fully done, basis points; null while no day can be judged yet (today still running) */
  doneBp: number | null;
}
/** Manager's view: every active list against the last days — done, partly done or missed. */
export function followUp(templates: ChecklistTemplate[], runs: ChecklistRun[], days: string[], branchId: string | null, today?: string): FollowRow[] {
  const key = (t: string, d: string) => `${t}|${d}`;
  const byKey = new Map(runs.filter((r) => !branchId || r.branchId === branchId).map((r) => [key(r.templateId, r.day), r]));
  return templates.filter((t) => t.active).map((template) => {
    const cells = days.map((day) => {
      const run = byKey.get(key(template.id, day));
      return { day, run, progress: progress(run?.items, template.items.length), due: !!run || day >= cairoDay(template.createdAt) };
    });
    // today counts once it is finished; until then it is still running
    const due = cells.filter((c) => c.due && (c.day !== today || c.progress.status === "done"));
    return { template, cells, doneBp: due.length ? Math.round((due.filter((c) => c.progress.status === "done").length * 10_000) / due.length) : null };
  });
}

/** who did the most tasks in the period */
export function byPerson(runs: ChecklistRun[]): { id: string; name: string; tasks: number }[] {
  const m = new Map<string, { id: string; name: string; tasks: number }>();
  for (const r of runs) for (const i of r.items) {
    if (!i.doneAt || !i.doneBy) continue;
    const p = m.get(i.doneBy) ?? { id: i.doneBy, name: i.doneByName, tasks: 0 };
    p.tasks += 1;
    m.set(i.doneBy, p);
  }
  return [...m.values()].sort((a, b) => b.tasks - a.tasks);
}
