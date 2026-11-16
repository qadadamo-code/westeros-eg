/** User types: each has its own code range, ranges never overlap, a user takes the first free code of the range. */
import { describe, expect, it } from "vitest";
import { DEFAULT_LISTS, nextUserCode, overlapping, rangeOf, roleForScreens, screensOf, userTypesOf } from "./lib";
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
