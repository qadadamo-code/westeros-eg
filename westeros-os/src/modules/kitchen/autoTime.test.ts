import { describe, expect, it } from "vitest";
import { orderMinutes } from "./autoTime";

describe("kitchen order time (Saqr 2026-11-26)", () => {
  it("first 3 orders 12 min, then +3 per order", () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8].map((n) => orderMinutes(n, 0))).toEqual([12, 12, 12, 15, 18, 21, 24, 27]);
  });
  it("adds 1 minute per distinct category", () => {
    expect(orderMinutes(1, 3)).toBe(15);
    expect(orderMinutes(4, 2)).toBe(17);
  });
});
