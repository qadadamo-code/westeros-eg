import { describe, expect, it } from "vitest";
import type { DeliveryMethod } from "@/data/financeTypes";
import { DRIVER, driverOf, ensureDeliveryAccounts, feeAccountText, feeSplit, methodProblem, newMethod, removeDriver, removeMethod, saveDriver, saveMethod } from "./delivery";
import { loadDefaultChart, settingsOf } from "./ops";
import { saveEmployee } from "./payroll";
import { postSalesDay, postSettlement, salesLines, salesProblem, type SalesInput } from "./sales";
import { financeDb } from "./testDb";
import { movement, rollup } from "./tree";

const boss = { id: null, name: "م", canApprove: true };
const m = (p: Partial<DeliveryMethod>): DeliveryMethod => ({ ...newMethod("m"), name: "توصيل", ...p });
const day = (p: Partial<SalesInput> = {}): SalesInput => ({ shift: "", channels: { "sales.delivery": 1_000_000 }, fees: 0, discounts: 0, returns: 0, tips: 0, vatBp: 0, inclusive: true, payments: [], orders: 10, note: "", ...p });

describe("delivery rules", () => {
  it("the beneficiary takes its share of the fee and the rest is revenue", () => {
    expect(feeSplit(m({ beneficiary: "driver", sharePct: 60 }), 10_000)).toEqual({ party: 6_000, revenue: 4_000 });
    expect(feeSplit(m({ beneficiary: "restaurant", sharePct: 60 }), 10_000)).toEqual({ party: 0, revenue: 10_000 });
    expect(feeSplit(m({ type: "external", beneficiary: "company", sharePct: 100 }), 10_000)).toEqual({ party: 10_000, revenue: 0 });
  });
  it("says where the fee sits in the chart", () => {
    expect(feeAccountText(m({ type: "external", collection: "outside", company: "س" }))).toMatch(/لا تتسجل/);
    expect(feeAccountText(m({ beneficiary: "restaurant" }))).toMatch(/إيرادات/);
    expect(feeAccountText(m({ type: "external", company: "مرسول", beneficiary: "company", sharePct: 70 }))).toMatch(/70% لصالح مرسول: التزامات متداولة.*30% إيرادات/);
  });
  it("refuses a method missing what it needs", () => {
    expect(methodProblem(m({ name: "" }), [])).toMatch(/اسم/);
    expect(methodProblem(m({ type: "external" }), [])).toMatch(/شركة/);
    expect(methodProblem(m({ beneficiary: "driver", sharePct: 0 }), [])).toMatch(/نسبة/);
    expect(methodProblem(m({ beneficiary: "company" }), [])).toMatch(/لصالح/);
    expect(methodProblem(m({ type: "external", company: "س", beneficiary: "company", sharePct: 50, collection: "monthly" }), [])).toMatch(/الشهرية/);
    expect(methodProblem(m({ beneficiary: "employees", sharePct: 50 }), [])).toMatch(/الموظفين/);
  });
  it("the entry balances with every kind of share", () => {
    const methods = [m({ id: "a", beneficiary: "driver", sharePct: 50 }), m({ id: "b", name: "ب", type: "external", company: "س", beneficiary: "company", sharePct: 100 })];
    const v = day({ vatBp: 1400, delivery: [{ methodId: "a", driverId: "d", amount: 11_400 }, { methodId: "b", driverId: null, amount: 22_800 }], payments: [{ accountId: "cash", amount: 1_034_200 }] });
    const lines = salesLines(v, { channel: (k) => k, fees: "fees", discounts: "x", returns: "x", vat: "vat", tips: "x", diff: "diff", feeParty: (i) => `party${i}` }, null, methods);
    const s = lines.reduce((t, l) => ({ d: t.d + l.debit, c: t.c + l.credit }), { d: 0, c: 0 });
    expect(s.d).toBe(s.c);
    expect(lines.find((l) => l.account === "party0")?.credit).toBe(5_000);
    expect(lines.find((l) => l.account === "party1")?.credit).toBe(20_000);
    expect(lines.find((l) => l.account === "fees")?.credit).toBe(5_000);
  });
  it("a driver's share needs the driver, and a fee outside the invoice is refused", () => {
    const methods = [m({ id: "a", beneficiary: "driver", sharePct: 50 }), m({ id: "o", type: "external", company: "س", collection: "outside" })];
    const base = { date: "2026-11-20", branchId: null, payments: [{ accountId: "c", amount: 1 }] };
    expect(salesProblem({ ...base, ...day({ delivery: [{ methodId: "a", driverId: null, amount: 100 }] }) }, methods)).toMatch(/المندوب/);
    expect(salesProblem({ ...base, ...day({ delivery: [{ methodId: "o", driverId: null, amount: 100 }] }) }, methods)).toMatch(/خارج الفاتورة/);
  });
});

