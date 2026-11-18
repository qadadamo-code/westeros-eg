/** The chart on a real (in-memory) database: load, add, move, merge, delete, import. */
import { describe, expect, it } from "vitest";
import { DEFAULT_TREE } from "./chart";
import { financeDb } from "./testDb";
import { importAccounts, loadDefaultChart, mergeAccounts, moveAccount, removeAccount, saveAccount, saveSettings, settingsOf, type AccountFields } from "./ops";

const fields = (code: string, ar: string, parentCode: string, o: Partial<AccountFields> = {}): AccountFields => ({
  code, name: { ar, en: "" }, parentCode, postable: true, kind: "general", cashflow: "operating", branchId: null, requireCentre: false, allowManual: true, alertMin: null, alertMax: null, active: true, note: "", ...o,
});

describe("chart of accounts on the database", async () => {
  const db = await financeDb();
  const byCode = async (code: string) => (await db.list("finAccounts")).find((x) => x.code === code)!;
  const entry = (lines: { account: string; debit: number; credit: number }[]) =>
    db.insert("finEntries", { no: 1, year: 2026, date: "2026-11-18", kind: "manual", status: "posted", memo: "", lines, branchId: null, sourceType: null, sourceId: null, reverses: null, reversedBy: null, attachments: [], createdBy: null, createdByName: "", approvedBy: null, postedAt: null, reason: "", meta: {} });

  it("loads the ready tree once", async () => {
    expect(await loadDefaultChart(db)).toBe(DEFAULT_TREE.length);
    expect(await loadDefaultChart(db)).toBe(0);
  });
  it("a leaf that gets a child becomes a parent, unless it has entries", async () => {
    const bank = await saveAccount(db, null, fields("110201", "البنك الأهلي", "1102", { kind: "bank" }));
    expect(bank.type).toBe("asset");
    expect((await byCode("1102")).postable).toBe(false);
    await entry([{ account: bank.id, debit: 500, credit: 0 }, { account: (await byCode("3101")).id, debit: 0, credit: 500 }]);
    await expect(saveAccount(db, null, fields("11020101", "حساب جاري", "110201"))).rejects.toThrow("حركات");
    await expect(removeAccount(db, bank)).rejects.toThrow("حركات");
  });
  it("moves an account with its children to new codes and keeps the links", async () => {
    await saveSettings(db, { links: { "exp.rent": "6201" } });
    await moveAccount(db, await byCode("6201"), "64");
    const moved = (await db.list("finAccounts")).find((x) => x.name.ar === "إيجار")!;
    expect(moved.code).toBe("6406");
    expect(moved.parentCode).toBe("64");
    expect(settingsOf((await db.list("finSettings"))[0]).links["exp.rent"]).toBe("6406");
    await expect(moveAccount(db, await byCode("110901"), "62")).rejects.toThrow("نفس النوع");
  });
  it("merges one leaf into another and moves its lines", async () => {
    const from = await saveAccount(db, null, fields("110202", "بنك مصر", "1102", { kind: "bank" }));
    const into = await byCode("110201");
    await entry([{ account: from.id, debit: 200, credit: 0 }, { account: (await byCode("3101")).id, debit: 0, credit: 200 }]);
    expect(await mergeAccounts(db, from, into)).toBe(1);
    expect(await byCode("110202")).toBeUndefined();
    const lines = (await db.list("finEntries")).flatMap((e) => e.lines).filter((l) => l.account === into.id);
    expect(lines.map((l) => l.debit)).toEqual([500, 200]);
  });
  it("deleting the last child turns the parent back into a leaf", async () => {
    const a = await saveAccount(db, null, fields("620201", "كهرباء المطبخ", "6202"));
    expect((await byCode("6202")).postable).toBe(false);
    await removeAccount(db, a);
    expect((await byCode("6202")).postable).toBe(true);
  });
  it("imports by code: renames what exists, adds what is new, only when approved", async () => {
    const sheet = [{ "كود الحساب": "6205", "اسم الحساب": "صيانة ومعدات" }, { "كود الحساب": "6299", "اسم الحساب": "مصروف جديد" }, { "كود الحساب": "abc", "اسم الحساب": "غلط" }];
    const dry = await importAccounts(db, sheet, true);
    expect([dry.updated.length, dry.added.length, dry.skipped]).toEqual([1, 1, 1]);
    expect(await byCode("6299")).toBeUndefined();
    await importAccounts(db, sheet, false);
    expect((await byCode("6205")).name.ar).toBe("صيانة ومعدات");
    expect((await byCode("6299")).parentCode).toBe("62");
  });
});
