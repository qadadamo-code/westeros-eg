import { describe, expect, it } from "vitest";
import { T } from "@/modules/production/testKitchen";
import { lineUnit } from "../lib";
import { loadDefaultChart, saveSettings } from "./ops";
import { submitEntry } from "./journalOps";
import { ageing, openItems, paySplit, purchaseTotals } from "./purchases";
import { paySupplier, postPurchase, postReturn, saveSupplier } from "./purchaseOps";
import { financeDb } from "./testDb";
import { movement, rollup } from "./tree";

const boss = { id: null, name: "م", canApprove: true };

describe("purchase rules", () => {
  it("spreads the invoice discount over the lines and taxes what is left", () => {
    const t = purchaseTotals([{ type: "item", qty: 2, price: 500, vatBp: 1400 }, { type: "account", qty: 1, price: 1000, vatBp: 0 }], 200);
    expect([t.gross, t.nets, t.vats, t.net, t.total]).toEqual([2000, [900, 900], [126, 0], 1800, 1926]);
  });
  it("withholding at source is a share of what is settled", () => {
    expect(paySplit({ amount: 9_900, withholdBp: 100 })).toEqual({ withheld: 100, discount: 0, settled: 10_000 });
    expect(paySplit({ amount: 500, discount: 50 })).toEqual({ withheld: 0, discount: 50, settled: 550 });
  });
});

