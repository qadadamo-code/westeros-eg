/** طلب شراء (2026-11-21): bought → the keeper documents the receipt (nothing moves) → the purchase invoice enters it. */
import { describe, expect, it } from "vitest";
import { T } from "@/modules/production/testKitchen";
import { lineUnit } from "../lib";
import { financeDb } from "../finance/testDb";
import { loadDefaultChart, saveSettings } from "../finance/ops";
import { postPurchase, saveSupplier } from "../finance/purchaseOps";
import { awaitingInvoices, documentReceipt, markBought } from "./purchase";
import { pendingFor } from "./supply";

const L = (s: string) => ({ ar: s, en: s });

describe("a purchase request from asking to the invoice", async () => {
  const db = await financeDb();
  await loadDefaultChart(db);
  await saveSettings(db, { startDate: "2026-11-01", costing: "average" });
  const mayo = (await db.get("stockItems", T.mayo))!;
  const factor = lineUnit(mayo).factor;
  const onHand = async () => (await db.list("stockLevels")).filter((l) => l.itemId === T.mayo).reduce((s, l) => s + l.qty, 0);
  const keeper = { id: "keeper", name: "أمين المخزن", role: "chef" };
  const buyer = { id: "buyer", name: "المشتريات", role: "chef" };
  const lists = { userTypes: [{ id: "b", name: "مشتريات", from: 1, count: 5, role: "chef" as const, perms: ["purchase.handle"] }], userTypeOf: { buyer: "b" } } as never;
  const st = { locations: [], levels: [] };
  const req = await db.insert("stockRequests", {
    kind: "purchase", number: 1, at: "2026-11-21T09:00:00.000Z", dueDate: "2026-11-22", branchLocationId: null, branchId: null,
    lines: [{ itemId: T.mayo, name: L("مايونيز"), qty: 10, unit: lineUnit(mayo).label, kind: "raw" }], keeperId: keeper.id, keeperName: keeper.name,
    status: "new", note: "", toLocationId: null, receivedAt: null, sentAt: null, history: [],
  });
  const before = await onHand();

  it("the buyer is told; after تم الشراء the keeper who asked is told to document the receipt", async () => {
    expect(pendingFor(buyer, lists, [req], st).toBuy).toHaveLength(1);
    const bought = await markBought(db, req, buyer);
    expect(bought.status).toBe("sent");
    expect(pendingFor(buyer, lists, [bought], st).toBuy).toHaveLength(0);
    const k = pendingFor(keeper, lists, [bought], st);
    expect([k.toConfirm.length, k.purchase, k.supply]).toEqual([1, 1, 0]);
  });

  it("documenting the receipt keeps the stock as it was and waits for the invoice", async () => {
    await expect(documentReceipt(db, req.id, keeper, "2026-11-22", { [T.mayo]: { qty: 8, locationId: null } })).rejects.toThrow();
    const done = await documentReceipt(db, req.id, keeper, "2026-11-22", { [T.mayo]: { qty: 8, locationId: T.fridge } });
    expect([done.status, done.receivedAt?.slice(0, 10), done.lines[0].receivedQty]).toEqual(["done", "2026-11-22", 8]);
    expect(await onHand()).toBe(before);
    expect(awaitingInvoices(await db.list("stockRequests")).map((r) => r.id)).toEqual([req.id]);
    expect(pendingFor(keeper, lists, [done], st).count).toBe(0);
  });

  it("the purchase invoice enters the received quantity and closes it", async () => {
    const sup = await saveSupplier(db, null, { name: "مورد", active: true, data: { phone: "", taxId: "", address: "", contact: "", note: "", termsDays: 0, withholdBp: 0 } });
    const doc = await postPurchase(db, { supplierId: sup.id, date: "2026-11-22", invoiceNo: "", due: "", payment: "credit", moneyId: null, discount: 0, note: "", branchId: null, requestId: req.id,
      lines: [{ type: "item", itemId: T.mayo, locationId: T.fridge, qty: 8, price: 100_000, vatBp: 0 }] }, { id: null, name: "م", canApprove: true });
    expect(await onHand()).toBe(before + 8 * factor);
    const r = (await db.get("stockRequests", req.id))!;
    expect(r.lines[0].invoiceId).toBe(doc.id);
    expect(awaitingInvoices(await db.list("stockRequests"))).toHaveLength(0);
  });
});
