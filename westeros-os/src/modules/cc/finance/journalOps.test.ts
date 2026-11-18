import { describe, expect, it } from "vitest";
import { financeDb } from "./testDb";
import { approveEntry, postSystem, rejectEntry, removeDraft, reverseEntry, RECURRING, runRecurring, saveDraft, saveOpening, saveRecurring, submitEntry, type Actor } from "./journalOps";
import { loadDefaultChart, saveSettings } from "./ops";

const boss: Actor = { id: null, name: "المدير", canApprove: true };
const clerk: Actor = { id: null, name: "المحاسب", canApprove: false };

describe("the journal on the database", async () => {
  const db = await financeDb();
  await loadDefaultChart(db);
  const acc = Object.fromEntries((await db.list("finAccounts")).map((a) => [a.code, a.id]));
  const L = (code: string, debit: number, credit: number) => ({ account: acc[code], debit, credit });
  const rent = (amount: number, date = "2026-11-10") => ({ date, memo: "إيجار", lines: [L("6201", amount, 0), L("110101", 0, amount)], branchId: null });

  it("posts with the next number of the year", async () => {
    const a = await submitEntry(db, null, rent(100_000), boss);
    const b = await submitEntry(db, null, rent(200_000), boss);
    expect([a.status, a.no, b.no, a.year]).toEqual(["posted", 1, 2, 2026]);
    await expect(submitEntry(db, null, { ...rent(5), lines: [L("6201", 5, 0), L("110101", 0, 4)] }, boss)).rejects.toThrow("غير متوازن");
    await expect(submitEntry(db, null, { ...rent(5), lines: [L("110601", 5, 0), L("110101", 0, 5)] }, boss)).rejects.toThrow("السيستم فقط");
  });
  it("above the limit waits for someone who can approve", async () => {
    await saveSettings(db, { approvalLimit: 500_000 });
    const big = await submitEntry(db, null, rent(900_000), clerk);
    expect([big.status, big.no]).toEqual(["pending", 0]);
    await expect(approveEntry(db, big.id, clerk)).rejects.toThrow("صلاحية");
    expect((await approveEntry(db, big.id, boss)).no).toBe(3);
    const no = await submitEntry(db, null, rent(800_000), clerk);
    expect((await rejectEntry(db, no.id, "مكرر", boss)).status).toBe("rejected");
    await removeDraft(db, no.id);
    expect(await db.get("finEntries", no.id)).toBeNull();
    expect((await submitEntry(db, null, rent(100), clerk)).status).toBe("posted");
  });
  it("a posted entry is undone only by a reversal, once", async () => {
    const e = await submitEntry(db, null, rent(700), boss);
    await expect(saveDraft(db, e, rent(1), boss)).rejects.toThrow("لا يعدل");
    await expect(removeDraft(db, e.id)).rejects.toThrow("لا يحذف");
    const rev = await reverseEntry(db, e.id, { date: "2026-11-12" }, boss);
    expect(rev.lines.map((l) => [l.debit, l.credit])).toEqual([[0, 700], [700, 0]]);
    expect((await db.get("finEntries", e.id))!.reversedBy).toBe(rev.id);
    await expect(reverseEntry(db, e.id, { date: "2026-11-12" }, boss)).rejects.toThrow("معكوس");
    await expect(reverseEntry(db, rev.id, { date: "2026-11-12" }, boss)).rejects.toThrow("لا يعكس");
  });
  it("a closed month refuses entries", async () => {
    await saveSettings(db, { periods: { "2026-10": "closed" } });
    await expect(submitEntry(db, null, rent(100, "2026-10-05"), boss)).rejects.toThrow("مقفول");
  });
  it("the system posts once per source", async () => {
    const input = { date: "2026-11-15", memo: "تشغيلة", branchId: null, sourceType: "batch", sourceId: "b1", lines: [L("110602", 400, 0), L("110601", 0, 400)] };
    const a = await postSystem(db, input);
    const b = await postSystem(db, input);
    expect(a!.id).toBe(b!.id);
    expect(a!.kind).toBe("auto");
    expect(await postSystem(db, { ...input, sourceId: "b2", lines: [] })).toBeNull();
  });
  it("a recurring entry makes one draft a month", async () => {
    await saveRecurring(db, null, "إيجار المحل", { memo: "إيجار", lines: rent(1000).lines, branchId: null, day: 5, lastRun: null, until: null });
    expect(await runRecurring(db, "2026-11-18", clerk)).toBe(1);
    expect(await runRecurring(db, "2026-11-19", clerk)).toBe(0);
    const drafts = (await db.list("finEntries")).filter((e) => e.sourceType === RECURRING);
    expect([drafts.length, drafts[0].status, drafts[0].date]).toEqual([1, "draft", "2026-11-05"]);
  });
  it("opening balances are one entry that is replaced when saved again", async () => {
    const a = await saveOpening(db, "2026-11-01", [L("110101", 5000, 0), L("3203", 0, 5000)], boss);
    const b = await saveOpening(db, "2026-11-01", [L("110101", 7000, 0), L("3203", 0, 7000)], boss);
    expect(b.id).toBe(a.id);
    expect(b.lines[0].debit).toBe(7000);
    expect((await db.list("finEntries")).filter((e) => e.kind === "opening").length).toBe(1);
  });
});
