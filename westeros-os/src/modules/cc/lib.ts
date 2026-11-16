/**
 * Cost Control version — shared rules. Everything here follows the "Cost Control System" document:
 * constants (section 4), the raw material card and its two results (3.1), and the units a stock line is typed in.
 */
import type { MfgLists, MfgSettings, MfgUnitDef, RawSpec, StockItem, StorageLocation, Units } from "@/data/types";

export const DEFAULT_LISTS: MfgLists = {
  storageUnits: ["كيلو", "لتر", "قطعة", "كرتونة", "جالون", "بالة"],
  mfgUnits: [
    { name: "كيلو", base: "g", factor: 1000 },
    { name: "جرام", base: "g", factor: 1 },
    { name: "لتر", base: "ml", factor: 1000 },
    { name: "قطعة", base: "pc", factor: 1 },
  ],
  rawCategories: ["مشروبات", "صوصات"],
  warehouseTypes: [
    { id: "raw", name: "مخزن خامات", holds: "raw" },
    { id: "products", name: "مخزن منتجات", holds: "products" },
    { id: "branch", name: "فرع مطعم", holds: "branch" },
  ],
  burgerTypes: [
    { id: "beef", name: "برجر لحم" },
    { id: "chicken", name: "برجر دجاج" },
  ],
  recipeNames: { main: "الوصفة الرئيسية", sub: "الوصفة الفرعية", marinade: "التتبيلة" },
};

export const listsOf = (s: Pick<MfgSettings, "lists"> | null | undefined): MfgLists => ({ ...DEFAULT_LISTS, ...(s?.lists ?? {}) });

const unitByName = (lists: MfgLists, name: string): MfgUnitDef => lists.mfgUnits.find((u) => u.name === name) ?? lists.mfgUnits[0] ?? DEFAULT_LISTS.mfgUnits[0];

/** معامل التحويل = 1 ÷ الكمية في وحدة التخزين */
export const conversionOf = (perStorage: number) => (perStorage > 0 ? 1 / perStorage : 0);
/** سعر وحدة التصنيع = اخر سعر شراء × معامل التحويل */
export const mfgUnitPrice = (lastPrice: Units, perStorage: number): Units => Math.round(lastPrice * conversionOf(perStorage));

/** The raw material card of an item. Items saved before the card existed get one read back from their units. */
export function specOf(item: StockItem, lists: MfgLists): RawSpec {
  if (item.spec) return item.spec;
  const buy = item.packs.find((p) => p.id === "buy") ?? item.packs[0] ?? null;
  const big = lists.mfgUnits.find((u) => u.base === item.baseUnit && u.factor > 1) ?? lists.mfgUnits.find((u) => u.base === item.baseUnit) ?? DEFAULT_LISTS.mfgUnits[3];
  const factor = buy?.factor ?? big.factor;
  return {
    image: null,
    category: item.note || "",
    storageUnit: buy?.name.ar ?? big.name,
    mfgUnit: big.name,
    perStorage: Math.round((factor / big.factor) * 1000) / 1000,
    lastPrice: Math.round(item.lastCost * factor),
    lastPurchaseDate: null,
    expiryDate: null,
  };
}

/** What the stock engine needs from a raw material card: base unit, the storage unit as a pack, cost per base unit. */
export function stockFieldsOf(spec: RawSpec, lists: MfgLists): Pick<StockItem, "baseUnit" | "packs" | "countUnit" | "lastCost"> {
  const u = unitByName(lists, spec.mfgUnit);
  const factor = Math.max(0.001, (spec.perStorage || 1) * u.factor);
  return {
    baseUnit: u.base,
    packs: [{ id: "buy", name: { ar: spec.storageUnit, en: spec.storageUnit }, factor }],
    countUnit: "buy",
    lastCost: Math.round(spec.lastPrice / factor),
  };
}

/** The unit a stock quantity is typed and shown in: the storage unit of a raw material, kilo or piece of a product. */
export function lineUnit(item: Pick<StockItem, "kind" | "baseUnit" | "packs">): { label: string; factor: number } {
  if (item.kind === "raw") {
    const buy = item.packs.find((p) => p.id === "buy") ?? item.packs[0];
    if (buy) return { label: buy.name.ar, factor: buy.factor };
  }
  if (item.baseUnit === "g") return { label: "كيلو", factor: 1000 };
  if (item.baseUnit === "ml") return { label: "لتر", factor: 1000 };
  return { label: "قطعة", factor: 1 };
}
export const toLine = (baseQty: number, item: Pick<StockItem, "kind" | "baseUnit" | "packs">) => Math.round((baseQty / lineUnit(item).factor) * 1000) / 1000;
export const toBaseQty = (qty: number, item: Pick<StockItem, "kind" | "baseUnit" | "packs">) => Math.round(qty * lineUnit(item).factor * 1000) / 1000;

/** نوع المخزن of a location. Locations saved before types existed are raw material stores. */
export function warehouseType(loc: Pick<StorageLocation, "type">, lists: MfgLists) {
  return lists.warehouseTypes.find((t) => t.id === loc.type) ?? lists.warehouseTypes[0] ?? DEFAULT_LISTS.warehouseTypes[0];
}
/** *** المخزن فيه اصناف حسب نوعه (مواد الخام او المنتجات المصنعة); a branch holds the products it is supplied with. */
export function holds(loc: Pick<StorageLocation, "type">, item: Pick<StockItem, "kind">, lists: MfgLists) {
  const h = warehouseType(loc, lists).holds;
  return h === "raw" ? item.kind === "raw" : item.kind === "prep";
}

export const REQUEST_STATUS = {
  done: { ar: "انتهت", tone: "ok" },
  in_progress: { ar: "قيد التنفيذ", tone: "info" },
  rejected: { ar: "مرفوضة", tone: "danger" },
  postponed: { ar: "مؤجلة", tone: "warn" },
} as const;

export const num = (n: number, digits = 3) => new Intl.NumberFormat("en-US", { maximumFractionDigits: digits }).format(n);
export const nowLocal = () => {
  const d = new Date(Date.now() - new Date().getTimezoneOffset() * 60_000);
  return d.toISOString().slice(0, 16);
};
export const fromLocal = (s: string) => (s ? new Date(s).toISOString() : new Date().toISOString());
export const fmtAt = (iso: string) => new Date(iso).toLocaleString("ar-EG-u-nu-latn", { timeZone: "Africa/Cairo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
export const fmtDay = (d: string | null | undefined) => (d ? d.split("-").reverse().join("/") : "—");