describe("purchases", async () => {
  const db = await financeDb();
  await loadDefaultChart(db);
  await saveSettings(db, { startDate: "2026-11-01", costing: "average" });
  const balance = async (code: string) => {
    const t = rollup(await db.list("finAccounts"), movement(await db.list("finEntries"))).get(code) ?? { debit: 0, credit: 0 };
    return t.debit - t.credit;
  };
  const mayo = (await db.get("stockItems", T.mayo))!;
  const factor = lineUnit(mayo).factor;
  const acc = Object.fromEntries((await db.list("finAccounts")).map((a) => [a.code, a.id]));
  // an old expense on credit sits on الموردون before any supplier has an account
  await submitEntry(db, null, { date: "2026-11-02", memo: "x", branchId: null, lines: [{ account: acc["6205"], debit: 700, credit: 0 }, { account: acc["2101"], debit: 0, credit: 700 }] }, boss);
  const sup = await saveSupplier(db, null, { name: "مزارع الخير", active: true, data: { phone: "", taxId: "", address: "", contact: "", note: "", termsDays: 30, withholdBp: 100 } });
  const supAcc = (await db.list("finAccounts")).find((a) => a.linkType === "supplier" && a.linkId === sup.id)!;

  it("a supplier gets an account; what was on the general account moves to a general child", async () => {
    const accounts = await db.list("finAccounts");
    expect(accounts.find((a) => a.code === "2101")?.postable).toBe(false);
    expect([supAcc.parentCode, supAcc.kind]).toEqual(["2101", "supplier"]);
    expect(await balance("2101")).toBe(-700);
    await expect(saveSupplier(db, null, { name: "مزارع الخير", active: true, data: { phone: "", taxId: "", address: "", contact: "", note: "", termsDays: 0, withholdBp: 0 } })).rejects.toThrow("نفس الاسم");
  });

  it("an invoice brings stock in, updates the last price and leaves nothing on goods-not-invoiced", async () => {
    const before = (await db.list("stockLevels")).filter((l) => l.itemId === T.mayo).reduce((s, l) => s + l.qty, 0);
    const doc = await postPurchase(db, { supplierId: sup.id, date: "2026-11-10", invoiceNo: "A-1", due: "2026-12-10", payment: "credit", moneyId: null, discount: 100_000, note: "", branchId: null,
      lines: [{ type: "item", itemId: T.mayo, locationId: T.fridge, qty: 10, price: 200_000, vatBp: 1400 }, { type: "account", accountId: acc["6205"], qty: 1, price: 500_000, vatBp: 0, memo: "نقل" }] }, boss);
    // 2,000,000 + 500,000 less 100,000 spread 80,000 / 20,000
    expect([doc.data.net, doc.data.vat, doc.data.total]).toEqual([2_400_000, 268_800, 2_668_800]);
    expect((await db.list("stockLevels")).filter((l) => l.itemId === T.mayo).reduce((s, l) => s + l.qty, 0)).toBe(before + 10 * factor);
    expect((await db.get("stockItems", T.mayo))!.lastCost).toBe(Math.round(1_920_000 / (10 * factor)));
    expect(await balance("2108")).toBe(0);
    expect(await balance("1110")).toBe(268_800);
    expect(await balance(supAcc.code)).toBe(-2_668_800);
    expect(await balance("6205")).toBe(700 + 480_000);
    await expect(postPurchase(db, { supplierId: sup.id, date: "2026-11-11", invoiceNo: "A-1", due: "", payment: "credit", moneyId: null, discount: 0, note: "", branchId: null, lines: [{ type: "account", accountId: acc["6205"], qty: 1, price: 5, vatBp: 0 }] }, boss)).rejects.toThrow("نفس الرقم");
    await expect(postPurchase(db, { supplierId: sup.id, date: "2026-10-11", invoiceNo: "A-0", due: "", payment: "credit", moneyId: null, discount: 0, note: "", branchId: null, lines: [{ type: "item", itemId: T.mayo, locationId: T.fridge, qty: 1, price: 5, vatBp: 0 }] }, boss)).rejects.toThrow("قبل تاريخ بداية");
  });

  it("a return takes stock out and the price difference goes to price variances", async () => {
    const stock = await balance("1106");
    await postReturn(db, { supplierId: sup.id, date: "2026-11-12", refund: "credit", moneyId: null, note: "", branchId: null, lines: [{ type: "item", itemId: T.mayo, locationId: T.fridge, qty: 1, price: 200_000, vatBp: 1400 }] }, boss);
    expect(await balance("2108")).toBe(0);
    const left = stock - (await balance("1106"));
    expect(left).toBeGreaterThan(0);
    expect(await balance("5108")).toBe(left - 200_000);
    expect(await balance(supAcc.code)).toBe(-2_668_800 + 228_000);
    await expect(postReturn(db, { supplierId: sup.id, date: "2026-11-12", refund: "credit", moneyId: null, note: "", branchId: null, lines: [{ type: "item", itemId: T.mayo, locationId: T.fridge, qty: 1e6, price: 1, vatBp: 0 }] }, boss)).rejects.toThrow("أقل من المرتجع");
  });

  it("a payment with tax withheld, then what is still open and how old it is", async () => {
    await submitEntry(db, null, { date: "2026-11-01", memo: "cap", branchId: null, lines: [{ account: acc["110101"], debit: 5_000_000, credit: 0 }, { account: acc["3101"], debit: 0, credit: 5_000_000 }] }, boss);
    const e = await paySupplier(db, { supplierId: sup.id, date: "2026-11-15", moneyId: acc["110101"], amount: 990_000, withholdBp: 100, discount: 40_800, memo: "", branchId: null }, boss);
    expect([e.kind, e.meta.voucherNo, e.meta.withheld]).toEqual(["payment", 1, 10_000]);
    expect(await balance("210401")).toBe(-10_000);
    expect(await balance("4203")).toBe(-40_800);
    expect(await balance(supAcc.code)).toBe(-1_400_000);
    const entries = await db.list("finEntries");
    const open = openItems(supAcc.id, entries, (x) => (x.meta?.due as string) ?? null, 30);
    expect(open.items.map((i) => [i.due, i.open])).toEqual([["2026-12-10", 1_400_000]]);
    expect(ageing(open.items, "2026-11-18")).toEqual([1_400_000, 0, 0, 0, 0]);
    expect(ageing(open.items, "2027-01-20")).toEqual([0, 0, 1_400_000, 0, 0]);
  });
});
