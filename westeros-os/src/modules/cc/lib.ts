/**
 * Cost Control version — shared rules. Everything here follows the "Cost Control System" document:
 * constants (section 4), the raw material card and its two results (3.1), and the units a stock line is typed in.
 */
import type { CodeRange, MfgLists, MfgSettings, MfgUnitDef, MfgUserType, RawSpec, StockItem, StorageLocation, Units } from "@/data/types";

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

/* ───────── أنواع المستخدمين ───────── */

export const DEFAULT_USER_TYPES: MfgUserType[] = [
  { id: "chef", name: "شيف", from: 1, count: 100, role: "chef" },
  { id: "kitchen", name: "مساعد مطبخ", from: 101, count: 100, role: "kitchen" },
  { id: "manager", name: "مدير", from: 201, count: 100, role: "manager" },
  { id: "admin", name: "إداري", from: 301, count: 100, role: "admin" },
];
/** الصلاحيات: the screens of the system, in the order of the menu. A user type ticks the ones its users may open. */
export const SCREENS: { id: string; label: string }[] = [
  { id: "cc-summary", label: "الملخص" },
  { id: "cc-stores", label: "المخازن" },
  { id: "cc-catalog", label: "قائمة المنتجات والخامات" },
  { id: "cc-constants", label: "ثوابت النظام" },
  { id: "cc-mfg", label: "التصنيع" },
  { id: "cc-users", label: "المستخدمين" },
];
const ROLE_SCREENS: Record<MfgUserType["role"], string[]> = {
  kitchen: ["cc-summary", "cc-stores", "cc-catalog", "cc-mfg"],
  chef: ["cc-summary", "cc-stores", "cc-catalog", "cc-constants", "cc-mfg"],
  manager: ["cc-summary", "cc-stores", "cc-catalog", "cc-constants", "cc-mfg"],
  admin: SCREENS.map((x) => x.id),
};
/** The screens a type's users may open: its checklist, else what its permissions level allowed before checklists. */
export const screensOf = (t: MfgUserType): string[] => t.screens ?? ROLE_SCREENS[t.role];
const LEVELS: MfgUserType["role"][] = ["kitchen", "chef", "manager", "admin"];
/**
 * The database level a checklist needs, so saving works on every ticked screen:
 * المستخدمين needs the admin level; المخازن، المنتجات والخامات، الثوابت need at least the chef level.
 */
export function roleForScreens(screens: string[], current: MfgUserType["role"]): MfgUserType["role"] {
  if (screens.includes("cc-users")) return "admin";
  const min: MfgUserType["role"] = screens.some((x) => x === "cc-stores" || x === "cc-catalog" || x === "cc-constants") ? "chef" : "kitchen";
  const cur = current === "admin" ? "manager" : current;
  return LEVELS.indexOf(cur) >= LEVELS.indexOf(min) ? cur : min;
}
/** The types with their code ranges filled in: a type saved without a range gets the next free hundred. */
export function userTypesOf(lists: MfgLists): MfgUserType[] {
  const types = lists.userTypes?.length ? lists.userTypes : DEFAULT_USER_TYPES;
  let next = 1;
  return types.map((t) => {
    const from = t.from && t.from > 0 ? t.from : next;
    const count = t.count && t.count > 0 ? t.count : 100;
    next = Math.max(next, from + count);
    return { ...t, from, count };
  });
}
export const rangeOf = (t: MfgUserType) => ({ from: t.from ?? 1, to: (t.from ?? 1) + (t.count ?? 100) - 1 });
/** The type whose range crosses this type's range, if any: the ranges must not overlap. */
export function overlapping(t: MfgUserType, all: MfgUserType[]): MfgUserType | null {
  const a = rangeOf(t);
  return all.find((x) => x.id !== t.id && rangeOf(x).from <= a.to && a.from <= rangeOf(x).to) ?? null;
}
/** طبيعة المستخدم: the type chosen for the member, else the type that matches the member's permissions. */
export function userTypeOf(member: { id: string; role: string }, lists: MfgLists): MfgUserType | null {
  const types = userTypesOf(lists);
  return types.find((t) => t.id === lists.userTypeOf?.[member.id]) ?? types.find((t) => t.role === member.role) ?? null;
}
/** كود المستخدم بناء على طبيعته: the member's own code if it is inside the type's range, else the first free code of the range (0 = the range is full). */
export function nextUserCode(type: MfgUserType, codes: Record<string, number>, memberId?: string): number {
  const { from, to } = rangeOf(type);
  const own = memberId ? codes[memberId] : undefined;
  if (own && own >= from && own <= to) return own;
  const used = new Set(Object.entries(codes).filter(([id]) => id !== memberId).map(([, c]) => c));
  for (let c = from; c <= to; c++) if (!used.has(c)) return c;
  return 0;
}

