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

import { linkPlan, modFieldsOf } from "./sideOptions";
import type { Modifier } from "@/data/types";
describe("side options", () => {
  const mod = (id: string, en: string, price: number, extra: Partial<Modifier> = {}) => ({ id, groupId: "g", name: { ar: en, en }, price, isDefault: false, available: true, sort: 1, ...extra }) as Modifier;
  it("ties every option to the list by name, adds missing ones, and finds the menu item an option stands for", () => {
    const p = linkPlan([{ id: "s1", name: "Add Jalapeno", price: 15 }], [mod("m1", "add jalapeno", 1500000), mod("m2", "Classic Beef Burger", 0), mod("m3", "Spicy", 0)], [{ id: "i1", name: { ar: "كلاسيك بيف برجر", en: "Classic Beef Burger" } }]);
    expect(p.library).toHaveLength(3);
    expect(p.links.find((l) => l.id === "m1")?.sideOptionId).toBe("s1");
    expect(p.links.find((l) => l.id === "m2")?.menuItemId).toBe("i1");
    expect(p.library.find((o) => o.name === "Spicy")?.menuItemId).toBeNull();
    // a second run changes nothing
    const linked = [mod("m1", "Add Jalapeno", 1500000, { sideOptionId: "s1", menuItemId: null })];
    expect(linkPlan(p.library, linked, []).links).toHaveLength(0);
  });
  it("gives the option its price and names from the list", () => {
    expect(modFieldsOf({ id: "s", name: "Extra Cheese", nameAr: "جبنة زيادة", price: 20, available: false })).toMatchObject({ name: { ar: "جبنة زيادة", en: "Extra Cheese" }, price: 2000000, available: false, sideOptionId: "s" });
  });
});

import { blockRange, planCodes } from "./codes";
describe("menu codes", () => {
  it("gives each category a block of 1000 and numbers its items in order", () => {
    const cats = [{ id: "beef", sort: 1, code: null }, { id: "chicken", sort: 2, code: null }];
    const items = [
      { id: "classic", categoryId: "beef", sort: 1, sku: null },
      { id: "smoky", categoryId: "beef", sort: 2, sku: "" },
      { id: "c1", categoryId: "chicken", sort: 1, sku: "77" },
      { id: "c2", categoryId: "chicken", sort: 2, sku: "1000" },
    ];
    const p = planCodes(cats, items);
    expect(p.cats).toEqual([{ id: "beef", code: 1 }, { id: "chicken", code: 1000 }]);
    expect(p.fill).toEqual([{ id: "classic", sku: "1" }, { id: "smoky", sku: "2" }]);
    expect(p.fix).toEqual([{ id: "c1", from: "77", sku: "1001" }]);
    expect(blockRange(2000)).toEqual({ from: 2000, to: 2999 });
    expect(blockRange(1)).toEqual({ from: 1, to: 999 });
  });
});