describe("delivery on the books", async () => {
  const db = await financeDb();
  // a chart loaded before خدمة التوصيل existed: its two accounts are missing
  await loadDefaultChart(db);
  for (const code of ["1112", "2109"]) await db.remove("finAccounts", (await db.list("finAccounts")).find((a) => a.code === code)!.id);
  const balance = async (code: string) => { const t = rollup(await db.list("finAccounts"), movement(await db.list("finEntries"))).get(code) ?? { debit: 0, credit: 0 }; return t.debit - t.credit; };
  const acc = Object.fromEntries((await db.list("finAccounts")).map((a) => [a.code, a.id]));

  it("adds the two delivery accounts under current assets and current liabilities", async () => {
    await ensureDeliveryAccounts(db);
    const all = await db.list("finAccounts");
    expect(all.find((a) => a.code === "1112")).toMatchObject({ parentCode: "11", type: "asset", kind: "customer", system: "delivery.drivers" });
    expect(all.find((a) => a.code === "2109")).toMatchObject({ parentCode: "21", type: "liability", system: "delivery.fees.payable" });
    await ensureDeliveryAccounts(db);
    expect((await db.list("finAccounts")).length).toBe(all.length);
  });

  const emp = await saveEmployee(db, null, { name: "سعيد", branchId: null, active: true, data: { job: "طيار", phone: "", nationalId: "", hired: "", salary: 0, allowances: 0, insEmployee: 0, insEmployer: 0, tax: 0, centreId: null, note: "" } });
  const own = (await saveMethod(db, m({ id: "own", name: "توصيل المطعم", beneficiary: "driver", sharePct: 40 })))[0];
  const ext = (await saveMethod(db, m({ id: "ext", name: "مرسول", type: "external", company: "مرسول", collection: "monthly", monthlyFee: 5_000_000, beneficiary: "company", sharePct: 100 }))).find((x) => x.id === "ext")!;
  const driverData = { role: "driver" as const, title: "", nationalId: "29801011234567", bike: "س ع 123", phone: "", affiliation: "employee" as const, companyMethodId: "", employeeId: emp.id, note: "" };

  it("a driver who is an employee must be linked to one, and gets his own account", async () => {
    await expect(saveDriver(db, null, { name: "سعيد", branchId: null, active: true, data: { ...driverData, employeeId: "" } })).rejects.toThrow(/الموظف/);
    await expect(saveDriver(db, null, { name: "سعيد", branchId: null, active: true, data: { ...driverData, nationalId: "123" } })).rejects.toThrow(/14/);
    const d = await saveDriver(db, null, { name: "سعيد", branchId: null, active: true, data: driverData });
    const a = (await db.list("finAccounts")).find((x) => x.id === driverOf(d).accountId)!;
    expect(a.parentCode).toBe("1112");
    expect(a.kind).toBe("customer");
    await expect(saveDriver(db, null, { name: "تاني", branchId: null, active: true, data: { ...driverData, nationalId: "" } })).rejects.toThrow(/بالفعل/);
  });

  it("the day's fees go to the driver's account and the company's payable, the rest to revenue; the driver settles what he holds", async () => {
    const drv = (await db.list("finDocs", { where: { kind: DRIVER } }))[0];
    const drvAcc = driverOf(drv).accountId;
    // the driver brought back nothing yet: the orders and the fees are on him
    await postSalesDay(db, { date: "2026-11-20", branchId: null, ...day({ delivery: [{ methodId: own.id, driverId: drv.id, amount: 100_000 }, { methodId: ext.id, driverId: null, amount: 30_000 }], payments: [{ accountId: drvAcc, amount: 1_130_000 }] }) }, boss);
    expect(await balance("4105")).toBe(-60_000);
    expect(await balance("2109")).toBe(-30_000);
    // what he owes is the cash he holds less his share of the fees
    expect(await balance("1112")).toBe(1_130_000 - 40_000);
    await postSettlement(db, { fromId: drvAcc, toId: acc["110101"], date: "2026-11-21", received: 1_090_000, commission: 0, commissionVat: 0, feeId: "", ref: "", note: "", branchId: null }, boss);
    expect(await balance("1112")).toBe(0);
  });

  it("a used method or driver is only stopped", async () => {
    expect(await removeMethod(db, ext.id)).toBe("stopped");
    expect(settingsOf((await db.list("finSettings"))[0]).delivery?.methods.find((x) => x.id === ext.id)?.active).toBe(false);
    const drv = (await db.list("finDocs", { where: { kind: DRIVER } }))[0];
    expect(await removeDriver(db, drv)).toBe("stopped");
    await saveMethod(db, m({ id: "x", name: "جديدة" }));
    expect(await removeMethod(db, "x")).toBe("removed");
  });
});
