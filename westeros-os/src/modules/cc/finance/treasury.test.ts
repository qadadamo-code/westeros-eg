import { describe, expect, it } from "vitest";
import type { FinEntry } from "@/data/financeTypes";
import { major } from "@/lib/money";
import { loadDefaultChart, saveSettings } from "./ops";
import { financeDb } from "./testDb";
import { autoMatch, bankRecon, numberWords, prepaidSchedule, tafqeet, voucherLines } from "./treasury";
import { addMoneyAccount, ensureBranchTills, postCashCount, runPrepaid, savePrepaid, saveVoucher } from "./treasuryOps";

const boss = { id: null, name: "المدير", canApprove: true };

describe("amounts in words", () => {
  it("spells Arabic numbers", () => {
    expect(numberWords(1250)).toBe("ألف ومائتان وخمسون");
    expect(numberWords(2000)).toBe("ألفان");
    expect(numberWords(3015)).toBe("ثلاثة آلاف وخمسة عشر");
    expect(numberWords(21)).toBe("واحد وعشرون");
    expect(numberWords(1_000_000)).toBe("مليون");
    expect(tafqeet(major(1250.5))).toBe("فقط ألف ومائتان وخمسون جنيها وخمسون قرشا لا غير");
  });
});

describe("pure treasury rules", () => {
  it("an expense with VAT credits the till with the total", () => {
    const l = voucherLines({ type: "expense", date: "2026-11-10", moneyId: "till", otherId: "rent", amount: 1000, vat: 140, party: "", memo: "", branchId: null }, "vat");
    expect(l.map((x) => [x.account, x.debit, x.credit])).toEqual([["rent", 1000, 0], ["vat", 140, 0], ["till", 0, 1140]]);
  });
  it("spreads a prepaid amount, the last month takes the rounding", () => {
    const s = prepaidSchedule({ total: 1000, months: 3, start: "2026-11" });
    expect(s).toEqual([{ month: "2026-11", amount: 333 }, { month: "2026-12", amount: 333 }, { month: "2027-01", amount: 334 }]);
  });
  it("reconciles a bank account and matches statement lines", () => {
    const e = (id: string, date: string, debit: number, credit: number) => ({ id, date, no: 1, status: "posted", lines: [{ account: "bank", debit, credit }, { account: "x", debit: credit, credit: debit }] }) as unknown as FinEntry;
    const entries = [e("a", "2026-11-01", 5000, 0), e("b", "2026-11-05", 0, 1200), e("c", "2026-11-20", 700, 0)];
    const doc = { date: "2026-11-30", data: { accountId: "bank", statementBalance: 3800, cleared: ["a#0", "b#0"], statement: [] } };
    const r = bankRecon("bank", entries, doc, []);
    expect([r.book, r.settled, r.depositsInTransit, r.outstanding, r.difference]).toEqual([4500, 3800, 700, 0, 0]);
    const m = autoMatch([{ date: "2026-11-06", memo: "شيك", amount: -1200 }, { date: "2026-11-02", memo: "؟", amount: 99 }], r.rows);
    expect(m.map((x) => x.match ?? null)).toEqual(["b#0", null]);
    // a closed reconciliation hides what it settled
    expect(bankRecon("bank", entries, { ...doc, data: { ...doc.data, cleared: [] } }, [{ data: { cleared: ["a#0", "b#0"] } }]).rows.map((x) => x.key)).toEqual(["c#0"]);
  });
});

describe("the treasury on the database", async () => {
  const db = await financeDb();
  await loadDefaultChart(db);
  const code = async (c: string) => (await db.list("finAccounts")).find((a) => a.code === c)!;
  const balance = async (id: string) => (await db.list("finEntries")).filter((e) => e.status === "posted").reduce((s, e) => s + e.lines.filter((l) => l.account === id).reduce((a, l) => a + l.debit - l.credit, 0), 0);

  it("opens a till per branch once, and bank accounts under البنوك", async () => {
    expect(await ensureBranchTills(db)).toBeGreaterThan(0);
    expect(await ensureBranchTills(db)).toBe(0);
    const bank = await addMoneyAccount(db, { kind: "bank", name: "البنك الأهلي جاري", branchId: null });
    expect([bank.parentCode, bank.code, bank.kind]).toEqual(["1102", "110201", "bank"]);
    expect((await code("1102")).postable).toBe(false);
  });
  it("numbers receipts and payments apart and posts them", async () => {
    const till = (await db.list("finAccounts")).find((a) => a.linkType === "branch-till")!;
    const capital = await code("3101"), rent = await code("6201");
    const r1 = await saveVoucher(db, { type: "receipt", date: "2026-11-02", moneyId: till.id, otherId: capital.id, amount: major(50_000), party: "محمد", memo: "", branchId: null }, boss);
    const p1 = await saveVoucher(db, { type: "payment", date: "2026-11-03", moneyId: till.id, otherId: rent.id, amount: major(12_000), party: "المالك", memo: "إيجار نوفمبر", branchId: null }, boss);
    const r2 = await saveVoucher(db, { type: "receipt", date: "2026-11-04", moneyId: till.id, otherId: capital.id, amount: major(1000), party: "", memo: "", branchId: null }, boss);
    expect([r1.meta.voucherNo, p1.meta.voucherNo, r2.meta.voucherNo, r1.kind, r1.memo]).toEqual([1, 1, 2, "receipt", "سند قبض: محمد"]);
    expect(await balance(till.id)).toBe(major(39_000));
    await expect(saveVoucher(db, { type: "transfer", date: "2026-11-04", moneyId: till.id, otherId: till.id, amount: 5, party: "", memo: "", branchId: null }, boss)).rejects.toThrow("مختلفتين");
  });
  it("a cash count posts the shortage", async () => {
    const till = (await db.list("finAccounts")).find((a) => a.linkType === "branch-till")!;
    const r = await postCashCount(db, { accountId: till.id, date: "2026-11-05", counted: major(38_950), pieces: {}, note: "" }, boss);
    expect(r.diff).toBe(-major(50));
    expect(await balance(till.id)).toBe(major(38_950));
    expect(await balance((await code("6601")).id)).toBe(major(50));
  });
  it("charges a prepaid expense month by month, once", async () => {
    const pre = await code("110901"), rent = await code("6201");
    await savePrepaid(db, null, { name: "إيجار سنة مقدم", branchId: null, data: { total: major(120_000), months: 12, start: "2026-10", prepaidAccount: pre.id, expenseAccount: rent.id, centreId: null } });
    expect(await runPrepaid(db, "2026-11-18")).toBe(2);
    expect(await runPrepaid(db, "2026-11-18")).toBe(0);
    expect(await balance(pre.id)).toBe(-major(20_000));
    await saveSettings(db, {});
    expect(await runPrepaid(db, "2026-12-01")).toBe(1);
  });
});
