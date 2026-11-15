/**
 * The Westeros tenant and the batch flow end to end on the in-browser backend:
 * seed → a chef makes a batch → numbered, signed, costed, in stock with an expiry lot → void puts everything back.
 */
import { describe, expect, it } from "vitest";
import { LocalAdapter } from "@/data/local/LocalAdapter";
import { makeDb } from "@/data/hooks";
import { staffId } from "@/data/seed";
import { buildWesterosSeed, productId, productStockId, rawItemId, WESTEROS_BRANCH_ID, WESTEROS_RESTAURANT_ID } from "@/data/westeros/seed";
import { WESTEROS_MENU } from "@/data/westeros/menu";
import { major } from "@/lib/money";
import { levelId } from "@/modules/inventory/stock";
import { seedId } from "@/lib/id";
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
  it("prices raw materials per manufacturing unit like the sheet", () => {
    const raw = seed.data.stockItems.filter((i) => i.kind === "raw");
    expect(raw).toHaveLength(282);
    // جبنة شيدر: قالب 829.56 ÷ 200 قطعة = 4.1478 للقطعة
    const cheddar = raw.find((i) => i.sku === "10001")!;
    expect(cheddar.baseUnit).toBe("pc");
    expect(cheddar.lastCost).toBe(Math.round(major(829.56) / 200));
    // صوص شيدر: جالون 2.5 كجم بـ 462.65 → 185.06 للكيلو
    const sauce = raw.find((i) => i.sku === "10004")!;
    expect(sauce.baseUnit).toBe("g");
    expect(sauce.lastCost * 1000).toBe(major(185.06));
  });
  it("has the manufactured products, the chefs and the meat cuts of the sheet", () => {
    expect(seed.data.mfgProducts).toHaveLength(37);
    const s = seed.data.mfgSettings[0];
    expect(s.meatTypes).toHaveLength(7);
    expect(s.meatTypes.every((m) => m.stockItemId && seed.data.stockItems.some((i) => i.id === m.stockItemId))).toBe(true);
    expect(Object.keys(s.chefCodes)).toHaveLength(4);
    expect(seed.data.memberships.filter((m) => m.role === "chef").map((m) => m.name)).toEqual(["عبد الله صقر", "عماد السوق", "محمد رجب", "محمد عثمان"]);
    expect(seed.data.mfgProducts.every((p) => seed.data.stockItems.some((i) => i.id === p.stockItemId))).toBe(true);
  });
});

describe("batch flow", async () => {
  const repo = new LocalAdapter({ name: `mfg-test-${Math.random()}`, memory: true, buildSeed: buildWesterosSeed, now: () => NOW });
  await repo.ready();
  const chef = { id: staffId("chef3"), name: "محمد رجب" };
  const db = makeDb(repo, R, B, chef.id);
  const mayo = rawItemId(17002); // مايونيز ساندويش هاينز (3ك)
  const bag = rawItemId(11027); // كيس ثلاجة
  const fridge = seedId("sufra-zamalek:location:fridge");
  const madeAt = "2026-11-15T09:00:00.000Z";

  it("refuses an incomplete batch", async () => {
    await expect(saveBatch(db, { method: "weight", productId: productId("stark-sauce"), meals: 1, netKg: 0, lines: [], packaging: [] }, { chef, branchId: B })).rejects.toBeInstanceOf(BatchError);
  });

  it("saves a sauce batch signed by the chef", async () => {
    const items = new Map((await db.list("stockItems")).map((i) => [i.id, i]));
    const b = await saveBatch(db, { method: "weight", productId: productId("stark-sauce"), meals: 2, netKg: 1.98, lines: [{ itemId: mayo, qty: 2000 }], packaging: [{ itemId: bag, qty: 2 }] }, { chef, branchId: B, madeAt });
    expect(b.number).toBe("1-15112026#1(3)");
    expect(b.chefName).toBe("محمد رجب");
    expect(b.waste).toBe(20);
    const total = Math.round(2000 * items.get(mayo)!.lastCost) + Math.round(2 * items.get(bag)!.lastCost);
    expect(b.totalCost).toBe(total);
    expect(b.outputs[0].unitCost).toBe(Math.round(total / 1.98));
    expect(b.outputs[0].expiresAt).toBe("2026-11-18T09:00:00.000Z");
    // stock: mayo out, sauce in at the batch cost, with an expiry lot
    const sauce = await db.get("stockLevels", levelId(R, fridge, productStockId("stark-sauce")));
    expect(sauce?.qty).toBe(1980);
    expect(sauce?.value).toBe(total);
    const lots = await db.list("stockBatches", { where: { lot: b.number } });
    expect(lots.map((l) => [l.remaining, l.expiresOn])).toEqual([[1980, "2026-11-18"]]);
    expect((await db.get("stockItems", productStockId("stark-sauce")))?.lastCost).toBe(Math.round(b.outputs[0].unitCost / 1000));
  });

  it("numbers the second run of the same product that day", async () => {
    const b = await saveBatch(db, { method: "weight", productId: productId("stark-sauce"), meals: 1, netKg: 1, lines: [{ itemId: mayo, qty: 1000 }], packaging: [] }, { chef: { id: staffId("chef"), name: "عبد الله صقر" }, branchId: B, madeAt });
    expect(b.number).toBe("1-15112026#2(1)");
  });

  it("makes burgers from a meat cut", async () => {
    const s = (await db.list("mfgSettings"))[0];
    const cut = s.meatTypes.find((m) => m.name.ar === "سوبريم لحم وش فخدة")!;
    const b = await saveBatch(
      db,
      { method: "burger", kind: "beef", meatTypeId: cut.id, meatKg: 25, netKg: 24, fatKg: 7, lines: [], packaging: [], products: [{ productId: productId("beef-burger-150"), count: 200 }, { productId: productId("beef-burger-80"), count: 12 }] },
      { chef, branchId: B, madeAt },
    );
    expect(b.number).toBe("5-15112026#1(3)");
    expect(b.debrisKg).toBe(1);
    expect(b.suggestedFatKg).toBe(7.2);
    expect(b.outputs.map((o) => o.count)).toEqual([200, 12]);
    // 328 EGP/kg topside × 25 kg; the prepared fat has no price yet
    expect(b.totalCost).toBe(major(328 * 25));
    expect((await db.get("stockLevels", levelId(R, fridge, productStockId("beef-burger-150"))))?.qty).toBe(200);
  });

  it("voiding returns the stock and keeps the number", async () => {
    const [first] = (await db.list("mfgBatches", { where: { number: "1-15112026#1(3)" } }));
    const before = (await db.get("stockLevels", levelId(R, fridge, productStockId("stark-sauce"))))!.qty;
    const v = await voidBatch(db, first.id, { reason: "اختبار", by: chef.id });
    expect(v.status).toBe("void");
    expect((await db.get("stockLevels", levelId(R, fridge, productStockId("stark-sauce"))))!.qty).toBe(before - 1980);
    await expect(voidBatch(db, first.id, { reason: "x", by: null })).rejects.toThrow();
    const again = await saveBatch(db, { method: "weight", productId: productId("stark-sauce"), meals: 1, netKg: 1, lines: [{ itemId: mayo, qty: 1000 }], packaging: [] }, { chef, branchId: B, madeAt });
    expect(again.number).toBe("1-15112026#3(3)");
  });
});
