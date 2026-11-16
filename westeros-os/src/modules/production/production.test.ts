/**
 * The Westeros tenant and the batch flow end to end on the in-browser backend:
 * seed → a chef makes a batch → numbered, signed, costed, in stock with an expiry lot → void puts everything back.
 */
import { describe, expect, it } from "vitest";
import { LocalAdapter } from "@/data/local/LocalAdapter";
import { makeDb } from "@/data/hooks";
import { staffId } from "@/data/seed";
import { buildWesterosSeed, WESTEROS_BRANCH_ID, WESTEROS_RESTAURANT_ID } from "@/data/westeros/seed";
import { DEFAULT_CATEGORIES } from "./defaults";
import { buildTestKitchen, T } from "./testKitchen";
import { WESTEROS_MENU } from "@/data/westeros/menu";
import { major } from "@/lib/money";
import { levelId } from "@/modules/inventory/stock";
import { BatchError, saveBatch, voidBatch } from "./ops";

const R = WESTEROS_RESTAURANT_ID;
const B = WESTEROS_BRANCH_ID;
const NOW = new Date("2026-11-15T10:00:00Z");

describe("Westeros seed", () => {
  const seed = buildWesterosSeed(NOW);
  it("is one restaurant with no demo transactions", () => {
    expect(seed.data.restaurants.map((r) => r.slug)).toEqual(["westeros"]);
    for (const c of ["orders", "checks", "payments", "ledgerEntries", "stockMoves", "stockLevels", "customers", "purchaseOrders"] as const) expect(seed.data[c]).toHaveLength(0);
    for (const c of Object.keys(seed.data) as (keyof typeof seed.data)[]) for (const row of seed.data[c] as { restaurantId?: string }[]) if (row.restaurantId) expect(row.restaurantId).toBe(R);
  });
  it("carries the menu as published", () => {
    expect(seed.data.menuItems).toHaveLength(WESTEROS_MENU.reduce((a, c) => a + c.items.length, 0));
    expect(seed.data.menuItems.find((m) => m.name.ar === "كلاسيك بيف برجر")?.price).toBe(major(195));
    expect(new Set(seed.data.menuItems.map((m) => m.id)).size).toBe(seed.data.menuItems.length);
  });
  it("starts with warehouse-only items, no products or meat cuts: only the constants", () => {
    expect(seed.data.stockItems).toHaveLength(282);
    // warehouse and purchasing only: no price, never offered to recipes or manufacturing
    expect(seed.data.stockItems.every((i) => i.mfg === false && i.lastCost === 0 && i.kind === "raw")).toBe(true);
    expect(seed.data.mfgProducts).toHaveLength(0);
    const s = seed.data.mfgSettings[0];
    expect(s.meatTypes).toHaveLength(0);
    expect([s.chickenItemId, s.rawFatItemId, s.mincedChickenItemId]).toEqual([null, null, null]);
    expect(s.productCategories).toEqual(DEFAULT_CATEGORIES);
    expect(Object.keys(s.chefCodes)).toHaveLength(4);
  });
});

describe("batch flow", async () => {
  const repo = new LocalAdapter({ name: `mfg-test-${Math.random()}`, memory: true, buildSeed: buildTestKitchen, now: () => NOW });
  await repo.ready();
  const chef = { id: staffId("chef3"), name: "شيف 3" };
  const db = makeDb(repo, R, B, chef.id);
  const { mayo, bag, fridge } = T;
  const madeAt = "2026-11-15T09:00:00.000Z";

  it("refuses an incomplete batch", async () => {
    await expect(saveBatch(db, { method: "weight", productId: T.sauce, meals: 1, netKg: 0, lines: [], packaging: [] }, { chef, branchId: B })).rejects.toBeInstanceOf(BatchError);
  });

  it("saves a sauce batch signed by the chef", async () => {
    const items = new Map((await db.list("stockItems")).map((i) => [i.id, i]));
    const b = await saveBatch(db, { method: "weight", productId: T.sauce, meals: 2, netKg: 1.98, lines: [{ itemId: mayo, qty: 2000 }], packaging: [{ itemId: bag, qty: 2 }] }, { chef, branchId: B, madeAt });
    expect(b.number).toBe("1-15112026#1(3)");
    expect(b.chefName).toBe("شيف 3");
    expect(b.waste).toBe(-20);
    const total = Math.round(2000 * items.get(mayo)!.lastCost) + Math.round(2 * items.get(bag)!.lastCost);
    expect(b.totalCost).toBe(total);
    expect(b.outputs[0].unitCost).toBe(Math.round(total / 1.98));
    expect(b.outputs[0].expiresAt).toBe("2026-11-18T09:00:00.000Z");
    // stock: mayo out, sauce in at the batch cost, with an expiry lot
    const sauce = await db.get("stockLevels", levelId(R, fridge, T.sauceStock));
    expect(sauce?.qty).toBe(1980);
    expect(sauce?.value).toBe(total);
    const lots = await db.list("stockBatches", { where: { lot: b.number } });
    expect(lots.map((l) => [l.remaining, l.expiresOn])).toEqual([[1980, "2026-11-18"]]);
    expect((await db.get("stockItems", T.sauceStock))?.lastCost).toBe(Math.round(b.outputs[0].unitCost / 1000));
  });

  it("numbers the second run of the same product that day", async () => {
    const b = await saveBatch(db, { method: "weight", productId: T.sauce, meals: 1, netKg: 1, lines: [{ itemId: mayo, qty: 1000 }], packaging: [] }, { chef: { id: staffId("chef"), name: "شيف 1" }, branchId: B, madeAt });
    expect(b.number).toBe("1-15112026#2(1)");
  });

  it("makes burgers from a meat cut", async () => {
    const s = (await db.list("mfgSettings"))[0];
    const cut = s.meatTypes[0];
    const b = await saveBatch(
      db,
      { method: "burger", kind: "beef", meatTypeId: cut.id, meatKg: 25, netKg: 24, fatKg: 7, lines: [], packaging: [], products: [{ productId: T.burger150, count: 200 }, { productId: T.burger80, count: 12 }] },
      { chef, branchId: B, madeAt },
    );
    expect(b.number).toBe("5-15112026#1(3)");
    expect(b.debrisKg).toBe(1);
    expect(b.suggestedFatKg).toBe(7.2);
    expect(b.outputs.map((o) => o.count)).toEqual([200, 12]);
    // 328 EGP/kg meat × 25 kg + the fat at its purchase price, 100 EGP/kg × 7 kg
    expect(b.totalCost).toBe(major(328 * 25 + 100 * 7));
    expect((await db.get("stockLevels", levelId(R, fridge, T.burger150Stock)))?.qty).toBe(200);
  });

  it("voiding returns the stock and keeps the number", async () => {
    const [first] = (await db.list("mfgBatches", { where: { number: "1-15112026#1(3)" } }));
    const before = (await db.get("stockLevels", levelId(R, fridge, T.sauceStock)))!.qty;
    const v = await voidBatch(db, first.id, { reason: "اختبار", by: chef.id });
    expect(v.status).toBe("void");
    expect((await db.get("stockLevels", levelId(R, fridge, T.sauceStock)))!.qty).toBe(before - 1980);
    await expect(voidBatch(db, first.id, { reason: "x", by: null })).rejects.toThrow();
    const again = await saveBatch(db, { method: "weight", productId: T.sauce, meals: 1, netKg: 1, lines: [{ itemId: mayo, qty: 1000 }], packaging: [] }, { chef, branchId: B, madeAt });
    expect(again.number).toBe("1-15112026#3(3)");
  });
});
