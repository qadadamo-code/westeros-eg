import { describe, expect, it } from "vitest";
import { valueMoves } from "./valuation";

let n = 0;
const mv = (kind: string, qty: number, value: number, o: Partial<{ itemId: string; locationId: string; groupId: string; at: string }> = {}) => ({
  id: `m${++n}`, itemId: "a", locationId: "L1", kind: kind as never, qty, value, unitCost: qty ? Math.abs(value / qty) : 0, groupId: null as string | null, at: `2026-11-${String(n).padStart(2, "0")}T08:00:00.000Z`, createdAt: `2026-11-01T00:00:${String(n).padStart(2, "0")}.000Z`, ...o,
});
const sum = (r: ReturnType<typeof valueMoves>, ms: { id: string }[]) => ms.map((m) => [r.byId.get(m.id)!.stock, r.byId.get(m.id)!.counter]);

describe("what a stock movement is worth under each costing method", () => {
  // 10 at 5, 10 at 8, then 15 out. The warehouse's own average gave the out 97 (recorded).
  const ms = () => { n = 0; return [mv("receive", 10, 50), mv("receive", 10, 80), mv("waste", -15, -97)]; };

  it("average keeps what the warehouse recorded", () => {
    const m = ms();
    const r = valueMoves(m, "average");
    expect(sum(r, m)).toEqual([[50, 50], [80, 80], [-97, -97]]);
    expect(r.positions.get("a|L1")).toEqual({ qty: 5, value: 33 });
  });
  it("fifo takes the oldest receipts first", () => {
    const m = ms();
    const r = valueMoves(m, "fifo");
    expect(sum(r, m)[2]).toEqual([-90, -90]);
    expect(r.positions.get("a|L1")).toEqual({ qty: 5, value: 40 });
  });
  it("last price re-prices the shelf when a new price comes in", () => {
    const m = ms();
    const r = valueMoves(m, "last");
    // the second receipt lifts the first 10 from 5 to 8: +30 on the stock account, a price difference
    expect(sum(r, m)).toEqual([[50, 50], [110, 80], [-120, -120]]);
    expect(r.positions.get("a|L1")).toEqual({ qty: 5, value: 40 });
  });
  it("standard moves everything at the standard cost; an item without one follows the average", () => {
    const m = ms();
    const r = valueMoves(m, "standard", { a: 6 });
    expect(sum(r, m)).toEqual([[60, 50], [60, 80], [-90, -90]]);
    expect(valueMoves(ms(), "standard", {}).positions.get("a|L1")).toEqual({ qty: 5, value: 33 });
  });
  it("a transfer arrives worth what left, under the method", () => {
    n = 0;
    const m = [mv("receive", 10, 50), mv("receive", 10, 80), mv("transfer_out", -4, -26, { groupId: "g" }), mv("transfer_in", 4, 26, { groupId: "g", locationId: "L2" })];
    const r = valueMoves(m, "fifo");
    expect(sum(r, m).slice(2)).toEqual([[-20, -20], [20, 20]]);
    expect(r.positions.get("a|L2")).toEqual({ qty: 4, value: 20 });
  });
  it("prices outs before ins at the same instant", () => {
    n = 0;
    const at = "2026-11-05T08:00:00.000Z";
    const m = [mv("receive", 10, 50, { at: "2026-11-01T08:00:00.000Z" }), mv("transfer_in", 4, 20, { groupId: "g", locationId: "L2", at }), mv("transfer_out", -4, -20, { groupId: "g", at })];
    expect(valueMoves(m, "fifo").positions.get("a|L2")).toEqual({ qty: 4, value: 20 });
  });
});
