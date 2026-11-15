/**
 * The Westeros tenant: "وستروس – مدينة نصر". This is what the app starts with (LocalAdapter) instead of the Sufra demo.
 *
 *  - structure (floor, stations, chart of accounts, cash accounts, storage locations, settings defaults) comes from the
 *    base seed, emptied of every demo transaction;
 *  - the menu is the restaurant's published menu (./menu.ts);
 *  - the 282 raw materials with purchase unit, manufacturing unit and conversion come from the Cost Control sheet
 *    (./rawMaterials.json); last purchase price → cost per manufacturing unit, exactly as the sheet computes it;
 *  - manufactured products, meat cuts, portion weights and the four chefs come from the sheet's "الريسبي" tab.
 *
 * No orders, stock balances, journal entries or staff files are invented: those start empty.
 */
import { major } from "@/lib/money";
import type { Role } from "@/auth/roles";
import type { BaseUnit, Collections, Localized, Membership, MenuCategory, MenuItem, MfgProduct, MfgSettings, StaffCompensation, StockCategory, StockAccount, StockItem } from "../types";
import { buildSeed, DEMO_BRANCH_ID, DEMO_RESTAURANT_ID, hashPassword, hashPin, staffId, userId, type Seed, type SeedData, type SeedUser } from "../seed";
import { seedId } from "@/lib/id";
import { COLLECTIONS } from "../types";
import RAW from "./rawMaterials.json";
import { WESTEROS_MENU } from "./menu";
import { CATEGORY_CODE, RAW_CODES, WESTEROS_MEAT_TYPES, WESTEROS_PRODUCTS, WESTEROS_STORAGE_METHODS } from "./products";

export const WESTEROS_SLUG = "westeros";
export const WESTEROS_PASSWORD = "westeros2026";
export const WESTEROS_RESTAURANT_ID = DEMO_RESTAURANT_ID;
export const WESTEROS_BRANCH_ID = DEMO_BRANCH_ID;
export const BRAND = { navy: "#0D0D0D", gold: "#F8BB18" } as const;

/** First accounts. Chef names are the ones in the Cost Control sheet; the rest are role placeholders to rename in Staff. */
export const WESTEROS_STAFF: { key: string; name: string; role: Role; pin: string; email?: string; color: string; phone: string }[] = [
  { key: "owner", name: "إدارة وستروس", role: "owner", pin: "1000", email: "owner@westeros.local", color: "#0D0D0D", phone: "" },
  { key: "admin", name: "مدير النظام", role: "admin", pin: "2000", email: "admin@westeros.local", color: "#6b4fa0", phone: "" },
  { key: "manager", name: "مدير الفرع", role: "manager", pin: "3000", email: "manager@westeros.local", color: "#a8700c", phone: "" },
  { key: "cashier1", name: "كاشير 1", role: "cashier", pin: "4000", color: "#c2412d", phone: "" },
  { key: "cashier2", name: "كاشير 2", role: "cashier", pin: "4100", color: "#2f6f9f", phone: "" },
  { key: "waiter1", name: "جرسون 1", role: "waiter", pin: "5000", color: "#1d7f4a", phone: "" },
  { key: "waiter2", name: "جرسون 2", role: "waiter", pin: "5100", color: "#b4531f", phone: "" },
  { key: "chef", name: "عبد الله صقر", role: "chef", pin: "6000", color: "#7a5a12", phone: "" },
  { key: "chef2", name: "عماد السوق", role: "chef", pin: "6100", color: "#4b6b3a", phone: "" },
  { key: "chef3", name: "محمد رجب", role: "chef", pin: "6200", color: "#3a5f7a", phone: "" },
  { key: "chef4", name: "محمد عثمان", role: "chef", pin: "6300", color: "#9a3b6b", phone: "" },
  { key: "kitchen", name: "مساعد مطبخ", role: "kitchen", pin: "7000", color: "#5f7a3a", phone: "" },
  { key: "delivery", name: "طيار 1", role: "delivery", pin: "8000", color: "#7a3a5f", phone: "" },
  { key: "accountant", name: "المحاسب", role: "accountant", pin: "9000", email: "accountant@westeros.local", color: "#5b6a64", phone: "" },
];

const L = (ar: string, en: string): Localized => ({ ar, en });
const id = (k: string) => seedId(`westeros:${k}`);

interface RawRow {
  code: number;
  name: string;
  buyUnit: string;
  cat: number;
  price: number;
  date: string | null;
  mfgUnit: string;
  perUnit: number;
}

