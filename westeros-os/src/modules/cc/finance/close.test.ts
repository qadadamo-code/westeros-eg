import { describe, expect, it } from "vitest";
import { loadDefaultChart, settingsOf } from "./ops";
import { submitEntry, saveDraft, reverseEntry } from "./journalOps";
import { closeYear, monthChecks, monthsOfYear, periodProblem, reopenYear, setPeriod, yearPlan, type CloseData } from "./close";
import { actualByMonth, budgetVsActual, findBudget, fromActual, saveBudget, spread } from "./budget";
import { balanceSheet, incomeStatement } from "./statements";
import { financeDb } from "./testDb";

const boss = { id: null, name: "م", canApprove: true };

describe("month and year close", async () => {
  const db = await financeDb();
  await loadDefaultChart(db);
  const acc = Object.fromEntries((await db.list("finAccounts")).map((a) => [a.code, a.id]));
  const L = (lines: [string, number, number][]) => lines.map(([c, debit, credit]) => ({ account: acc[c], debit, credit }));
  const post = (date: string, lines: [string, number, number][]) => submitEntry(db, null, { date, memo: "x", branchId: null, lines: L(lines) }, boss);
  await post("2025-03-01", [["110101", 100_000, 0], ["3101", 0, 100_000]]);
  await post("2025-06-05", [["110101", 50_000, 0], ["4101", 0, 50_000]]);
  await post("2025-06-07", [["6201", 20_000, 0], ["110101", 0, 20_000]]);
  await post("2026-02-03", [["110101", 9_000, 0], ["4101", 0, 9_000]]);
  const draft = await saveDraft(db, null, { date: "2025-06-20", memo: "d", branchId: null, lines: L([["6201", 5, 0], ["110101", 0, 5]]) }, boss);
  const data = async (): Promise<CloseData> => ({ accounts: await db.list("finAccounts"), entries: await db.list("finEntries"), settings: settingsOf((await db.list("finSettings"))[0]), docs: await db.list("finDocs"), moves: [], items: new Map(), locations: new Map(), lists: null, branches: await db.list("branches") });

  it("a draft in the month stops the close; an uncounted till only warns", async () => {
    let d = await data();
    let checks = monthChecks(d, "2025-06");
    expect(checks.find((c) => c.id === "drafts")?.ok).toBe(false);
    expect(checks.find((c) => c.id === "earlier")?.ok).toBe(false);
    expect(checks.find((c) => c.id === "count")).toMatchObject({ ok: false, required: false });
    expect(periodProblem({ settings: d.settings, checks, canMonth: true, canYear: true }, "2025-06", "closed")).toMatch("السابقة");
    await db.remove("finEntries", draft.id);
    await setPeriod(db, "2025-03", "closed");
    d = await data(); checks = monthChecks(d, "2025-06");
    expect(periodProblem({ settings: d.settings, checks, canMonth: true, canYear: true }, "2025-06", "closed")).toBe("");
    expect(periodProblem({ settings: d.settings, checks, canMonth: false, canYear: false }, "2025-06", "closed")).toMatch("صلاحية");
    await setPeriod(db, "2025-06", "closed");
    await expect(post("2025-06-25", [["6201", 1, 0], ["110101", 0, 1]])).rejects.toThrow("مقفول");
    d = await data();
    expect(periodProblem({ settings: d.settings, checks: [], canMonth: true, canYear: true }, "2025-03", "open")).toMatch("الأحدث");
    expect(periodProblem({ settings: d.settings, checks: [], canMonth: true, canYear: false }, "2025-06", "locked")).toMatch("النهائي");
  });

  it("the year closes into أرباح العام, statements still read the year, and it reopens", async () => {
    let d = await data();
    expect(yearPlan(d, 2025).problem).toBe("");
    for (const m of monthsOfYear(2025)) await setPeriod(db, m, "closed");
    expect(yearPlan(await data(), 2026).problem).toMatch("السنة السابقة");
    await expect(closeYear(db, 2025, boss, "2025-12-31")).rejects.toThrow("بعد نهايتها");
    const e = await closeYear(db, 2025, boss, "2026-01-02");
    expect([e.date, e.kind]).toEqual(["2025-12-31", "closing"]);
    d = await data();
    expect(d.settings.periods["2025-06"]).toBe("locked");
    expect(incomeStatement(d.accounts, d.entries, [{ from: "2025-01-01", to: "2025-12-31" }]).net[0]).toBe(30_000);
    const bs = balanceSheet(d.accounts, d.entries, [{ to: "2025-12-31" }]);
    expect(bs.balanced).toBe(true);
    expect(bs.rows.find((r) => r.id === "open-profit")?.values[0]).toBe(0);
    expect(bs.rows.find((r) => r.code === "3202")?.values[0]).toBe(30_000);
    await expect(reverseEntry(db, e.id, { date: "2026-02-10" }, boss)).rejects.toThrow("الإقفال");
    // next year: last year's profit moves on to retained earnings
    expect(yearPlan(await data(), 2026).problem).toMatch("اقفل شهور السنة");
    for (const m of monthsOfYear(2026)) await setPeriod(db, m, "closed");
    const p = yearPlan(await data(), 2026);
    expect([p.problem, p.carried, p.profit]).toEqual(["", 30_000, 9_000]);
    await expect(reopenYear(db, 2024, boss)).rejects.toThrow("غير مقفولة");
    await reopenYear(db, 2025, boss);
    d = await data();
    expect(d.settings.periods["2025-06"]).toBe("closed");
    expect(balanceSheet(d.accounts, d.entries, [{ to: "2025-12-31" }]).rows.find((r) => r.id === "open-profit")?.values[0]).toBe(30_000);
    expect(yearPlan(d, 2025).problem).toBe("");
  });

  it("budget against actual, rolled up, and a budget from last year's actuals", async () => {
    const accounts = await db.list("finAccounts"), entries = await db.list("finEntries");
    const months = monthsOfYear(2025);
    expect(Object.values(spread(100, months)).reduce((a, b) => a + b, 0)).toBe(100);
    const doc = await saveBudget(db, null, { year: 2025, branchId: null, lines: { [acc["4101"]]: { "2025-06": 40_000, "2025-07": 40_000 }, [acc["6201"]]: { "2025-06": 15_000 }, [acc["6202"]]: { "2025-06": 0 } } });
    const again = await saveBudget(db, null, { year: 2025, branchId: null, lines: { [acc["4101"]]: { "2025-06": 40_000 }, [acc["6201"]]: { "2025-06": 15_000 } } });
    expect(again.id).toBe(doc.id);
    expect(findBudget(await db.list("finDocs"), 2025, null)?.id).toBe(doc.id);
    const r = budgetVsActual(accounts, entries, again.data as never, ["2025-06"], null);
    expect(r.rows.find((x) => x.code === "4101")).toMatchObject({ budget: 40_000, actual: 50_000, diff: 10_000, good: true });
    expect(r.rows.find((x) => x.code === "6201")).toMatchObject({ budget: 15_000, actual: 20_000, good: false });
    expect(r.rows.find((x) => x.code === "6")).toMatchObject({ budget: 15_000, actual: 20_000 });
    expect(r.net).toEqual({ budget: 25_000, actual: 30_000 });
    const next = fromActual(actualByMonth(accounts, entries, months, null), 12, 10);
    expect(next[acc["4101"]]).toEqual({ "2026-06": 55_000 });
  });
});
