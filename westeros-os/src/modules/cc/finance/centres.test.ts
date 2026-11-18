import { describe, expect, it } from "vitest";
import { loadDefaultChart, saveSettings } from "./ops";
import { submitEntry } from "./journalOps";
import { addSuggestedCentres, allocateKitchen, allocateShared, bookedOn, centreProblem, kitchenPlan, removeCentre, saveCentre, sharedPlan, supplyByBranch } from "./centres";
import { incomeStatement } from "./statements";
import { financeDb } from "./testDb";

const boss = { id: null, name: "م", canApprove: true };
const nov = { from: "2026-11-01", to: "2026-11-30" };

describe("cost centres", async () => {
  const db = await financeDb();
  it("two levels, unique codes, used centres stay", async () => {
    expect(await addSuggestedCentres(db, ["المطبخ", "الصالة"])).toBe(2);
    expect(await addSuggestedCentres(db, ["المطبخ", "التوصيل"])).toBe(1);
    const [a, b] = await db.list("finCentres");
    const child = await saveCentre(db, null, { code: "10", nameAr: "شواية", parentId: a.id, branchId: null, active: true });
    const all = await db.list("finCentres");
    expect(centreProblem({ code: a.code, nameAr: "x", parentId: null }, all)).toMatch("مستخدم");
    expect(centreProblem({ code: "77", nameAr: "x", parentId: child.id }, all)).toMatch("مستويين");
    expect(centreProblem({ id: a.id, code: a.code, nameAr: "x", parentId: b.id }, all)).toMatch("تحته");
    await expect(removeCentre(db, a)).rejects.toThrow("تحته");
    await removeCentre(db, child);
    expect((await db.list("finCentres")).length).toBe(3);
  });
});

describe("allocation", async () => {
  const db = await financeDb();
  await loadDefaultChart(db);
  const acc = Object.fromEntries((await db.list("finAccounts")).map((a) => [a.code, a.id]));
  const post = (date: string, lines: [string, number, number, string?][]) => submitEntry(db, null, { date, memo: "x", branchId: null, lines: lines.map(([c, debit, credit, branchId]) => ({ account: acc[c], debit, credit, ...(branchId ? { branchId } : {}) })) }, boss);
  const [main] = await db.list("branches");
  const k = await db.insert("branches", { ...main, id: undefined as never, name: { ar: "المطبخ المركزي", en: "" }, isDefault: false, isCentral: true, code: 9 });
  const b2 = await db.insert("branches", { ...main, id: undefined as never, name: { ar: "فرع 2", en: "" }, isDefault: false, isCentral: false, code: 2 });
  await post("2026-11-05", [["110101", 300_000, 0], ["4101", 0, 300_000, main.id]]);
  await post("2026-11-05", [["110101", 100_000, 0], ["4101", 0, 100_000, b2.id]]);
  await post("2026-11-07", [["6201", 40_000, 0], ["110101", 0, 40_000]]);            // rent no branch owns
  await post("2026-11-08", [["6201", 10_001, 0, k.id], ["110101", 0, 10_001]]);       // kitchen rent

  it("splits a shared expense by sales, to the last unit", async () => {
    const j = { accounts: await db.list("finAccounts"), entries: await db.list("finEntries"), branchIds: [main.id, k.id, b2.id] };
    expect(bookedOn(j.entries, acc["6201"], nov, null)).toBe(40_000);
    const plan = sharedPlan(j, { accountId: acc["6201"], ...nov, sourceBranchId: null, target: "branch", by: "sales", shares: {} });
    expect(plan.weights).toEqual({ [main.id]: 300_000, [b2.id]: 100_000 });
    expect(sharedPlan(j, { accountId: acc["6201"], ...nov, sourceBranchId: null, target: "branch", by: "shares", shares: {}, amount: 50_000 }).problem).toMatch("أكبر");
    await allocateShared(db, { accountId: acc["6201"], ...nov, sourceBranchId: null, target: "branch", by: "sales", shares: {} }, "", boss);
    const entries = await db.list("finEntries");
    expect([bookedOn(entries, acc["6201"], nov, null), bookedOn(entries, acc["6201"], nov, main.id), bookedOn(entries, acc["6201"], nov, b2.id)]).toEqual([0, 30_000, 10_000]);
  });

  it("hands the central kitchen's month to the branches, once", async () => {
    await expect(allocateKitchen(db, "2026-11", "2026-11-18")).rejects.toThrow("متوقف");
    await saveSettings(db, { kitchenAllocation: "fixed", kitchenShares: { [main.id]: 2, [b2.id]: 1, [k.id]: 5 } });
    const e = await allocateKitchen(db, "2026-11", "2026-11-18");
    expect(e?.date).toBe("2026-11-18");
    let entries = await db.list("finEntries");
    expect([bookedOn(entries, acc["6201"], nov, k.id), bookedOn(entries, acc["6201"], nov, main.id), bookedOn(entries, acc["6201"], nov, b2.id)]).toEqual([0, 30_000 + 6_667, 10_000 + 3_334]);
    await expect(allocateKitchen(db, "2026-11", "2026-11-18")).rejects.toThrow("لم توزع");
    await post("2026-11-20", [["6201", 900, 0, k.id], ["110101", 0, 900]]);
    const again = await allocateKitchen(db, "2026-11", "2026-12-05");
    expect([again?.sourceId, again?.date]).toEqual(["2026-11#2", "2026-11-30"]);
    entries = await db.list("finEntries");
    const accounts = await db.list("finAccounts");
    expect(incomeStatement(accounts, entries, [{ ...nov, branchId: k.id }], 1).expenses[0]).toBe(0);
    expect(incomeStatement(accounts, entries, [nov], 1).expenses[0]).toBe(50_901);
  });

  it("weights by what each branch received from the kitchen", async () => {
    const locations = new Map([["k1", { branchId: k.id }], ["m1", { branchId: main.id }], ["s2", { branchId: b2.id }]]);
    const mv = (id: string, kind: "transfer_out" | "transfer_in", locationId: string, value: number, groupId: string, at = "2026-11-10T09:00:00Z") => ({ id, kind, locationId, value, groupId, refId: null, at });
    const moves = [mv("1", "transfer_out", "k1", -500, "g1"), mv("2", "transfer_in", "m1", 500, "g1"), mv("3", "transfer_out", "k1", -300, "g2"), mv("4", "transfer_in", "s2", 300, "g2"), mv("5", "transfer_out", "m1", -900, "g3"), mv("6", "transfer_in", "s2", 900, "g3"), mv("7", "transfer_out", "k1", -100, "g4", "2026-12-01T09:00:00Z"), mv("8", "transfer_in", "s2", 100, "g4", "2026-12-01T09:00:00Z")];
    expect(supplyByBranch(moves, locations, new Set([k.id]), nov)).toEqual({ [main.id]: 500, [b2.id]: 300 });
    const plan = kitchenPlan({ accounts: await db.list("finAccounts"), entries: await db.list("finEntries"), settings: { kitchenAllocation: "by_supply", kitchenShares: {} }, branches: await db.list("branches"), moves, locations }, "2026-12");
    expect(plan.problem).toMatch("لا توجد مصروفات");
  });
});
