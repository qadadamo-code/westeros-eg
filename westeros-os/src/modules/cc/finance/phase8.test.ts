import { describe, expect, it } from "vitest";
import { loadDefaultChart, settingsOf } from "./ops";
import { submitEntry } from "./journalOps";
import { advanceBalances, cancelPayroll, giveAdvance, lineOf, netOf, payPayroll, payrollLines, payrollOf, payrollProblem, runPayroll, saveEmployee, type PayLine } from "./payroll";
import { cancelDoc, postSalesDay, postSettlement, salesLines, salesOf, salesProblem, salesTotals, type SalesInput } from "./sales";
import { financeDb } from "./testDb";
import { movement, rollup } from "./tree";
import { liabilityByMonth, settleVat, vatRows, vatSettleLines } from "./vat";

const boss = { id: null, name: "م", canApprove: true };
const sale = (p: Partial<SalesInput> = {}): SalesInput => ({ shift: "", channels: { "sales.dinein": 1_140_000, "sales.talabat": 570_000 }, fees: 0, discounts: 114_000, returns: 0, tips: 50_000, vatBp: 1400, inclusive: true, payments: [], orders: 30, note: "", ...p });
const sums = (lines: { debit: number; credit: number }[]) => lines.reduce((t, l) => ({ d: t.d + l.debit, c: t.c + l.credit }), { d: 0, c: 0 });

describe("sales rules", () => {
  it("takes the tax out of inclusive figures and leaves the difference as over or short", () => {
    const t = salesTotals(sale({ payments: [{ accountId: "cash", amount: 1_000_000 }, { accountId: "tal", amount: 570_000 }] }));
    expect(t.channels["sales.dinein"]).toBe(1_000_000);
    expect(t.taxable).toBe(1_400_000);
    expect(t.vat).toBe(196_000);
    expect(t.due).toBe(1_646_000);
    expect(t.diff).toBe(-76_000);
  });
  it("adds the tax on top of exclusive figures", () => {
    const t = salesTotals(sale({ inclusive: false, discounts: 0, tips: 0, channels: { "sales.dinein": 1_000_000 }, payments: [{ accountId: "cash", amount: 1_140_000 }] }));
    expect(t.vat).toBe(140_000);
    expect(t.diff).toBe(0);
  });
  it("the entry always balances, short or over", () => {
    const ids = { channel: (k: string) => k, fees: "fees", discounts: "disc", returns: "ret", vat: "vat", tips: "tips", diff: "diff" };
    for (const cash of [900_000, 1_076_000, 1_300_000]) {
      const s = sums(salesLines(sale({ payments: [{ accountId: "cash", amount: cash }, { accountId: "tal", amount: 570_000 }] }), ids, null));
      expect(s.d).toBe(s.c);
    }
  });
  it("refuses an empty day and discounts above the sales", () => {
    expect(salesProblem({ date: "2026-11-01", branchId: null, ...sale({ channels: {}, discounts: 0 }) })).toMatch(/قناة/);
    expect(salesProblem({ date: "2026-11-01", branchId: null, ...sale({ discounts: 9_000_000, payments: [{ accountId: "a", amount: 1 }] }) })).toMatch(/الخصومات/);
  });
});

describe("payroll rules", () => {
  const l: PayLine = { employeeId: "e", name: "س", branchId: "b", centreId: null, basic: 600_000, allowances: 100_000, overtime: 50_000, bonus: 20_000, deductions: 30_000, insEmployee: 66_000, insEmployer: 112_000, tax: 10_000, advance: 100_000 };
  it("net is what is left after insurance, tax and the advance", () => expect(netOf(l)).toBe(564_000));
  it("the accrual balances and groups the cost by branch", () => {
    const lines = payrollLines([l, { ...l, employeeId: "f", name: "ص", advance: 0 }], { salaries: "sal", overtime: "ot", bonuses: "bo", employer: "er", insurance: "ins", tax: "tax", payable: "pay", advanceOf: (id) => `adv:${id}` });
    const s = sums(lines);
    expect(s.d).toBe(s.c);
    expect(lines.find((x) => x.account === "sal")?.debit).toBe(1_340_000);
    expect(lines.filter((x) => x.account.startsWith("adv:")).length).toBe(1);
  });
  it("an advance deduction never exceeds the advance", () => expect(payrollProblem("2026-11", [l], new Map([["e", 50_000]]))).toMatch(/السلفة/));
});

describe("vat rules", () => {
  it("a credit month carries to the next and is used before paying", () => {
    const lines = vatSettleLines({ output: 100, input: 60, carryIn: 30, payable: 10 }, { output: "o", input: "i", money: "m" });
    expect(lines).toEqual([{ account: "o", debit: 100, credit: 0, memo: "ضريبة المخرجات" }, { account: "i", debit: 0, credit: 90, memo: "ضريبة المدخلات" }, { account: "m", debit: 0, credit: 10, memo: "سداد ضريبة القيمة المضافة" }]);
  });
});

