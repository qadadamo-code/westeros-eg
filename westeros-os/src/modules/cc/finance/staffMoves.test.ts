import { describe, expect, it } from "vitest";
import { loadDefaultChart } from "./ops";
import { submitEntry } from "./journalOps";
import { cancelPayroll, lineOf, payrollOf, runPayroll, saveEmployee } from "./payroll";
import { cancelMove, custodyBalances, moveProblem, payrollAdds, salesBonus, saveMove, savingsBalances, STAFF_MOVE } from "./staffMoves";
import { financeDb } from "./testDb";
import { movement, rollup } from "./tree";

const boss = { id: null, name: "م", canApprove: true };

describe("staff moves", () => {
  it("rules", () => {
    expect(salesBonus(10_000_000, 250)).toBe(250_000);
    expect(moveProblem({ type: "bonus", employeeId: "e", date: "2026-11-01", amount: 100, month: null, memo: "" })).toMatch(/شهر/);
    expect(moveProblem({ type: "custody.give", employeeId: "e", date: "2026-11-01", amount: 100, memo: "" })).toMatch(/الخزينة/);
    expect(moveProblem({ type: "custody.spend", employeeId: "e", date: "2026-11-01", amount: 100, memo: "" })).toMatch(/المصروف/);
  });

  it("custody, payroll moves with savings, cancelling, and savings paid out", async () => {
    const db = await financeDb();
    await loadDefaultChart(db);
    const acc = Object.fromEntries((await db.list("finAccounts")).map((a) => [a.code, a.id]));
    const balance = async (code: string) => { const t = rollup(await db.list("finAccounts"), movement(await db.list("finEntries"))).get(code) ?? { debit: 0, credit: 0 }; return t.debit - t.credit; };
    await submitEntry(db, null, { date: "2026-11-01", memo: "cap", branchId: null, lines: [{ account: acc["110101"], debit: 9_000_000, credit: 0 }, { account: acc["3101"], debit: 0, credit: 9_000_000 }] }, boss);
    const emp = await saveEmployee(db, null, { name: "سيد", branchId: null, active: true, data: { job: "", phone: "", nationalId: "", hired: "2026-01-01", salary: 600_000, allowances: 0, insEmployee: 0, insEmployer: 0, tax: 0, centreId: null, note: "" } });

    // العهدة
    await saveMove(db, { type: "custody.give", employeeId: emp.id, date: "2026-11-02", amount: 300_000, moneyId: acc["110101"], memo: "" }, boss);
    await expect(saveMove(db, { type: "custody.return", employeeId: emp.id, date: "2026-11-03", amount: 400_000, moneyId: acc["110101"], memo: "" }, boss)).rejects.toThrow(/عهدة/);
    await saveMove(db, { type: "custody.spend", employeeId: emp.id, date: "2026-11-03", amount: 120_000, expenseId: acc["6201"], memo: "" }, boss);
    await saveMove(db, { type: "custody.return", employeeId: emp.id, date: "2026-11-04", amount: 80_000, moneyId: acc["110101"], memo: "" }, boss);
    let accounts = await db.list("finAccounts");
    expect(custodyBalances(accounts, await db.list("finEntries")).get(emp.id)).toBe(100_000);
    expect(await balance("6201")).toBe(120_000);

    // حافز وخصم ومدخرات على شهر نوفمبر
    await saveMove(db, { type: "sales_bonus", employeeId: emp.id, date: "2026-11-20", amount: salesBonus(4_000_000, 500), month: "2026-11", sales: 4_000_000, pctBp: 500, memo: "" }, boss);
    await saveMove(db, { type: "deduction", employeeId: emp.id, date: "2026-11-21", amount: 50_000, month: "2026-11", memo: "" }, boss);
    const sav = await saveMove(db, { type: "savings", employeeId: emp.id, date: "2026-11-21", amount: 100_000, month: "2026-11", memo: "" }, boss);
    const extra = await saveMove(db, { type: "bonus", employeeId: emp.id, date: "2026-11-22", amount: 10_000, month: "2026-11", memo: "" }, boss);
    await cancelMove(db, extra.id, boss, "2026-11-22");
    const docs = await db.list("finDocs");
    const adds = payrollAdds(docs, "2026-11").get(emp.id)!;
    expect(adds).toMatchObject({ bonus: 200_000, deductions: 50_000, savings: 100_000 });
    const line = { ...lineOf(docs.find((d) => d.id === emp.id)!), bonus: adds.bonus, deductions: adds.deductions, savings: adds.savings };
    const run = await runPayroll(db, { month: "2026-11", lines: [line], note: "", moves: adds.ids }, boss);
    expect(payrollOf(run).net).toBe(600_000 + 200_000 - 50_000 - 100_000);
    accounts = await db.list("finAccounts");
    expect(savingsBalances(accounts, await db.list("finEntries")).get(emp.id)).toBe(100_000);
    expect((await db.get("finDocs", sav.id))!.status).toBe("used");
    await expect(cancelMove(db, sav.id, boss, "2026-11-30")).rejects.toThrow(/كشف/);

    // إلغاء الكشف يرجع الحركات تستنى
    await cancelPayroll(db, run.id, boss, "2026-11-30");
    expect((await db.get("finDocs", sav.id))!.status).toBe("open");
    expect(savingsBalances(await db.list("finAccounts"), await db.list("finEntries")).get(emp.id)).toBe(0);
    const again = payrollAdds(await db.list("finDocs"), "2026-11").get(emp.id)!;
    await runPayroll(db, { month: "2026-11", lines: [{ ...line }], note: "", moves: again.ids }, boss);

    // صرف من المدخرات
    await expect(saveMove(db, { type: "savings.withdraw", employeeId: emp.id, date: "2026-12-01", amount: 200_000, moneyId: acc["110101"], memo: "" }, boss)).rejects.toThrow(/المتاحة/);
    await saveMove(db, { type: "savings.withdraw", employeeId: emp.id, date: "2026-12-01", amount: 60_000, moneyId: acc["110101"], memo: "" }, boss);
    expect(savingsBalances(await db.list("finAccounts"), await db.list("finEntries")).get(emp.id)).toBe(40_000);
    expect((await db.list("finDocs", { where: { kind: STAFF_MOVE } })).length).toBe(8);
  });
});
