import { describe, expect, it } from "vitest";
import { scaleLines } from "./build";

describe("scaling recipe lines", () => {
  it("keeps fractions by default", () => {
    expect(scaleLines([{ itemId: "a", qty: 1 }], 2.3)).toEqual([{ itemId: "a", qty: 2.3 }]);
  });
  it("rounds storage packaging up to a whole number", () => {
    expect(scaleLines([{ itemId: "a", qty: 1 }, { itemId: "b", qty: 0.2 }], 2.3, true)).toEqual([{ itemId: "a", qty: 3 }, { itemId: "b", qty: 1 }]);
    // an exact whole stays as it is (no float drift: 0.2 × 5)
    expect(scaleLines([{ itemId: "b", qty: 0.2 }], 5, true)).toEqual([{ itemId: "b", qty: 1 }]);
    expect(scaleLines([{ itemId: "a", qty: 1 }], 0, true)).toEqual([{ itemId: "a", qty: 0 }]);
  });
});
