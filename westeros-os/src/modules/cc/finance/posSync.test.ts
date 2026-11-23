/** الكاشير ← الحسابات: a closed shift is posted once as a sales summary whose entry balances and lands on the right accounts. */
import { afterAll, describe, expect, it } from "vitest";
import { LocalAdapter } from "@/data/local/LocalAdapter";
import { makeDb } from "@/data/hooks";
import { DEMO_BRANCH_ID, DEMO_RESTAURANT_ID, staffId } from "@/data/seed";
import { major } from "@/lib/money";
import { addLine, loadTicket, openTicket } from "@/modules/pos/ops";
import { closeCheck, closeShift, openShift, refundSale, takePayment } from "@/modules/pos/sale";
import { loadDefaultChart, saveSettings } from "./ops";
import { shiftSales, syncShifts } from "./posSync";
import { SALES_DAY, salesOf } from "./sales";

const repo = new LocalAdapter({ name: "pos-sync-test", memory: true, sessionKey: "pos-sync-test.session" });
afterAll(() => repo.close());
const db = makeDb(repo, DEMO_RESTAURANT_ID, DEMO_BRANCH_ID, staffId("cashier1"));
const boss = { id: null, name: "م", canApprove: true };

async function sell(mode: "dine_in" | "takeaway", lines: [number, number][]) {
  const cats = await db.list("menuCategories");
  const items = (await db.list("menuItems")).filter((i) => i.price > 0);
  const { check, order } = await openTicket(db, { mode, pickup: false, tableIds: [], guests: 2, customerId: null, deliveryFee: 0, delivery: null, pickupAt: null });
  for (const [ix, qty] of lines) {
    const t = (await loadTicket(db, check.id))!;
    await addLine(db, { orderId: order.id, checkId: check.id, items: t.items, tableId: null }, { item: items[ix], modifiers: [], qty, notes: "", seat: null, course: 1 }, cats);
  }
  return (await loadTicket(db, check.id))!.check;
}

describe("till shifts in الحسابات", () => {
  it("posts a closed shift once, balanced, with the drawer's short on فروق خزينة", async () => {
    await repo.ready();
    await loadDefaultChart(db);
    await saveSettings(db, { startDate: "2026-11-01", costing: "average" });
    const shift = await openShift(db, "SYNC1", major(500));
    const a = await sell("dine_in", [[0, 2], [1, 1]]);
    await takePayment(db, a, { method: "card", amount: a.total, tip: major(10), tendered: null });
    const ra = await closeCheck(db, a.id, { shift, device: "SYNC1" });
    const b = await sell("takeaway", [[2, 1]]);
    await takePayment(db, b, { method: "cash", amount: b.total, tip: 0, tendered: b.total });
    await closeCheck(db, b.id, { shift, device: "SYNC1" });
    await refundSale(db, ra.receipt, [{ lineId: ra.receipt.bill.lines[0].id, qty: 1 }], "card", { shift, device: "SYNC1", approvedBy: null, reason: "test" });
    const { z } = await closeShift(db, shift, major(500) + b.total - major(5));

    const r1 = await syncShifts(db, boss);
    expect(r1.problems).toEqual([]);
    expect(r1.posted).toBe(1);
    expect((await syncShifts(db, boss)).posted).toBe(0);

    const [doc] = await db.list("finDocs", { where: { kind: SALES_DAY } });
    const s = salesOf(doc);
    expect(s.shiftId).toBe(shift.id);
    expect(s.orders).toBe(2);
    const entry = (await db.list("finEntries")).find((e) => e.id === s.entryId)!;
    const d = entry.lines.reduce((t, l) => t + l.debit, 0), c = entry.lines.reduce((t, l) => t + l.credit, 0);
    expect(d).toBe(c);
    const accounts = await db.list("finAccounts");
    // the tax as the receipts worked it out
    expect(s.vat).toBe(z.sales.vat - z.returns.vat);
    expect(s.net).toBe(z.sales.net - z.returns.net);
    // the drawer was 5 short
    const diff = accounts.find((x) => x.code === "6601")!;
    expect(entry.lines.find((l) => l.account === diff.id)?.debit).toBe(major(5));
  });

  it("works the summary out of the receipts", () => {
    const bill = { mode: "takeaway" as const, lines: [], gross: 1000, discount: 100, net: 900, service: 0, vat: 126, deliveryFee: 0, deliveryVat: 0, total: 1026, payable: 1026, rounding: 0 };
    const r = (kind: "SC" | "RC", method: "cash" | "card") => ({ kind, bill, payments: [{ method, amount: 1026, tip: 0 }] }) as never;
    const v = shiftSales({ id: "s", device: "P1", zNumber: 3, difference: -50 }, [r("SC", "cash"), r("SC", "card"), r("RC", "card")], (m) => m);
    expect(v.channels["sales.takeaway"]).toBe(2000);
    expect(v.discounts).toBe(200);
    expect(v.returns).toBe(900);
    expect(v.vatAmount).toBe(126);
    expect(v.payments).toEqual([{ accountId: "cash", amount: 976 }, { accountId: "card", amount: 0 }]);
  });
});

