import { describe, expect, it } from "vitest";
import type { FinDoc } from "@/data/financeTypes";
import { deliveryRecon, itemSales, priceChanges } from "./analysis";

const line = (itemId: string, qty: number, net: number) => ({ id: itemId, itemId, name: { ar: itemId, en: itemId }, modifiers: [], notes: "", qty, unitPrice: net / qty, category: "", vatExempt: false, gross: net, discountTotal: 0, net, service: 0, vat: 0, total: net });
const rec = (kind: "SC" | "RC", lines: ReturnType<typeof line>[]) => ({ kind, bill: { mode: "takeaway" as const, lines, gross: 0, discount: 0, net: 0, service: 0, vat: 0, deliveryFee: 0, deliveryVat: 0, total: 0, payable: 0, rounding: 0 } });

describe("itemSales", () => {
  it("nets returns, costs from recipes and classes the menu", () => {
    const r = itemSales([rec("SC", [line("a", 10, 10000), line("b", 2, 4000), line("c", 10, 5000)]), rec("RC", [line("a", 1, 1000)]), rec("SC", [line("d", 1, 500)])], (id) => ({ a: 300, b: 500, c: 300 } as Record<string, number>)[id] ?? null);
    const a = r.rows.find((x) => x.itemId === "a")!;
    expect([a.qty, a.sales, a.cost, a.costBp]).toEqual([9, 9000, 2700, 3000]);
    expect(r.rows.find((x) => x.itemId === "d")!.cost).toBeNull();
    expect(a.cls).toBe("star");
    expect(r.rows.find((x) => x.itemId === "b")!.cls).toBe("puzzle");
    expect(r.rows.find((x) => x.itemId === "c")!.cls).toBe("plowhorse");
    expect([r.sales, r.cost, r.costed]).toEqual([18500, 6700, 18000]);
  });
});

describe("deliveryRecon", () => {
  it("gives the month's final commission rate after its settlements", () => {
    const entries = [
      { date: "2026-11-03", status: "posted", lines: [{ account: "tal", debit: 60000, credit: 0 }], sourceType: "sales-day", reverses: null, reversedBy: null },
      { date: "2026-11-20", status: "posted", lines: [{ account: "tal", debit: 40000, credit: 0 }], sourceType: "sales-day", reverses: null, reversedBy: null },
      { date: "2026-11-21", status: "posted", lines: [{ account: "tal", debit: 5000, credit: 0 }], sourceType: "sales-day", reverses: null, reversedBy: "x" },
      { date: "2026-12-02", status: "posted", lines: [{ account: "tal", debit: 0, credit: 100000 }], sourceType: "settlement", reverses: null, reversedBy: null },
    ] as never[];
    const docs = [{ kind: "settlement", status: "posted", date: "2026-12-02", data: { fromId: "tal", received: 77200, commission: 20000, commissionVat: 2800, periodFrom: "2026-11-01", periodTo: "2026-11-30" } }] as unknown as FinDoc[];
    const [m] = deliveryRecon("tal", entries, docs);
    expect([m.month, m.sales, m.settled, m.open, m.rateBp]).toEqual(["2026-11", 100000, 100000, 0, 2280]);
  });
});

describe("priceChanges", () => {
  it("compares the last invoice price to the one before", () => {
    const doc = (date: string, price: number) => ({ kind: "purchase", status: "posted", date, data: { supplierId: "s", lines: [{ type: "item", itemId: "beef", qty: 1, price, vatBp: 0 }] } }) as unknown as FinDoc;
    const [c] = priceChanges([doc("2026-11-01", 40000), doc("2026-11-10", 40000), doc("2026-11-20", 44000)]);
    expect([c.prev, c.price, c.changeBp, c.prevDate]).toEqual([40000, 44000, 1000, "2026-11-10"]);
  });
});
