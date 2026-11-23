import { describe, expect, it } from "vitest";
import type { MenuCategory, MenuItem } from "@/data/types";
import { discountUnits, groupRow, hiddenOnOf, norm, planImport, type BbMenu } from "./bonbell";
import { groupLimits } from "./GroupDialog";

const cat = (id: string, ar: string, en: string, ref?: string) => ({ id, name: { ar, en }, externalRef: ref ?? null }) as MenuCategory;
const item = (id: string, ar: string, en: string, extra: Partial<MenuItem> = {}) =>
  ({ id, categoryId: "c1", name: { ar, en }, description: { ar: "", en: "" }, price: 19500000, prepMinutes: 15, imageUrl: null, active: true, modifierGroupIds: [], ...extra }) as MenuItem;
const menu: BbMenu = {
  readAt: "2026-11-23",
  sideOptions: [],
  categories: [
    { ref: "9096", name: { en: "Grilled Beef Burger", ar: "" }, image: null, visible: true, items: [
      { ref: "82653", name: { en: "Classic Beef Burger", ar: "كلاسيك بيف برجر" }, price: 195, discountPct: 0, prep: 15, description: "Pure beef", channels: ["Delivery", "Dine in", "Take away"], visible: true, recommended: false, image: null,
        groups: [{ name: "SIZE", required: false, multi: false, min: 0, max: 0, options: [{ name: "Double Beef (300gm)", price: 85, minQty: 0, maxQty: 1 }] }] },
      { ref: "99999", name: { en: "Smoky Beef Burger 🌶️", ar: "سموكي بيف برجر 🌶️" }, price: 205, discountPct: 0, prep: 15, description: "", channels: ["Delivery"], visible: false, recommended: true, image: null, groups: [] },
    ] },
  ],
};

describe("Bonbell import", () => {
  it("matches existing items by Arabic name without emoji, and leaves the rest alone", () => {
    const p = planImport(menu, [cat("c1", "برجر اللحم المشوي", "Grilled beef burgers")], [item("i1", "كلاسيك بيف برجر", "Classic beef burger"), item("i2", "سموكي بيف برجر", "x", { price: 20500000 }), item("i3", "كولا", "Cola")]);
    expect(p.items.map((x) => x.current?.id ?? null)).toEqual(["i1", "i2"]);
    expect(p.untouched.map((i) => i.id)).toEqual(["i3"]);
    expect(p.newCategories).toHaveLength(0);
    expect(p.catIds["9096"]).toBe("c1");
    expect(p.items[0].changes).toContain("الاسم");
    expect(p.groups).toBe(1);
    expect(p.options).toBe(1);
  });
  it("matches by Bonbell id first on a second import", () => {
    const p = planImport(menu, [cat("c1", "برجر", "Grilled Beef Burger", "9096")], [item("i9", "اسم تاني", "other", { externalRef: "82653" })]);
    expect(p.items[0].current?.id).toBe("i9");
    expect(p.newCategories).toHaveLength(0);
  });
  it("turns scenarios, percent discounts and group limits into our columns", () => {
    expect(hiddenOnOf(["Delivery", "Take away"])).toEqual(["dine_in"]);
    expect(hiddenOnOf(["Delivery", "Dine in", "Car Pickup"])).toEqual([]);
    expect(discountUnits(260, 17.307692307692307)).toBe(4500000); // 260 → 215
    expect(groupRow({ name: "EXTRAS", required: false, multi: true, min: 0, max: 0, options: [1, 2, 3].map((n) => ({ name: String(n), price: 0, minQty: 0, maxQty: 1 })) })).toMatchObject({ min: 0, max: 3, multi: true });
    expect(groupRow({ name: "نوع الوجبة", required: true, multi: false, min: 0, max: 0, options: [] })).toMatchObject({ min: 1, max: 1 });
    expect(groupLimits({ required: false, multi: true, min: 0, max: 2 }, 6)).toEqual({ min: 0, max: 2 });
    expect(norm("Smoky Beef Burger 🌶️")).toBe("smoky beef burger");
  });
});

describe("groupRow", () => {
  const opt = (name: string) => ({ name, price: 0, minQty: 0, maxQty: 1 });
  it("an optional group never forces a pick, a required one keeps its count", () => {
    expect(groupRow({ name: "Notes", required: false, multi: true, min: 1, max: 5, options: [opt("a"), opt("b")] })).toMatchObject({ min: 0, max: 5 });
    expect(groupRow({ name: "Choose 2 Sauces", required: true, multi: true, min: 2, max: 2, options: [opt("a"), opt("b"), opt("c")] })).toMatchObject({ min: 2, max: 2 });
    expect(groupRow({ name: "Size", required: false, multi: false, min: 0, max: 0, options: [opt("a")] })).toMatchObject({ min: 0, max: 1 });
  });
});
