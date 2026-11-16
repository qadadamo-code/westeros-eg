/**
 * Warehouse and purchasing items: names, purchase units and categories only, so a purchase request has its items ready.
 * They are warehouse-only (`mfg: false`): no quantity, and hidden from recipes and manufacturing until a manager
 * switches an item on. Each carries the restaurant's last purchase price and last purchase date where it has one.
 */
import type { BaseUnit, StockAccount, StockCategory, StockItem } from "../types";
import ITEMS from "./warehouseItems.json";

interface Row { code: number; name: string; buyUnit: string; cat: number; mfgUnit: string; perUnit: number; price: number; date: string | null }

const CATEGORY: Record<number, { cat: StockCategory; acc: StockAccount; loc: "store" | "kitchen" | "fridge" | "bar"; vat: number; label: string }> = {
  2: { cat: "dairy", acc: "food", loc: "fridge", vat: 1400, label: "ألبان وأجبان" },
  3: { cat: "packaging", acc: "packaging", loc: "store", vat: 1400, label: "مستهلكات وأكواب" },
  4: { cat: "spices", acc: "food", loc: "store", vat: 1400, label: "بهارات" },
  5: { cat: "drinks", acc: "beverage", loc: "bar", vat: 1400, label: "خامات مشروبات وحلويات" },
  6: { cat: "dry", acc: "food", loc: "store", vat: 1400, label: "بقالة جافة" },
  7: { cat: "produce", acc: "food", loc: "fridge", vat: 0, label: "خضار وفاكهة" },
  8: { cat: "dry", acc: "food", loc: "store", vat: 1400, label: "زيوت ودهون" },
  9: { cat: "dry", acc: "food", loc: "store", vat: 1400, label: "صوصات جاهزة" },
  10: { cat: "meat", acc: "food", loc: "fridge", vat: 0, label: "لحوم ودواجن" },
  11: { cat: "dry", acc: "food", loc: "store", vat: 1400, label: "متفرقات" },
  12: { cat: "dry", acc: "food", loc: "fridge", vat: 1400, label: "مجمدات" },
  13: { cat: "bakery", acc: "food", loc: "store", vat: 1400, label: "مخبوزات" },
  14: { cat: "drinks", acc: "beverage", loc: "bar", vat: 1400, label: "مشروبات جاهزة" },
  15: { cat: "cleaning", acc: "packaging", loc: "store", vat: 1400, label: "منظفات" },
  16: { cat: "packaging", acc: "packaging", loc: "store", vat: 1400, label: "تغليف" },
  17: { cat: "dry", acc: "food", loc: "store", vat: 1400, label: "أخرى" },
};
const BASE: Record<string, BaseUnit> = { "كيلو": "g", "لتر": "ml", "قطعة": "pc" };

type RowBase = Pick<StockItem, "id" | "restaurantId" | "createdAt" | "updatedAt">;

export function warehouseItems(base: (key: string) => RowBase, locId: (k: string) => string): StockItem[] {
  return (ITEMS as Row[]).map((r) => {
    const c = CATEGORY[r.cat] ?? CATEGORY[17];
    const baseUnit = BASE[r.mfgUnit] ?? "pc";
    const factor = Math.max(0.001, (r.perUnit || 1) * (baseUnit === "pc" ? 1 : 1000));
    const lastPrice = Math.round(r.price * 100_000); // Units for one storage unit
    const priced = r.price > 0 || !!r.date;
    return {
      ...base(`raw:${r.code}`), name: { ar: r.name, en: r.name }, sku: String(r.code), category: c.cat, kind: "raw", baseUnit,
      packs: [{ id: "buy", name: { ar: r.buyUnit, en: r.buyUnit }, factor }], countUnit: "buy", account: c.acc,
      levels: { min: 0, par: 0, max: 0 }, branchLevels: {}, supplierIds: [], preferredSupplierId: null, lastCost: Math.round(lastPrice / factor),
      defaultLocationIds: [locId(c.loc)], trackBatches: false, shelfLifeDays: null, vatBp: c.vat, yieldBp: 10_000, allergens: [], active: true,
      note: c.label, marketKey: null, mfg: false,
      spec: priced ? { image: null, category: c.label, storageUnit: r.buyUnit, mfgUnit: r.mfgUnit, perStorage: r.perUnit || 1, lastPrice, lastPurchaseDate: r.date, expiryDate: null } : null,
    };
  });
}
