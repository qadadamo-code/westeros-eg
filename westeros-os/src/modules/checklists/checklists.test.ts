/** Shift checklists on the in-browser backend: open today's run, tick as two people, follow up as the manager. */
import { describe, expect, it } from "vitest";
import { can } from "@/auth/permissions";
import { LocalAdapter } from "@/data/local/LocalAdapter";
import { makeDb } from "@/data/hooks";
import { staffId } from "@/data/seed";
import { buildWesterosSeed, WESTEROS_BRANCH_ID, WESTEROS_RESTAURANT_ID } from "@/data/westeros/seed";
import { DEFAULT_LISTS } from "./defaults";
import { byPerson, followUp, openRun, progress, setTask, syncItems, visibleTo } from "./lib";

const R = WESTEROS_RESTAURANT_ID;
const B = WESTEROS_BRANCH_ID;
const NOW = new Date("2026-11-15T10:00:00Z");

describe("shift checklists", () => {
  const repo = new LocalAdapter({ memory: true, now: () => NOW, buildSeed: buildWesterosSeed });
  const db = makeDb(repo, R, B, staffId("chef"));
  const chef = { id: staffId("chef"), name: "عبد الله صقر" };
  const helper = { id: staffId("kitchen"), name: "مساعد مطبخ" };
  const day = "2026-11-15";

  it("seeds the ready-made lists", async () => {
    const lists = await db.list("checklistTemplates");
    expect(lists).toHaveLength(DEFAULT_LISTS.length);
    expect(lists.every((l) => l.items.length >= 5 && l.restaurantId === R)).toBe(true);
    expect(new Set(lists.flatMap((l) => l.items.map((i) => i.id))).size).toBe(lists.reduce((a, l) => a + l.items.length, 0));
  });

  it("shows each department its own lists and managers everything", async () => {
    const lists = await db.list("checklistTemplates");
    const kitchen = lists.find((l) => l.name.ar === "فتح المطبخ")!;
    expect(visibleTo(kitchen, "chef", false)).toBe(true);
    expect(visibleTo(kitchen, "cashier", false)).toBe(false);
    expect(visibleTo(kitchen, "owner", true)).toBe(true);
    expect(visibleTo({ ...kitchen, roles: [] }, "delivery", false)).toBe(true);
    expect(visibleTo({ ...kitchen, active: false }, "chef", true)).toBe(false);
    expect(can("cashier", "checklists.do") && can("delivery", "checklists.do")).toBe(true);
    expect(can("manager", "checklists.manage")).toBe(true);
    expect(can("chef", "checklists.manage")).toBe(false);
  });

  it("signs every task with who ticked it, and completes the run on the last one", async () => {
    const t = (await db.list("checklistTemplates")).find((l) => l.name.ar === "فتح المطبخ")!;
    const run = await openRun(db, t, { branchId: B, day, staff: chef });
    expect((await openRun(db, t, { branchId: B, day, staff: helper })).id).toBe(run.id);
    expect(progress(run.items).status).toBe("none");
    const [first, second, ...rest] = t.items;
    let r = await setTask(db, run.id, t, { taskId: first.id, done: true, staff: chef });
    r = await setTask(db, run.id, t, { taskId: second.id, done: true, staff: helper });
    expect(r.items.find((i) => i.taskId === first.id)?.doneByName).toBe("عبد الله صقر");
    expect(r.items.find((i) => i.taskId === second.id)?.doneBy).toBe(helper.id);
    expect(progress(r.items)).toMatchObject({ done: 2, total: t.items.length, status: "partial" });
    expect(r.completedAt).toBeNull();
    for (const i of rest) r = await setTask(db, run.id, t, { taskId: i.id, done: true, staff: chef });
    expect(r.completedAt).not.toBeNull();
    r = await setTask(db, run.id, t, { taskId: first.id, done: false, staff: chef });
    expect(r.completedAt).toBeNull();
    expect(r.items.find((i) => i.taskId === first.id)?.doneBy).toBeNull();
  });

  it("keeps ticks when the manager edits the list", async () => {
    const t = (await db.list("checklistTemplates")).find((l) => l.name.ar === "فتح المطبخ")!;
    const [run] = await db.list("checklistRuns", { where: { templateId: t.id, day } });
    const edited = { items: [{ id: "new-task", text: { ar: "مهمة جديدة", en: "New task" } }, ...t.items.slice(1, 3)] };
    const items = syncItems(run, edited);
    expect(items[0]).toMatchObject({ taskId: "new-task", doneAt: null });
    expect(items[1].doneAt).not.toBeNull();
    // the five removed tasks that were ticked stay on the day's record; the removed first task was unticked, so it goes
    expect(items.length).toBe(3 + (t.items.length - 3));
  });

  it("follows up the week and counts tasks per person", async () => {
    const templates = await db.list("checklistTemplates");
    const runs = await db.list("checklistRuns");
    const rows = followUp(templates, runs, ["2026-11-14", "2026-11-15"], B);
    const kitchen = rows.find((r) => r.template.name.ar === "فتح المطبخ")!;
    expect(kitchen.cells.map((c) => c.progress.status)).toEqual(["none", "partial"]);
    // the lists were added on the 15th: the day before is not held against the team
    expect(kitchen.cells.map((c) => c.due)).toEqual([false, true]);
    expect(rows.find((r) => r.template.name.ar === "قفل الكاشير")!.doneBp).toBe(0);
    // while today is still running it is not judged
    expect(followUp(templates, runs, ["2026-11-14", "2026-11-15"], B, "2026-11-15").find((r) => r.template.name.ar === "قفل الكاشير")!.doneBp).toBeNull();
    const people = byPerson(runs);
    expect(people[0].name).toBe("عبد الله صقر");
    expect(people.find((p) => p.id === helper.id)?.tasks).toBe(1);
  });
});
