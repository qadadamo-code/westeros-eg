import { describe, expect, it } from "vitest";
import { qtyLabel, stockInfoOf } from "./stockInfo";

const items = new Map([["bun", { name: { ar: "عيش", en: "Bun" }, baseUnit: "pc" as const }], ["beef", { name: { ar: "لحمة", en: "Beef" }, baseUnit: "g" as const }]]);

describe("stockInfoOf", () => {
  it("counts portions and marks short", () => {
    const r = { lines: [{ itemId: "bun", qty: 1 }, { itemId: "beef", qty: 150 }], yieldQty: 1 };
    expect(stockInfoOf(r, new Map([["bun", 10], ["beef", 450]]), items)).toMatchObject({ portions: 3, short: false });
    expect(stockInfoOf(r, new Map([["bun", 10], ["beef", 100]]), items)).toMatchObject({ portions: 0, short: true });
    expect(stockInfoOf(r, new Map(), items)?.short).toBe(true);
  });
  it("no recipe means no info", () => {
    expect(stockInfoOf(null, new Map(), items)).toBeNull();
  });
  it("labels big quantities in kg", () => {
    expect(qtyLabel(1500, "g")).toBe("1.5 كجم");
    expect(qtyLabel(150, "g")).toBe("150 جم");
  });
});
