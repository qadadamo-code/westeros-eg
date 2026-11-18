import { describe, expect, it } from "vitest";
import { applyMoves } from "@/modules/inventory/stock";
import { saveBatch, voidBatch } from "@/modules/production/ops";
import { T } from "@/modules/production/testKitchen";
import { WESTEROS_BRANCH_ID as B } from "@/data/westeros/seed";
import { trialBalance } from "./journal";
import { loadDefaultChart, saveSettings } from "./ops";
import { entriesOfSource, syncStock } from "./sync";
import { financeDb } from "./testDb";
import { rollup, movement } from "./tree";

const at = (day: number, h = 8) => `2026-11-${String(day).padStart(2, "0")}T${String(h).padStart(2, "0")}:00:00.000Z`;

describe("stock movements post themselves", async () => {
  const db = await financeDb();
  await loadDefaultChart(db);
  const locs = (await db.list("storageLocations")).filter((l) => l.id !== T.fridge);
  const other = locs[0];
  const balance = async (code: string) => {
    const accounts = await db.list("finAccounts");
    const t = rollup(accounts, movement(await db.list("finEntries"))).get(code) ?? { debit: 0, credit: 0 };
    return t.debit - t.credit;
  };
  const stockValue = async () => (await db.list("stockLevels")).reduce((a, l) => a + l.value, 0);

  it("does nothing before a start date is set", async () => {
    await applyMoves(db, [{ itemId: T.mayo, locationId: T.fridge, branchId: B, kind: "opening", qty: 10_000, value: 100_000_000, refType: "opening", refId: "o1", groupId: "o1", at: at(1) }]);
    expect((await syncStock(db)).posted).toBe(0);
  });

  it("brings in what stood before the start date once, then one entry per action", async () => {
    await saveSettings(db, { startDate: "2026-11-05", costing: "average" });
    await applyMoves(db, [{ itemId: T.mayo, locationId: T.fridge, branchId: B, kind: "waste", qty: -1000, reason: "other", refType: "waste", refId: "w1", groupId: "w1", at: at(6) }]);
    const r = await syncStock(db);
    expect(r.problems).toEqual([]);
    expect(r.posted).toBe(2);
    expect((await syncStock(db)).posted).toBe(0);
    const entries = await db.list("finEntries");
    expect(entries.map((e) => [e.kind, e.date, e.sourceType]).sort()).toEqual([["auto", "2026-11-06", "stock:waste"], ["opening", "2026-11-05", "stock:start"]]);
    expect(await balance("110601")).toBe(90_000_000);
    expect(await balance("5104")).toBe(10_000_000);
    expect(await balance("3203")).toBe(-100_000_000);
    // the warehouse got its own account under raw materials
    const wh = (await db.list("finAccounts")).find((a) => a.linkType === "warehouse" && a.linkId === T.fridge)!;
    expect([wh.parentCode, wh.code, wh.allowManual]).toEqual(["110601", "11060101", false]);
  });

  it("a transfer moves the value between the two warehouses and leaves nothing in transit", async () => {
    const out = await applyMoves(db, [{ itemId: T.mayo, locationId: T.fridge, branchId: B, kind: "transfer_out", qty: -2000, refType: "transfer", refId: "t1", groupId: "t1", at: at(7) }]);
    await applyMoves(db, [{ itemId: T.mayo, locationId: other.id, branchId: other.branchId, kind: "transfer_in", qty: 2000, value: -out[0].value, refType: "transfer", refId: "t1", groupId: "t1", at: at(7) }]);
    expect((await syncStock(db)).posted).toBe(1);
    expect(await balance("1107")).toBe(0);
    expect(await balance("110601")).toBe(90_000_000);
    const [e] = entriesOfSource(await db.list("finEntries"), "t1");
    expect(e.lines.map((l) => [l.debit, l.credit])).toEqual([[20_000_000, 0], [0, 20_000_000]]);
    expect(e.memo).toContain("تحويل مخزني");
  });

  it("a transfer that has only left sits in transit until it arrives", async () => {
    const out = await applyMoves(db, [{ itemId: T.mayo, locationId: T.fridge, branchId: B, kind: "transfer_out", qty: -1000, refType: "transfer", refId: "t2", groupId: "t2", at: at(8) }]);
    await syncStock(db);
    expect(await balance("1107")).toBe(10_000_000);
    await applyMoves(db, [{ itemId: T.mayo, locationId: other.id, branchId: other.branchId, kind: "transfer_in", qty: 1000, value: -out[0].value, refType: "transfer", refId: "t2", groupId: "t2", at: at(9) }]);
    expect((await syncStock(db)).posted).toBe(1);
    expect(await balance("1107")).toBe(0);
    expect(entriesOfSource(await db.list("finEntries"), "t2").map((e) => e.sourceId)).toEqual(["t2", "t2#2"]);
  });

  it("a batch takes the raw materials out, brings the product in, and its void undoes it", async () => {
    const before = await balance("1106");
    const b = await saveBatch(db, { method: "weight", productId: T.sauce, meals: 1, netKg: 0.9, lines: [{ itemId: T.mayo, qty: 1000 }], packaging: [] }, { chef: { id: "c", name: "شيف 1" }, branchId: B, madeAt: at(10) });
    const r = await syncStock(db);
    expect(r.problems).toEqual([]);
    const [e] = entriesOfSource(await db.list("finEntries"), b.id);
    expect(e.memo).toContain(b.number);
    expect(await balance("110602")).toBe(b.totalCost);
    expect(await balance("1106")).toBe(before);
    expect(await balance("1106")).toBe(await stockValue());
    await voidBatch(db, b.id, { reason: "اختبار", by: null });
    await syncStock(db);
    expect(await balance("110602")).toBe(0);
    expect(await balance("1106")).toBe(await stockValue());
  });

  it("a stock count posts its difference, and the books stay balanced", async () => {
    await applyMoves(db, [{ itemId: T.mayo, locationId: T.fridge, branchId: B, kind: "count_adjust", qty: 0, counted: 5000, refType: "count", refId: "c1", groupId: "c1", at: at(11) }]);
    await syncStock(db);
    expect(await balance("1106")).toBe(await stockValue());
    expect(Math.abs(await balance("5105")) + Math.abs(await balance("4202"))).toBeGreaterThan(0);
    const tb = trialBalance(await db.list("finAccounts"), await db.list("finEntries"), {});
    expect(tb.balanced).toBe(true);
  });

  it("a movement in a closed month is posted on the first open day", async () => {
    await saveSettings(db, { periods: { "2026-11": "closed" } });
    await applyMoves(db, [{ itemId: T.mayo, locationId: T.fridge, branchId: B, kind: "waste", qty: -100, reason: "other", refType: "waste", refId: "w2", groupId: "w2", at: at(12) }]);
    await syncStock(db);
    const [e] = entriesOfSource(await db.list("finEntries"), "w2");
    expect(e.date).toBe("2026-12-01");
    expect(e.memo).toContain("12/11/2026");
  });
});
