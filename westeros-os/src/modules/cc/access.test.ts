/** الصلاحيات التفصيلية: every tab has its actions, old roles keep what they had, مشاهدة comes first. */
import { describe, expect, it } from "vitest";
import { LocalAdapter } from "@/data/local/LocalAdapter";
import { makeDb } from "@/data/hooks";
import { WESTEROS_BRANCH_ID, WESTEROS_RESTAURANT_ID } from "@/data/westeros/seed";
import { buildTestKitchen } from "@/modules/production/testKitchen";
import { accessOf, areas, memberMay, screensFromAccess } from "./access";
import { DEFAULT_LISTS, listsOf, userTypesOf } from "./lib";
import { permsOfRole, rolePatch } from "./perms";
import { exportUsers, importUsers, USER_HEAD } from "./users/usersExcel";

describe("detailed permissions", () => {
  const [chef, , , admin] = userTypesOf(DEFAULT_LISTS);
  it("lists every tab of every screen, each with مشاهدة", () => {
    expect(areas().every((a) => a.acts[0] === "view")).toBe(true);
    expect(areas().find((a) => a.id === "catalog.raws")?.acts).toEqual(["view", "add", "edit", "delete", "import", "export"]);
    expect(new Set(areas().map((a) => a.id)).size).toBe(areas().length);
  });
  it("a role saved before keeps every action on the tabs of its screens", () => {
    const set = accessOf(chef);
    expect(set.has("stores.warehouses:delete")).toBe(true);
    expect(set.has("users.list:view")).toBe(false);
    expect(accessOf(admin).has("users.roles:edit")).toBe(true);
  });
  it("needs مشاهدة, and the owner may do everything", () => {
    const lists = { ...DEFAULT_LISTS, userTypes: [{ ...chef, access: ["stores.warehouses:view", "stores.moves:add"] }], userTypeOf: { m: chef.id } };
    const m = { id: "m", role: chef.role };
    expect(memberMay(m, lists, "stores.warehouses", "view")).toBe(true);
    expect(memberMay(m, lists, "stores.warehouses", "add")).toBe(false);
    expect(memberMay(m, lists, "stores.moves", "add")).toBe(false); // no مشاهدة
    expect(memberMay({ id: "o", role: "owner" }, lists, "users.roles", "delete")).toBe(true);
  });
  it("the screens follow the tabs ticked for مشاهدة", () => {
    expect(screensFromAccess(["mfg.log:view", "stores.count:add"])).toEqual(["cc-mfg"]);
    const patch = rolePatch(new Set(["acc:mfg.make:view", "acc:mfg.make:add", "supply.handle"]));
    expect([patch.screens, patch.access, patch.perms]).toEqual([["cc-mfg"], ["mfg.make:view", "mfg.make:add"], ["supply.handle"]]);
    expect(permsOfRole({ ...chef, ...patch }).has("acc:mfg.make:add")).toBe(true);
  });
});

describe("employees to Excel and back", async () => {
  const repo = new LocalAdapter({ name: `users-xl-${Math.random()}`, memory: true, buildSeed: buildTestKitchen, now: () => new Date("2026-11-21T10:00:00Z") });
  await repo.ready();
  const db = makeDb(repo, WESTEROS_RESTAURANT_ID, WESTEROS_BRANCH_ID, null);
  const ctx = async () => ({ members: await db.list("memberships"), profiles: await db.list("staffProfiles"), settings: (await db.list("mfgSettings"))[0], branches: await db.list("branches") });
  it("adds new codes, updates existing ones, and leaves out what does not fit", async () => {
    const c = await ctx();
    const types = userTypesOf(listsOf(c.settings));
    const t0 = types[0];
    const from = (t0.from ?? 1) + 50;
    const rows: Record<string, string>[] = [
      { "الكود": String(from), "الاسم": "موظف تجربة", "الدور": t0.name, "مكان العمل": "كل الفروع", "تاريخ التعيين": "21/11/2026", "نوع التعاقد": "دائم", "الموبايل": "0100" },
      { "الكود": String(from + 1), "الاسم": "", "الدور": "" },
      { "الكود": String(from + 2), "الاسم": "دور غلط", "الدور": "مش موجود" },
      { "الكود": "99999", "الاسم": "برا المدى" },
    ];
    const dry = await importUsers(db, c, rows, true);
    expect([dry.added.length, dry.updated.length, dry.skipped]).toEqual([1, 0, 3]);
    expect((await db.list("memberships")).length).toBe(c.members.length);
    await importUsers(db, c, rows, false);
    const c2 = await ctx();
    const m = c2.members.find((x) => x.name === "موظف تجربة")!;
    expect(c2.settings.chefCodes[m.id]).toBe(from);
    expect(c2.profiles.find((p) => p.membershipId === m.id)?.hireDate).toBe("2026-11-21");
    // the same code again updates, and an untied column keeps its value
    const again = await importUsers(db, c2, [{ "الكود": String(from), "الاسم": "موظف تجربة 2" }], false);
    expect([again.added.length, again.updated.length]).toEqual([0, 1]);
    const c3 = await ctx();
    const m3 = c3.members.find((x) => x.id === m.id)!;
    expect([m3.name, m3.phone]).toEqual(["موظف تجربة 2", "0100"]);
    const sheet = exportUsers(c3, [m3]);
    expect(sheet[0][USER_HEAD.indexOf("الكود")]).toBe(from);
    expect(sheet[0][USER_HEAD.indexOf("تاريخ التعيين")]).toBe("2026-11-21");
  });
});
