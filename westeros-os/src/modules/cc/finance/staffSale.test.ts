import { describe, expect, it } from "vitest";
import { applyMoves } from "@/modules/inventory/stock";
import { T } from "@/modules/production/testKitchen";
import { WESTEROS_BRANCH_ID as B } from "@/data/westeros/seed";
import { lineUnit } from "../lib";
import { loadDefaultChart, saveSettings } from "./ops";
import { saveEmployee } from "./payroll";
import { postStaffSale, staffSaleOf, staffSaleProblem } from "./staffSale";
import { financeDb } from "./testDb";
import { movement, rollup } from "./tree";

const boss = { id: null, name: "م", canApprove: true };

describe("فاتورة مبيعات للموظفين", () => {
  it("rules", () => {
    const v = { employeeId: "", date: "2026-11-24", payment: "employee" as const, moneyId: null, revenueId: "r", note: "", lines: [{ itemId: "i", locationId: "l", qty: 1, price: 0 }] };
    expect(staffSaleProblem(v)).toMatch(/الموظف/);
    expect(staffSaleProblem({ ...v, employeeId: "e" })).toMatch(/سعر البيع/);
  });

  it("takes the stock out at cost and puts the price on the employee's account", async () => {
    const db = await financeDb();
    await loadDefaultChart(db);
    await saveSettings(db, { startDate: "2026-11-01" });
    const acc = Object.fromEntries((await db.list("finAccounts")).map((a) => [a.code, a.id]));
    const balance = async (code: string) => { const t = rollup(await db.list("finAccounts"), movement(await db.list("finEntries"))).get(code) ?? { debit: 0, credit: 0 }; return t.debit - t.credit; };
    await applyMoves(db, [{ itemId: T.mayo, locationId: T.fridge, branchId: B, kind: "opening", qty: 10_000, value: 100_000_000, refType: "opening", refId: "o1", groupId: "o1", at: "2026-11-02T08:00:00.000Z" }]);
    const emp = await saveEmployee(db, null, { name: "سيد", branchId: null, active: true, data: { job: "", phone: "", nationalId: "", hired: "2026-01-01", salary: 600_000, allowances: 0, insEmployee: 0, insEmployer: 0, tax: 0, centreId: null, note: "" } });
    const item = await db.get("stockItems", T.mayo);
    const factor = lineUnit(item!).factor;
    const qty = 1000 / factor; // 1000 base units
    await expect(postStaffSale(db, { employeeId: emp.id, date: "2026-11-24", payment: "employee", moneyId: null, revenueId: acc["4201"], note: "", lines: [{ itemId: T.mayo, locationId: T.fridge, qty: 20_000 / factor, price: 100_000 }] }, boss)).rejects.toThrow(/المتوفرة/);
    const doc = await postStaffSale(db, { employeeId: emp.id, date: "2026-11-24", payment: "employee", moneyId: null, revenueId: acc["4201"], note: "", lines: [{ itemId: T.mayo, locationId: T.fridge, qty, price: 5_000_000 / qty }] }, boss);
    const d = staffSaleOf(doc);
    expect(d.total).toBe(5_000_000);
    expect(d.cost).toBe(10_000_000);
    expect(await balance("4201")).toBe(-5_000_000);
    const lv = (await db.list("stockLevels")).find((l) => l.itemId === T.mayo && l.locationId === T.fridge)!;
    expect(lv.qty).toBeCloseTo(9_000, 3);
  });
});
