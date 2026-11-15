/** The daily production plan and the recipe-against-actual comparison, on the Westeros tenant. */
import { describe, expect, it } from "vitest";
import { LocalAdapter } from "@/data/local/LocalAdapter";
import { makeDb } from "@/data/hooks";
import { staffId } from "@/data/seed";
import type { MfgProduct, StockItem, StockMove } from "@/data/types";
import { buildWesterosSeed, productId, rawItemId, WESTEROS_BRANCH_ID, WESTEROS_RESTAURANT_ID } from "@/data/westeros/seed";
import { saveBatch } from "./ops";
import { buildPlan, roundUp } from "./plan";
import { batchVariance, varianceReport } from "./variance";

const R = WESTEROS_RESTAURANT_ID;
const B = WESTEROS_BRANCH_ID;
// Sunday 2026-11-15, noon in Cairo
const NOW = "2026-11-15T10:00:00.000Z";

describe("daily production plan", () => {
  const seed = buildWesterosSeed(new Date(NOW));
  const sauce = seed.data.mfgProducts.find((p) => p.id === productId("stark-sauce"))!;
  const burger = seed.data.mfgProducts.find((p) => p.id === productId("beef-burger-150"))!;
  const items = (par: Record<string, number> = {}) => new Map<string, StockItem>(seed.data.stockItems.map((i) => [i.id, { ...i, levels: { ...i.levels, par: par[i.id] ?? 0 } }]));
  const move = (itemId: string, day: string, qty: number, kind: StockMove["kind"] = "sale") => ({ itemId, kind, qty: -qty, at: `${day}T12:00:00.000Z` });
  const plan = (p: Partial<Parameters<typeof buildPlan>[0]>) => buildPlan({ products: [sauce, burger], items: items(), onHand: new Map(), moves: [], batches: [], now: NOW, ...p });
  const row = (rows: ReturnType<typeof buildPlan>, p: MfgProduct) => rows.find((r) => r.product.id === p.id)!;

  it("rounds kilos up to the half kilo and pieces to the whole piece", () => {
    expect(roundUp(1.2, "kg")).toBe(1.5);
    expect(roundUp(2, "kg")).toBe(2);
    expect(roundUp(10.2, "pc")).toBe(11);
    expect(roundUp(-3, "kg")).toBe(0);
  });

  it("has no suggestion for a product with no minimum and no history", () => {
    const r = row(plan({}), sauce);
    expect(r.status).toBe("unknown");
    expect(r.suggest).toBe(0);
  });

  it("tops up to the daily minimum", () => {
    const r = row(plan({ items: items({ [sauce.stockItemId]: 5000 }), onHand: new Map([[sauce.stockItemId, 1800]]) }), sauce);
    expect(r.par).toBe(5);
    expect(r.onHand).toBe(1.8);
    expect(r.suggest).toBe(3.5); // 3.2 kg short → next half kilo
    expect(r.status).toBe("make");
  });

  it("forecasts from the same weekday of the last weeks, with a safety margin", () => {
    // the last three Sundays used 100, 120 and 140 burgers; other days are ignored
    const moves = [move(burger.stockItemId, "2026-11-08", 100), move(burger.stockItemId, "2026-11-01", 120), move(burger.stockItemId, "2026-10-25", 140), move(burger.stockItemId, "2026-11-12", 900)];
    const r = row(plan({ moves, onHand: new Map([[burger.stockItemId, 38]]) }), burger);
    expect(r.basis).toBe("weekday");
    expect(r.samples).toBe(3);
    expect(r.forecast).toBe(120);
    expect(r.needed).toBe(138); // +15%
    expect(r.suggest).toBe(100);
  });

  it("counts what goes into other batches and gives back reversals", () => {
    const moves = [move(burger.stockItemId, "2026-11-08", 50, "production_out"), move(burger.stockItemId, "2026-11-08", 60), { ...move(burger.stockItemId, "2026-11-08", -10), kind: "sale_reversal" as const }, move(burger.stockItemId, "2026-11-08", 30, "waste")];
    expect(row(plan({ moves }), burger).forecast).toBe(100);
  });

  it("uses the daily average while there is less than a week of history", () => {
    const moves = [move(burger.stockItemId, "2026-11-13", 60), move(burger.stockItemId, "2026-11-14", 80)];
    const r = row(plan({ moves }), burger);
    expect(r.basis).toBe("recent");
    expect(r.forecast).toBe(70);
  });

  it("says enough when stock covers the need, and ignores what expires today", () => {
    const batches = [{ status: "done" as const, day: "2026-11-12", outputs: [{ ...({} as MfgProduct), productId: sauce.id, unit: "kg" as const, weightKg: 4, count: null, expiresAt: "2026-11-15T09:00:00.000Z" }] }] as unknown as Parameters<typeof buildPlan>[0]["batches"];
    const base = { items: items({ [sauce.stockItemId]: 3000 }), onHand: new Map([[sauce.stockItemId, 4000]]) };
    expect(row(plan(base), sauce).status).toBe("ok");
    const r = row(plan({ ...base, batches }), sauce);
    expect(r.expiring).toBe(4);
    expect(r.suggest).toBe(3);
  });
});