describe("sales, payroll and tax on the books", async () => {
  const db = await financeDb();
  await loadDefaultChart(db);
  const acc = Object.fromEntries((await db.list("finAccounts")).map((a) => [a.code, a.id]));
  const balance = async (code: string) => { const t = rollup(await db.list("finAccounts"), movement(await db.list("finEntries"))).get(code) ?? { debit: 0, credit: 0 }; return t.debit - t.credit; };
  await submitEntry(db, null, { date: "2026-10-01", memo: "cap", branchId: null, lines: [{ account: acc["110101"], debit: 9_000_000, credit: 0 }, { account: acc["3101"], debit: 0, credit: 9_000_000 }] }, boss);

  it("a sales day posts one entry; a second one for the same day is refused; cancelling reverses it", async () => {
    const day = { date: "2026-10-05", branchId: null, ...sale({ payments: [{ accountId: acc["110101"], amount: 1_076_000 }, { accountId: acc["110401"], amount: 570_000 }] }) };
    const doc = await postSalesDay(db, day, boss);
    expect(salesOf(doc).diff).toBe(0);
    expect(await balance("4101")).toBe(-1_000_000);
    expect(await balance("2103")).toBe(-196_000);
    expect(await balance("2106")).toBe(-50_000);
    await expect(postSalesDay(db, day, boss)).rejects.toThrow(/مسجلة/);
    const second = await postSalesDay(db, { ...day, shift: "مسائي" }, boss);
    await cancelDoc(db, second.id, boss, "2026-10-06");
    expect(await balance("2103")).toBe(-196_000);
    expect((await db.get("finDocs", second.id))?.status).toBe("cancelled");
  });

  it("a Talabat settlement clears the receivable into the bank less the commission and its tax", async () => {
    await postSettlement(db, { fromId: acc["110401"], toId: acc["110101"], date: "2026-10-20", received: 456_000, commission: 100_000, commissionVat: 14_000, feeId: acc["6301"], ref: "W42", note: "", branchId: null }, boss);
    expect(await balance("110401")).toBe(0);
    expect(await balance("6301")).toBe(100_000);
    expect(await balance("1110")).toBe(14_000);
  });

  it("vat: October is paid, then a credit month carries forward", async () => {
    let rows = vatRows(await db.list("finAccounts"), await db.list("finEntries"), settingsOf((await db.list("finSettings"))[0]));
    expect(rows.map((r) => [r.month, r.output, r.input, r.payable])).toEqual([["2026-10", 196_000, 14_000, 182_000]]);
    await expect(settleVat(db, "2026-10", { date: "2026-11-05", moneyId: null })).rejects.toThrow(/الخزينة/);
    await settleVat(db, "2026-10", { date: "2026-11-05", moneyId: acc["110101"] });
    expect(await balance("2103")).toBe(0);
    expect(await balance("1110")).toBe(0);
    await expect(settleVat(db, "2026-10", { date: "2026-11-05", moneyId: acc["110101"] })).rejects.toThrow(/متسوي/);
    await submitEntry(db, null, { date: "2026-11-10", memo: "شراء", branchId: null, lines: [{ account: acc["6201"], debit: 1_000_000, credit: 0 }, { account: acc["1110"], debit: 140_000, credit: 0 }, { account: acc["110101"], debit: 0, credit: 1_140_000 }] }, boss);
    rows = vatRows(await db.list("finAccounts"), await db.list("finEntries"), settingsOf((await db.list("finSettings"))[0]));
    expect(rows[1]).toMatchObject({ month: "2026-11", net: -140_000, payable: 0, carryOut: 140_000 });
    expect(rows[0].settled).not.toBeNull();
  });

  it("payroll: advance, accrual with the advance taken back, payment, and one payroll per employee a month", async () => {
    const emp = await saveEmployee(db, null, { name: "سيد", branchId: null, active: true, data: { job: "شيف", phone: "", nationalId: "", hired: "2026-01-01", salary: 600_000, allowances: 0, insEmployee: 66_000, insEmployer: 112_000, tax: 0, centreId: null, note: "" } });
    await giveAdvance(db, { employeeId: emp.id, date: "2026-11-03", moneyId: acc["110101"], amount: 200_000, memo: "", branchId: null }, boss);
    const emps = await db.list("finDocs", { where: { kind: "employee" } });
    expect(advanceBalances(emps, await db.list("finEntries")).get(emp.id)).toBe(200_000);
    const line = { ...lineOf(emps[0]), advance: 150_000 };
    await expect(runPayroll(db, { month: "2026-11", lines: [{ ...line, advance: 300_000 }], note: "" }, boss)).rejects.toThrow(/السلفة/);
    const run = await runPayroll(db, { month: "2026-11", lines: [line], note: "" }, boss);
    expect(payrollOf(run).net).toBe(384_000);
    expect(await balance("210201")).toBe(-384_000);
    expect(await balance("2105")).toBe(-178_000);
    expect(advanceBalances(emps, await db.list("finEntries")).get(emp.id)).toBe(50_000);
    await expect(runPayroll(db, { month: "2026-11", lines: [{ ...line, advance: 0 }], note: "" }, boss)).rejects.toThrow(/نفس الشهر/);
    const paid = await payPayroll(db, run.id, { date: "2026-11-30", moneyId: acc["110101"] });
    expect(paid.status).toBe("paid");
    expect(await balance("210201")).toBe(0);
    await expect(cancelPayroll(db, run.id, boss, "2026-11-30")).rejects.toThrow(/مصروف/);
    expect(liabilityByMonth(await db.list("finAccounts"), await db.list("finEntries"), "2105").balance).toBe(178_000);
  });
});
