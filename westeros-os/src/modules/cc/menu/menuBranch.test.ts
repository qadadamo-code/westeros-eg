import { describe, expect, it } from "vitest";
import { branchMenu, copyMenu, mainBranchOf } from "./menuBranch";

const base = { restaurantId: "r", createdAt: "", updatedAt: "" };
const cats = [{ ...base, id: "c1", name: { ar: "برجر", en: "" }, sort: 1, color: "", icon: "", stationId: "s1", active: true }];
const groups = [{ ...base, id: "g1", name: { ar: "إضافات", en: "" }, min: 0, max: 1, sort: 1 }, { ...base, id: "g2", name: { ar: "ب", en: "" }, min: 0, max: 1, sort: 1, branchId: "b2" }];
const items = [{ ...base, id: "i1", categoryId: "c1", modifierGroupIds: ["g1"], comboOf: [{ itemId: "i1", qty: 1 }], stationId: "s1" }, { ...base, id: "i2", categoryId: "c1", modifierGroupIds: [], branchId: "b2" }];
const mods = [{ ...base, id: "m1", groupId: "g1", menuItemId: "i1" }, { ...base, id: "m2", groupId: "g2" }];
const all = { cats, items, groups, mods } as never;

describe("menu per branch", () => {
  it("rows without a branch are the main branch's menu", () => {
    expect(mainBranchOf([{ id: "k", isDefault: false, isCentral: true }, { id: "b1", isDefault: true }, { id: "b2", isDefault: false }])).toBe("b1");
    const m = branchMenu(all, "b1", "b1");
    expect(m.items.map((i) => i.id)).toEqual(["i1"]);
    expect(m.mods.map((x) => x.id)).toEqual(["m1"]);
    expect(branchMenu(all, "b2", "b1").items.map((i) => i.id)).toEqual(["i2"]);
  });
  it("copies a menu with its links pointing to the copies", async () => {
    const rows: { c: string; r: Record<string, unknown> }[] = [];
    const db = { insert: async (c: string, r: Record<string, unknown>) => (rows.push({ c, r }), r) } as never;
    const n = await copyMenu(db, branchMenu(all, "b1", "b1"), "b3");
    expect(n).toBe(1);
    const cat = rows.find((x) => x.c === "menuCategories")!.r;
    const grp = rows.find((x) => x.c === "modifierGroups")!.r;
    const item = rows.find((x) => x.c === "menuItems")!.r;
    const mod = rows.find((x) => x.c === "modifiers")!.r;
    expect(cat.branchId).toBe("b3");
    expect(cat.id).not.toBe("c1");
    expect(cat.stationId).toBeNull();
    expect(item.categoryId).toBe(cat.id);
    expect(item.modifierGroupIds).toEqual([grp.id]);
    expect((item.comboOf as { itemId: string }[])[0].itemId).toBe(item.id);
    expect(mod.groupId).toBe(grp.id);
    expect(mod.menuItemId).toBe(item.id);
    expect(mod.id).toBeUndefined();
  });
});