describe("recipe against actual", () => {
  const repo = new LocalAdapter({ memory: true, now: () => new Date(NOW), buildSeed: buildWesterosSeed });
  const db = makeDb(repo, R, B, staffId("chef3"));
  const chef = { id: staffId("chef3"), name: "محمد رجب" };
  const mayo = rawItemId(17002);
  const bag = rawItemId(11027);
  const madeAt = "2026-11-15T09:00:00.000Z";

  it("leaves a product without a recipe out of the comparison", async () => {
    const b = await saveBatch(db, { method: "weight", productId: productId("stark-sauce"), meals: 2, netKg: 1.9, lines: [{ itemId: mayo, qty: 2000 }], packaging: [] }, { chef, branchId: B, madeAt });
    const products = new Map((await db.list("mfgProducts")).map((p) => [p.id, p]));
    expect(batchVariance(b, products).hasStandard).toBe(false);
  });

  it("prices what the chef used over and under the recipe", async () => {
    // the recipe: 1 kg mayo and 1 bag per meal
    await db.update("mfgProducts", productId("stark-sauce"), { lines: [{ itemId: mayo, qty: 1000 }], packaging: [{ itemId: bag, qty: 1 }] });
    const b = await saveBatch(db, { method: "weight", productId: productId("stark-sauce"), meals: 3, netKg: 3, lines: [{ itemId: mayo, qty: 3300 }], packaging: [{ itemId: bag, qty: 2 }] }, { chef, branchId: B, madeAt });
    const products = new Map((await db.list("mfgProducts")).map((p) => [p.id, p]));
    const items = new Map((await db.list("stockItems")).map((i) => [i.id, i]));
    const v = batchVariance(b, products);
    expect(v.hasStandard).toBe(true);
    const m = v.lines.find((l) => l.itemId === mayo)!;
    expect([m.standard, m.actual, m.diff]).toEqual([3000, 3300, 300]);
    expect(m.diffValue).toBe(Math.round(300 * items.get(mayo)!.lastCost));
    const g = v.lines.find((l) => l.itemId === bag)!;
    expect(g.diff).toBe(-1);
    expect(v.diffValue).toBe(v.actualCost - v.standardCost);

    const rep = varianceReport(await db.list("mfgBatches"), products, "2026-11-01T00:00:00.000Z", "2026-11-30T00:00:00.000Z");
    expect(rep.totals.batches).toBe(2);
    // the first batch (2 meals, 2 kg mayo, no bag) now has a standard too: exactly on the mayo, 2 bags under
    expect(rep.totals.compared).toBe(2);
    expect(rep.totals.over).toBe(m.diffValue);
    expect(rep.byChef[0].name).toBe("محمد رجب");
    expect(rep.byItem.find((i) => i.itemId === mayo)?.diff).toBe(300);
    expect(rep.byItem.find((i) => i.itemId === bag)?.diff).toBe(-3);
  });

  it("counts the trimmings of meat batches per chef", async () => {
    const s = (await db.list("mfgSettings"))[0];
    const cut = s.meatTypes.find((x) => x.name.ar === "سوبريم لحم وش فخدة")!;
    await saveBatch(db, { method: "burger", kind: "beef", meatTypeId: cut.id, meatKg: 25, netKg: 24, fatKg: 7, lines: [], packaging: [], products: [{ productId: productId("beef-burger-150"), count: 200 }] }, { chef, branchId: B, madeAt });
    const products = new Map((await db.list("mfgProducts")).map((p) => [p.id, p]));
    const rep = varianceReport(await db.list("mfgBatches"), products, "2026-11-01T00:00:00.000Z", "2026-11-30T00:00:00.000Z");
    expect(rep.totals.debrisKg).toBe(1);
    expect(rep.totals.mainKg).toBe(25);
    expect(rep.totals.debrisValue).toBe(Math.round(1000 * (await db.get("stockItems", cut.stockItemId!))!.lastCost));
    expect(rep.byChef[0].debrisKg).toBe(1);
  });
});