/** فئة الصنف in the sheet → stock category, GL account, where it is kept, purchase VAT. */
const RAW_CATEGORY: Record<number, { cat: StockCategory; acc: StockAccount; loc: "store" | "kitchen" | "fridge" | "bar"; vat: number; label: string }> = {
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
export const rawCategoryLabel = (n: number) => RAW_CATEGORY[n]?.label ?? "";

const MFG_BASE: Record<string, BaseUnit> = { "كيلو": "g", "لتر": "ml", "قطعة": "pc" };

export const rawItemId = (code: number) => id(`raw:${code}`);
export const productId = (k: string) => id(`mfg:${k}`);
export const productStockId = (k: string) => id(`mfg-stock:${k}`);

export function buildWesterosSeed(now: Date = new Date()): Seed {
  const demo = buildSeed(now);
  const R = WESTEROS_RESTAURANT_ID;
  const B = WESTEROS_BRANCH_ID;
  const created = now.toISOString();
  const base = (k: string) => ({ id: id(k), restaurantId: R, createdAt: created, updatedAt: created });
  const mine = <T extends { restaurantId?: string; id: string }>(rows: T[]) => rows.filter((r) => (r.restaurantId ?? R) === R);

  const data = Object.fromEntries(COLLECTIONS.map((c) => [c, []])) as unknown as SeedData;
  const keep = <C extends keyof Collections>(c: C) => void ((data[c] as unknown[]) = mine(demo.data[c] as unknown as { restaurantId?: string; id: string }[]));

  /* ── tenant ── */
  const r0 = demo.data.restaurants.find((r) => r.id === R)!;
  data.restaurants = [{ ...r0, slug: WESTEROS_SLUG, name: L("وستروس", "Westeros"), brandColor: BRAND.navy, phone: null, ownerUserId: userId("owner"), createdAt: created, updatedAt: created }];
  const b0 = demo.data.branches.find((b) => b.id === B)!;
  data.branches = [{ ...b0, name: L("مدينة نصر", "Nasr City"), slug: "nasr-city", address: L("مدينة نصر، القاهرة", "Nasr City, Cairo"), phone: "", createdAt: created, updatedAt: created }];

  /* ── staff ── */
  const users: SeedUser[] = WESTEROS_STAFF.filter((s) => s.email).map((s) => ({ id: userId(s.key), email: s.email!, name: s.name, passwordHash: hashPassword(s.email!, WESTEROS_PASSWORD) }));
  const pins: Record<string, string> = {};
  const pinHashes: Record<string, string> = {};
  const memberships: Membership[] = WESTEROS_STAFF.map((s) => {
    const mid = staffId(s.key);
    pins[mid] = s.pin;
    pinHashes[mid] = hashPin(R, mid, s.pin);
    return { id: mid, restaurantId: R, createdAt: created, updatedAt: created, userId: s.email ? userId(s.key) : null, name: s.name, role: s.role, branchIds: [], phone: s.phone || null, email: s.email ?? null, color: s.color, hasPin: true, active: true, lastSeenAt: null };
  });
  data.memberships = memberships;
  // salaries are not known: zero until HR fills them in
  data.staffCompensation = WESTEROS_STAFF.filter((s) => s.role !== "owner").map((s): StaffCompensation => ({ ...base(`comp:${s.key}`), membershipId: staffId(s.key), monthlySalary: 0, hourlyRate: 0 }));

  /* ── structure kept from the base seed, with no transactions ── */
  for (const c of ["zones", "floorDecor", "printers", "glAccounts", "costCentres", "cashAccounts", "storageLocations", "opsSettings", "loyaltyPrograms", "shiftTemplates", "deliveryZones"] as const) keep(c);
  data.tables = mine(demo.data.tables).map((t) => ({ ...t, code: t.code.replace("ZM", "WS"), status: "free" as const, statusSince: null }));
  const stationNames: Record<string, Localized> = { grill: L("الجريل", "Grill"), hot: L("القلاية والساخن", "Fryer & hot"), cold: L("البارد والسلطات", "Cold & salads"), pastry: L("الحلويات", "Desserts"), bar: L("البار", "Drinks bar") };
  data.kitchenStations = mine(demo.data.kitchenStations).map((s) => {
    const k = Object.keys(stationNames).find((x) => s.id === seedId(`sufra-zamalek:station:${x}`));
    return k ? { ...s, name: stationNames[k] } : s;
  });
  data.accountingSettings = mine(demo.data.accountingSettings).map((a) => ({ ...a, closedThrough: null, closeHistory: [], payrollEstimate: 0 }));
  data.settings = mine(demo.data.settings).map((s) => ({
    ...s,
    // menu prices are what the guest pays (VAT inside); no service charge until the restaurant says otherwise
    tax: { ...s.tax, priceMode: "inclusive" as const, serviceModes: [], taxId: "", commercialRegister: "" },
    invoice: { ...s.invoice, header: L("وستروس – مدينة نصر", "Westeros – Nasr City"), footer: L("شكرًا لزيارتكم", "Thank you for your visit") },
  }));

  /* ── menu ── */
  const stationId = (k: string) => seedId(`sufra-zamalek:station:${k}`);
  const menuCategories: MenuCategory[] = [];
  const menuItems: MenuItem[] = [];
  WESTEROS_MENU.forEach((c, ci) => {
    const cid = id(`cat:${c.k}`);
    menuCategories.push({ ...base(`cat:${c.k}`), name: L(c.ar, c.en), sort: ci + 1, color: c.color, icon: c.icon, stationId: stationId(c.station), active: true });
    c.items.forEach((it, ii) =>
      menuItems.push({
        ...base(`item:${it.k}`), categoryId: cid, name: L(it.ar, it.en), description: L(it.desc ?? "", ""), price: major(it.price), cost: null, sku: it.k.toUpperCase().slice(0, 24), stationId: null,
        modifierGroupIds: [], tags: it.spicy ? ["spicy"] : [], prepMinutes: it.prep ?? 5, available: true, vatExempt: false, imageUrl: null, sort: ii + 1, active: true,
        calories: it.kcal ?? null,
      }),
    );
  });
  data.menuCategories = menuCategories;
  data.menuItems = menuItems;

  /* ── raw materials (Cost Control sheet → مواد الخام) ── */
  const locId = (k: string) => seedId(`sufra-zamalek:location:${k}`);
  const stockItems: StockItem[] = (RAW as RawRow[]).map((r) => {
    const c = RAW_CATEGORY[r.cat] ?? RAW_CATEGORY[17];
    const baseUnit = MFG_BASE[r.mfgUnit] ?? "pc";
    // الكمية في الوحدة: manufacturing units per purchase unit → base units per purchase unit
    const factor = Math.max(0.001, (r.perUnit || 1) * (baseUnit === "pc" ? 1 : 1000));
    return {
      ...base(`raw:${r.code}`), name: L(r.name, r.name), sku: String(r.code), category: c.cat, kind: "raw", baseUnit,
      packs: [{ id: "buy", name: L(r.buyUnit, r.buyUnit), factor }], countUnit: "buy", account: c.acc,
      levels: { min: 0, par: 0, max: 0 }, branchLevels: {}, supplierIds: [], preferredSupplierId: null,
      // سعر وحدة التصنيع = اخر سعر شراء × معامل التحويل (1 ÷ الكمية في الوحدة)
      lastCost: Math.round(major(r.price) / factor),
      defaultLocationIds: [locId(c.loc)], trackBatches: false, shelfLifeDays: null, vatBp: c.vat, yieldBp: 10_000, allergens: [], active: true,
      note: [rawCategoryLabel(r.cat), r.date ? `آخر شراء ${r.date}` : ""].filter(Boolean).join(" · "), marketKey: null,
    };
  });
  const rawByCode = new Map((RAW as RawRow[]).map((r) => [r.code, rawItemId(r.code)]));

  /* ── manufactured products (الريسبي) ── */
  const mfgProducts: MfgProduct[] = WESTEROS_PRODUCTS.map((p, i) => {
    const temp = p.temp ?? "chilled";
    const sid = productStockId(p.k);
    stockItems.push({
      ...base(`mfg-stock:${p.k}`), name: L(p.ar, p.en), sku: `M${String(i + 1).padStart(3, "0")}`, category: "prep", kind: "prep", baseUnit: p.unit === "kg" ? "g" : "pc", packs: [], countUnit: p.unit === "kg" ? "kg" : "pc",
      account: "food", levels: { min: 0, par: 0, max: 0 }, branchLevels: {}, supplierIds: [], preferredSupplierId: null, lastCost: 0, defaultLocationIds: [locId(temp === "room" ? "store" : "fridge")],
      trackBatches: true, shelfLifeDays: null, vatBp: 0, yieldBp: 10_000, allergens: [], active: true, note: "منتج مصنع", marketKey: null,
    });
    return {
      ...base(`mfg:${p.k}`), code: `M${String(i + 1).padStart(3, "0")}`, name: L(p.ar, p.en), category: p.category, categoryCode: CATEGORY_CODE[p.category], method: p.method, chickenMode: p.chickenMode ?? null,
      recipeType: p.recipeType ?? "main", unit: p.unit, portionGrams: p.portion ?? null, storageMethod: p.method === "burger" ? "نايلون مكبس" : "", storageTemp: temp,
      // shelf life is not in the sheet: a cautious default to review per product
      shelfLifeDays: temp === "frozen" ? 30 : 3, ingredientsText: "", lines: [], packaging: [], stockItemId: sid, active: true, sort: i + 1,
    };
  });
  data.stockItems = stockItems;
  data.mfgProducts = mfgProducts;

  const chefs = WESTEROS_STAFF.filter((s) => s.role === "chef");
  const settings: MfgSettings = {
    ...base("mfg-settings"), id: R,
    chefCodes: Object.fromEntries(chefs.map((s, i) => [staffId(s.key), i + 1])),
    meatTypes: WESTEROS_MEAT_TYPES.map((m) => ({ id: id(`meat:${m.k}`), name: L(m.ar, m.ar), stockItemId: rawByCode.get(m.code) ?? null, fatGramsPerKg: m.fat })),
    storageMethods: WESTEROS_STORAGE_METHODS,
    chickenItemId: rawByCode.get(RAW_CODES.chicken) ?? null,
    rawFatItemId: rawByCode.get(RAW_CODES.rawFat) ?? null,
    burgerFatItemId: productStockId("fat-ready"),
    mincedChickenItemId: productStockId("chicken-mince"),
    productLocationId: locId("fridge"),
  };
  data.mfgSettings = [settings];

  return { data, users, pins, pinHashes };
}