/* ───────── أكواد الفئات: every category has a code range, and a new item takes the next free code of its category ───────── */

export type CodeKind = "raw" | "sale" | "product";
const digits = (code: string | null | undefined) => Number(String(code ?? "").replace(/\D/g, "")) || 0;
const crosses = (a: CodeRange, b: CodeRange) => a.from <= b.from + b.count - 1 && b.from <= a.from + a.count - 1;
/**
 * The range of every category, in the order given. A saved range wins; else the block the category's existing codes
 * already sit in (`seed`); else the next free block after all of those.
 */
export function codeRanges(saved: Record<string, CodeRange> | undefined, keys: string[], seed?: (key: string) => CodeRange | null, block = 100): Record<string, CodeRange> {
  const out: Record<string, CodeRange> = {};
  for (const k of keys) {
    const r = saved?.[k];
    if (r && r.from > 0 && r.count > 0) out[k] = r;
  }
  for (const k of keys) {
    const r = out[k] ? null : seed?.(k);
    if (r && !Object.values(out).some((x) => crosses(x, r))) out[k] = r;
  }
  for (const k of keys) {
    if (out[k]) continue;
    const top = Math.max(0, ...Object.values(out).map((x) => x.from + x.count - 1));
    out[k] = { from: Math.ceil(top / block) * block + 1, count: block };
  }
  return out;
}
/** Raw materials: categories whose codes already sit in one thousand (10001, 10002 …) keep that thousand. */
export function rawRanges(lists: MfgLists, raws: StockItem[]): Record<string, CodeRange> {
  const min = new Map<string, number>();
  for (const i of raws) {
    const n = digits(i.sku), c = specOf(i, lists).category;
    if (n > 0 && (!min.has(c) || n < min.get(c)!)) min.set(c, n);
  }
  const seed = (c: string) => (min.has(c) ? { from: Math.floor((min.get(c)! - 1) / 1000) * 1000 + 1, count: 999 } : null);
  return codeRanges(lists.codeRanges?.raw, lists.rawCategories, seed, min.size ? 1000 : 100);
}
/** The first free code of the range, 0 when the range is full. */
export function nextCodeIn(range: CodeRange | undefined, used: Iterable<string | null | undefined>): number {
  if (!range) return 0;
  const taken = new Set([...used].map(digits));
  for (let c = range.from; c < range.from + range.count; c++) if (!taken.has(c)) return c;
  return 0;
}
/** Why a typed range is refused, or "" when it is fine. */
export function rangeProblem(key: string, next: CodeRange, all: Record<string, CodeRange>, nameOf: (key: string) => string): string {
  if (!(Number.isInteger(next.from) && Number.isInteger(next.count) && next.from >= 1 && next.count >= 1)) return "اكتب رقم صحيح من 1 أو أكثر";
  const clash = Object.entries(all).find(([k, r]) => k !== key && crosses(r, next));
  return clash ? `الأكواد دي متداخلة مع "${nameOf(clash[0])}" (من ${clash[1].from} إلى ${clash[1].from + clash[1].count - 1})` : "";
}
