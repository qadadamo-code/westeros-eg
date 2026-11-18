import { describe, expect, it } from "vitest";
import { loadDefaultChart } from "./ops";
import { submitEntry } from "./journalOps";
import { allocationLines, balanceSheet, cashFlow, cashMovement, incomeStatement, kpis, split } from "./statements";
import { financeDb } from "./testDb";
import { DEFAULT_LINKS } from "./chart";

const boss = { id: null, name: "م", canApprove: true };

describe("financial statements", async () => {
  const db = await financeDb();
  await loadDefaultChart(db);
  const acc = Object.fromEntries((await db.list("finAccounts")).map((a) => [a.code, a.id]));
  const post = (date: string, lines: [string, number, number, string?][]) => submitEntry(db, null, { date, memo: "x", branchId: null, lines: lines.map(([c, debit, credit, branchId]) => ({ account: acc[c], debit, credit, ...(branchId ? { branchId } : {}) })) }, boss);
  await post("2026-11-01", [["110101", 100_000, 0], ["3101", 0, 100_000]]);            // capital in cash
  await post("2026-11-05", [["110101", 50_000, 0], ["4101", 0, 50_000, "b1"]]);       // cash sales, branch 1
  await post("2026-11-06", [["5101", 15_000, 0, "b1"], ["2101", 0, 15_000]]);         // cost on credit
  await post("2026-11-07", [["6201", 10_000, 0, "b1"], ["110101", 0, 10_000]]);       // rent paid
  await post("2026-11-08", [["1201", 30_000, 0], ["110101", 0, 30_000]]);             // equipment bought
  await post("2026-12-02", [["110101", 7_000, 0], ["4101", 0, 7_000, "b2"]]);
  const accounts = await db.list("finAccounts");
  const entries = await db.list("finEntries");
  const nov = { from: "2026-11-01", to: "2026-11-30" };

  it("income statement: revenue, cost, gross and net, per column", () => {
    const r = incomeStatement(accounts, entries, [nov, { from: "2026-12-01", to: "2026-12-31" }, { ...nov, branchId: "b2" }]);
    expect([r.revenue, r.cogs, r.gross, r.expenses, r.net]).toEqual([[50_000, 7_000, 0], [15_000, 0, 0], [35_000, 7_000, 0], [10_000, 0, 0], [25_000, 7_000, 0]]);
    expect(r.rows.find((x) => x.code === "4101")?.values).toEqual([50_000, 7_000, 0]);
    expect(r.rows.find((x) => x.code === "4102")).toBeUndefined();
  });
  it("balance sheet balances with the profit that is not closed yet", () => {
    const r = balanceSheet(accounts, entries, [{ to: "2026-11-30" }, { to: "2026-12-31" }]);
    expect(r.balanced).toBe(true);
    expect([r.assets[0], r.liabilities[0], r.equity[0]]).toEqual([140_000, 15_000, 125_000]);
    expect(r.assets[1]).toBe(147_000);
  });
  it("cash flow explains the change in cash by activity", () => {
    const r = cashFlow(accounts, entries, nov);
    expect([r.opening, r.operating, r.investing, r.financing, r.change, r.closing, r.unexplained]).toEqual([0, 40_000, -30_000, 100_000, 110_000, 110_000, 0]);
    expect(cashFlow(accounts, entries, { from: "2026-12-01", to: "2026-12-31" }).opening).toBe(110_000);
  });
  it("cash movement by day", () => {
    const r = cashMovement([acc["110101"]], entries, { from: "2026-11-05", to: "2026-11-30" });
    expect([r.opening, r.in, r.out, r.closing, r.rows.length]).toEqual([100_000, 50_000, 40_000, 110_000, 3]);
  });
  it("restaurant indicators", () => {
    const k = kpis(accounts, entries, { links: DEFAULT_LINKS }, nov);
    expect([k.foodCostBp, k.rentBp, k.grossBp, k.netBp, k.cash, k.payables]).toEqual([3000, 2000, 7000, 5000, 110_000, 15_000]);
    // 10,000 of expenses a month at a 70% margin
    expect(k.breakEven).toBe(Math.round(10_000 / 0.7));
  });
  it("splits an amount by weights without losing a unit", () => {
    expect(split(100, { a: 1, b: 1, c: 1 })).toEqual({ a: 33, b: 33, c: 34 });
    const l = allocationLines("rent", 100, { branchId: "hq" }, { b1: 3, b2: 1 }, "branch");
    expect(l.map((x) => [x.branchId, x.debit, x.credit])).toEqual([["b1", 75, 0], ["b2", 25, 0], ["hq", 0, 100]]);
  });
});
