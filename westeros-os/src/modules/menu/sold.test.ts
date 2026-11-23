import { describe, expect, it } from "vitest";
import type { OrderItem } from "@/data/types";
import { comboMods, fameOf, soldUnits } from "./sold";

const line = (itemId: string, qty: number, inside: string[] = [], daysAgo = 1, status: OrderItem["status"] = "sent") =>
  ({ itemId, qty, status, createdAt: new Date(Date.UTC(2026, 10, 23) - daysAgo * 86_400_000).toISOString(),
    modifiers: inside.map((id) => ({ groupId: "g", modifierId: "m", name: { ar: id, en: id }, price: 0, itemId: id })) }) as OrderItem;

describe("soldUnits", () => {
  it("counts an item on its own and inside a box, and skips voided lines", () => {
    const s = soldUnits([line("classic", 2), line("duo", 1, ["classic", "smoky"]), line("duo", 2, ["classic", "classic"]), line("classic", 5, [], 1, "void")]);
    expect(s.get("classic")).toEqual({ direct: 2, inside: 5 });
    expect(s.get("smoky")).toEqual({ direct: 0, inside: 1 });
    expect(s.get("duo")).toEqual({ direct: 3, inside: 0 });
  });
});

describe("comboMods", () => {
  it("puts each part of a box on the line, at price 0", () => {
    const m = comboMods({ comboOf: [{ itemId: "a", qty: 2 }, { itemId: "x", qty: 1 }] }, [{ id: "a", name: { ar: "أ", en: "A" } }]);
    expect(m).toHaveLength(2);
    expect(m.every((x) => x.itemId === "a" && x.price === 0)).toBe(true);
  });
});

describe("fameOf", () => {
  it("marks the top sellers and a rising item", () => {
    const now = new Date(Date.UTC(2026, 10, 23));
    const lines = [line("a", 10, [], 20), line("b", 6, [], 15), line("c", 4, [], 2), line("d", 1, [], 2)];
    const f = fameOf(lines, now);
    expect(f.get("a")).toBe("top");
    expect(f.get("c")).toBe("top");
    expect(f.has("d")).toBe(false);
    const many = ["p1", "p2", "p3", "p4", "p5"].map((id) => line(id, 20, [], 20));
    const f2 = fameOf([...many, line("new", 4, [], 1)], now);
    expect(f2.get("new")).toBe("trend");
  });
});
