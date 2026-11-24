import { describe, expect, it } from "vitest";
import { branchMenu, mainBranchOf, syncMenu } from "./menuBranch";

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
  it("updates a branch from another: new items added with their options, existing ones updated, nothing doubled", async () => {
    const rows: { op: string; c: string; id?: string; r?: Record<string, unknown> }[] = [];
    const db = {
      insert: async (c: string, r: Record<string, unknown>) => (rows.push({ op: "insert", c, r }), r),
      update: async (c: string, id: string, r: Record<string, unknown>) => (rows.push({ op: "update", c, id, r }), r),
      remove: async (c: string, id: string) => void rows.push({ op: "remove", c, id }),
    } as never;
    const src = { cats, items: [{ ...items[0], sku: "1001", name: { ar: "كلاسيك", en: "" }, price: 200 }, { ...base, id: "i9", categoryId: "c1", modifierGroupIds: [], sku: "1002", name: { ar: "جديد", en: "" } }], groups: [groups[0]], mods: [mods[0]] } as never;
    const dst = { cats: [{ ...cats[0], id: "dc1", stationId: "s9" }], items: [{ ...base, id: "d1", categoryId: "dc1", modifierGroupIds: ["dg1"], sku: "1001", name: { ar: "كلاسيك", en: "" }, price: 150, stationId: "s9" }], groups: [{ ...groups[0], id: "dg1" }], mods: [] } as never;
    const r = await syncMenu(db, src, dst, "b3");
    expect(r).toEqual({ added: 1, updated: 1 });
    expect(rows.filter((x) => x.c === "menuCategories" && x.op === "insert")).toHaveLength(0);
    const upd = rows.find((x) => x.c === "menuItems" && x.op === "update")!;
    expect(upd.id).toBe("d1");
    expect(upd.r!.price).toBe(200);
    expect(upd.r!.categoryId).toBe("dc1");
    expect("stationId" in upd.r!).toBe(false);
    const grp = rows.find((x) => x.c === "modifierGroups" && x.op === "insert")!.r!;
    expect(upd.r!.modifierGroupIds).toEqual([grp.id]);
    expect((upd.r!.comboOf as { itemId: string }[])[0].itemId).toBe("d1");
    const ins = rows.filter((x) => x.c === "menuItems" && x.op === "insert");
    expect(ins).toHaveLength(1);
    expect(ins[0].r!.branchId).toBe("b3");
    expect(rows.find((x) => x.c === "modifiers")!.r!.menuItemId).toBe("d1");
    expect(rows.filter((x) => x.op === "remove").map((x) => x.id)).toEqual(["dg1"]);
  });
});
