/** User types: each has its own code range, ranges never overlap, a user takes the first free code of the range. */
import { describe, expect, it } from "vitest";
import { codeRanges, nextCodeIn, rangeProblem, DEFAULT_LISTS, nextUserCode, overlapping, rangeOf, roleForScreens, screensOf, userTypesOf } from "./lib";
import { screenAllowed, setAllowedScreens } from "../screens";

describe("user type code ranges", () => {
  const types = userTypesOf(DEFAULT_LISTS);
  it("starts with one hundred per type, back to back", () => {
    expect(types.map(rangeOf)).toEqual([{ from: 1, to: 100 }, { from: 101, to: 200 }, { from: 201, to: 300 }, { from: 301, to: 400 }]);
    expect(types.every((t) => !overlapping(t, types))).toBe(true);
  });
  it("gives a type saved without a range the next free hundred", () => {
    const old = userTypesOf({ ...DEFAULT_LISTS, userTypes: [{ id: "a", name: "أ", code: 1, role: "chef" }, { id: "b", name: "ب", code: 2, role: "manager" }] });
    expect(old.map(rangeOf)).toEqual([{ from: 1, to: 100 }, { from: 101, to: 200 }]);
  });
  it("sees an overlap", () => {
    expect(overlapping({ ...types[1], from: 100 }, types)?.id).toBe("chef");
    expect(overlapping({ ...types[1], from: 150, count: 10 }, types)).toBeNull();
  });
  it("hands out the first free code and keeps a code already in the range", () => {
    const codes = { u1: 1, u2: 2, u3: 4, m1: 201 };
    expect(nextUserCode(types[0], codes)).toBe(3);
    expect(nextUserCode(types[0], codes, "u3")).toBe(4);
    expect(nextUserCode(types[1], codes, "u3")).toBe(101);
    expect(nextUserCode({ ...types[2], count: 1 }, codes)).toBe(0);
  });
});

describe("user type permissions checklist", () => {
  const [chef, kitchen, , admin] = userTypesOf(DEFAULT_LISTS);
  it("starts from what each type could open before", () => {
    expect(screensOf(admin)).toContain("cc-users");
    expect(screensOf(chef)).not.toContain("cc-users");
    expect(screensOf(kitchen)).not.toContain("cc-constants");
    expect(screensOf({ ...chef, screens: ["cc-mfg"] })).toEqual(["cc-mfg"]);
  });
  it("gives the level that can save on the ticked screens", () => {
    expect(roleForScreens(["cc-mfg"], "kitchen")).toBe("kitchen");
    expect(roleForScreens(["cc-mfg", "cc-constants"], "kitchen")).toBe("chef");
    expect(roleForScreens(["cc-mfg"], "chef")).toBe("chef");
    expect(roleForScreens(["cc-users"], "kitchen")).toBe("admin");
    expect(roleForScreens(["cc-stores"], "admin")).toBe("manager");
  });
  it("hides the screens that are not ticked", () => {
    setAllowedScreens(["cc-mfg"]);
    expect(screenAllowed("cc-mfg")).toBe(true);
    expect(screenAllowed("cc-stores")).toBe(false);
    setAllowedScreens(null);
    expect(screenAllowed("cc-stores")).toBe(true);
  });
});

describe("category code ranges", () => {
  it("gives each category its own hundred, and keeps a saved range", () => {
    expect(codeRanges(undefined, ["a", "b", "c"])).toEqual({ a: { from: 1, count: 100 }, b: { from: 101, count: 100 }, c: { from: 201, count: 100 } });
    expect(codeRanges({ b: { from: 500, count: 50 } }, ["a", "b"])).toEqual({ b: { from: 500, count: 50 }, a: { from: 601, count: 100 } });
  });
  it("keeps the thousand a category's codes already sit in", () => {
    const r = codeRanges(undefined, ["dairy", "new"], (k) => (k === "dairy" ? { from: 10001, count: 999 } : null), 1000);
    expect(r).toEqual({ dairy: { from: 10001, count: 999 }, new: { from: 11001, count: 1000 } });
  });
  it("gives the next free code of the category and refuses overlap", () => {
    expect(nextCodeIn({ from: 101, count: 3 }, ["M101", "102", null])).toBe(103);
    expect(nextCodeIn({ from: 101, count: 2 }, ["101", "102"])).toBe(0);
    const all = { a: { from: 1, count: 100 }, b: { from: 101, count: 100 } };
    expect(rangeProblem("b", { from: 100, count: 10 }, all, (k) => k)).toContain("متداخلة");
    expect(rangeProblem("b", { from: 300, count: 10 }, all, (k) => k)).toBe("");
  });
});

import { labelCopies, labelSizes } from "@/modules/production/Label";
import { seesPrices } from "./lib";

describe("stickers and prices", () => {
  it("prints one sticker per storage unit, rounded up", () => {
    expect(labelCopies({ unit: "pc", count: 180, weightKg: null }, 35)).toBe(6);
    expect(labelCopies({ unit: "pc", count: 70, weightKg: null }, 35)).toBe(2);
    expect(labelCopies({ unit: "kg", count: null, weightKg: 12.5 }, 5)).toBe(3);
    expect(labelCopies({ unit: "pc", count: 180, weightKg: null }, null)).toBe(1);
  });
  it("offers the added sticker sizes once", () => {
    const ids = labelSizes([{ w: 50, h: 25 }, { w: 70, h: 35 }]).map((s) => s.id);
    expect(ids.filter((x) => x === "50x25")).toHaveLength(1);
    expect(ids).toContain("70x35");
  });
  it("shows prices only to types given the permission", () => {
    expect(seesPrices({ id: "a", name: "a", role: "chef" })).toBe(false);
    expect(seesPrices({ id: "a", name: "a", role: "chef", seePrices: true })).toBe(true);
    expect(seesPrices({ id: "a", name: "a", role: "admin" })).toBe(true);
    expect(seesPrices({ id: "a", name: "a", role: "admin", seePrices: false })).toBe(false);
  });
});
