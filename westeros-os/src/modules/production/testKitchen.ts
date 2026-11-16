/**
 * A tiny kitchen for the tests only: the tenant starts with no raw materials or products, so the tests bring their own
 * (one sauce made by weight, two burger sizes, a meat cut, fat, a bag). Not imported by the app.
 */
import { seedId } from "@/lib/id";
import { major } from "@/lib/money";
import type { MfgProduct, StockItem } from "@/data/types";
import { buildWesterosSeed, WESTEROS_RESTAURANT_ID } from "@/data/westeros/seed";

const id = (k: string) => seedId(`test-kitchen:${k}`);
export const T = {
  mayo: id("raw:mayo"), bag: id("raw:bag"), meat: id("raw:meat"), fat: id("raw:fat"),
  sauce: id("mfg:sauce"), sauceStock: id("stock:sauce"), burger150: id("mfg:burger-150"), burger150Stock: id("stock:burger-150"), burger80: id("mfg:burger-80"), burger80Stock: id("stock:burger-80"),
  cut: id("cut"), fridge: seedId("sufra-zamalek:location:fridge"),
};

export function buildTestKitchen(now: Date = new Date()) {
  const seed = buildWesterosSeed(now);
  const created = now.toISOString();
  const base = { restaurantId: WESTEROS_RESTAURANT_ID, createdAt: created, updatedAt: created };
  const L = (s: string) => ({ ar: s, en: s });
  const stock = (sid: string, name: string, kind: "raw" | "prep", baseUnit: "g" | "pc", lastCost: number): StockItem => ({
    ...base, id: sid, name: L(name), sku: name, category: kind === "prep" ? "prep" : "dry", kind, baseUnit, packs: [], countUnit: baseUnit === "g" ? "kg" : "pc", account: "food",
    levels: { min: 0, par: 0, max: 0 }, branchLevels: {}, supplierIds: [], preferredSupplierId: null, lastCost, defaultLocationIds: [T.fridge], trackBatches: kind === "prep", shelfLifeDays: null, vatBp: 0, yieldBp: 10_000,
    allergens: [], active: true, note: "", marketKey: null,
  });
  const product = (pid: string, sid: string, name: string, p: Partial<MfgProduct>, sort: number): MfgProduct => ({
    ...base, id: pid, code: `M00${sort}`, name: L(name), category: "cold_sauce", categoryCode: 1, method: "weight", chickenMode: null, recipeType: "main", unit: "kg", portionGrams: null, storageMethod: "", storageTemp: "chilled",
    shelfLifeDays: 3, ingredientsText: "", lines: [], packaging: [], stockItemId: sid, active: true, sort, ...p,
  });
  seed.data.stockItems.push(
    stock(T.mayo, "خامة صوص", "raw", "g", Math.round(major(100) / 1000)),
    stock(T.bag, "كيس", "raw", "pc", major(2)),
    stock(T.meat, "لحم", "raw", "g", Math.round(major(328) / 1000)),
    stock(T.fat, "دهن", "raw", "g", Math.round(major(100) / 1000)),
    stock(T.sauceStock, "صوص", "prep", "g", 0),
    stock(T.burger150Stock, "برجر 150", "prep", "pc", 0),
    stock(T.burger80Stock, "برجر 80", "prep", "pc", 0),
  );
  const burger = { category: "beef_burger", categoryCode: 5, method: "burger" as const, unit: "pc" as const, storageTemp: "frozen" as const };
  seed.data.mfgProducts.push(product(T.sauce, T.sauceStock, "صوص", {}, 1), product(T.burger150, T.burger150Stock, "برجر 150", { ...burger, portionGrams: 150 }, 2), product(T.burger80, T.burger80Stock, "برجر 80", { ...burger, portionGrams: 80 }, 3));
  const s = seed.data.mfgSettings[0];
  s.meatTypes = [{ id: T.cut, name: L("قطعية"), stockItemId: T.meat, fatGramsPerKg: 300 }];
  s.rawFatItemId = T.fat;
  return seed;
}
