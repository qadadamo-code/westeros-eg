/**
 * The Westeros tenant: "وستروس – مدينة نصر". This is what the app starts with (LocalAdapter) instead of the Sufra demo.
 *
 *  - structure (floor, stations, chart of accounts, cash accounts, storage locations, settings defaults) comes from the
 *    base seed, emptied of every demo transaction;
 *  - the menu is the restaurant's published menu (./menu.ts);
 *  - raw materials, manufactured products, recipes and meat cuts start EMPTY. The only reference for manufacturing
 *    is the "Cost Control System" document: the restaurant enters its own items (or imports them from Excel by
 *    code), and the constants start from the lists that document gives as examples.
 *
 * No orders, stock balances, journal entries or staff files are invented: those start empty.
 */
import { major } from "@/lib/money";
import type { Role } from "@/auth/roles";
import type { Collections, Localized, Membership, MenuCategory, MenuItem, MfgSettings, StaffCompensation } from "../types";
import { defaultRows } from "@/modules/checklists/defaults";
import { buildSeed, DEMO_BRANCH_ID, DEMO_RESTAURANT_ID, hashPassword, hashPin, staffId, userId, type Seed, type SeedData, type SeedUser } from "../seed";
import { seedId } from "@/lib/id";
import { COLLECTIONS } from "../types";
import { WESTEROS_MENU } from "./menu";
import { WESTEROS_ORIGIN, WESTEROS_ZONES } from "./delivery";
import { warehouseItems } from "./warehouse";
import { DEFAULT_CATEGORIES, DEFAULT_STORAGE_METHODS } from "@/modules/production/defaults";

export const WESTEROS_SLUG = "westeros";
export const WESTEROS_PASSWORD = "westeros2026";
export const WESTEROS_RESTAURANT_ID = DEMO_RESTAURANT_ID;
export const WESTEROS_BRANCH_ID = DEMO_BRANCH_ID;
export const BRAND = { navy: "#0D0D0D", gold: "#F8BB18" } as const;

/** First accounts: role placeholders to rename in Staff. */
export const WESTEROS_STAFF: { key: string; name: string; role: Role; pin: string; email?: string; color: string; phone: string }[] = [
  { key: "owner", name: "إدارة وستروس", role: "owner", pin: "1000", email: "owner@westeros.local", color: "#0D0D0D", phone: "" },
  { key: "admin", name: "مدير النظام", role: "admin", pin: "2000", email: "admin@westeros.local", color: "#6b4fa0", phone: "" },
  { key: "manager", name: "مدير الفرع", role: "manager", pin: "3000", email: "manager@westeros.local", color: "#a8700c", phone: "" },
  { key: "cashier1", name: "كاشير 1", role: "cashier", pin: "4000", color: "#c2412d", phone: "" },
  { key: "cashier2", name: "كاشير 2", role: "cashier", pin: "4100", color: "#2f6f9f", phone: "" },
  { key: "waiter1", name: "جرسون 1", role: "waiter", pin: "5000", color: "#1d7f4a", phone: "" },
  { key: "waiter2", name: "جرسون 2", role: "waiter", pin: "5100", color: "#b4531f", phone: "" },
  { key: "chef", name: "شيف 1", role: "chef", pin: "6000", color: "#7a5a12", phone: "" },
  { key: "chef2", name: "شيف 2", role: "chef", pin: "6100", color: "#4b6b3a", phone: "" },
  { key: "chef3", name: "شيف 3", role: "chef", pin: "6200", color: "#3a5f7a", phone: "" },
  { key: "chef4", name: "شيف 4", role: "chef", pin: "6300", color: "#9a3b6b", phone: "" },
  { key: "kitchen", name: "مساعد مطبخ", role: "kitchen", pin: "7000", color: "#5f7a3a", phone: "" },
  { key: "delivery", name: "طيار 1", role: "delivery", pin: "8000", color: "#7a3a5f", phone: "" },
  { key: "accountant", name: "المحاسب", role: "accountant", pin: "9000", email: "accountant@westeros.local", color: "#5b6a64", phone: "" },
];

const L = (ar: string, en: string): Localized => ({ ar, en });
const id = (k: string) => seedId(`westeros:${k}`);

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
  for (const c of ["zones", "floorDecor", "printers", "glAccounts", "cashAccounts", "storageLocations", "shiftTemplates"] as const) keep(c);
  // delivery areas and fees as the restaurant publishes them (./delivery.ts)
  data.deliveryZones = WESTEROS_ZONES.map((z, i) => ({
    ...base(`dzone:${z.slug}`), branchId: null, slug: z.slug, name: L(z.ar, z.ar), fee: major(z.fee), minOrder: 0, freeOver: null, etaMin: z.eta, etaMax: z.eta, geometry: null, hours: null, color: z.color, sort: i + 1, active: true,
  }));
  // names and phone numbers of the base seed do not belong to Westeros
  data.costCentres = mine(demo.data.costCentres).map((x) => (x.code === "ZM" ? { ...x, name: L("فرع مدينة نصر", "Nasr City branch") } : x));
  data.loyaltyPrograms = mine(demo.data.loyaltyPrograms).map((x) => ({ ...x, name: L("نادي وستروس", "Westeros Club") }));
  data.opsSettings = mine(demo.data.opsSettings).map((x) => ({ ...x, hotlinePhone: "", whatsappPhone: "" }));
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
    delivery: s.delivery ? { ...s.delivery, origin: WESTEROS_ORIGIN } : s.delivery,
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

  /* ── manufacturing: no items, only the constants ── */
  const locId = (k: string) => seedId(`sufra-zamalek:location:${k}`);
  // warehouse and purchasing items only: not usable in recipes or manufacturing
  data.stockItems = warehouseItems(base, locId);
  const chefs = WESTEROS_STAFF.filter((s) => s.role === "chef");
  const settings: MfgSettings = {
    ...base("mfg-settings"), id: R,
    chefCodes: Object.fromEntries(chefs.map((s, i) => [staffId(s.key), i + 1])),
    productCategories: DEFAULT_CATEGORIES,
    meatTypes: [],
    storageMethods: DEFAULT_STORAGE_METHODS,
    chickenItemId: null,
    rawFatItemId: null,
    mincedChickenItemId: null,
    productLocationId: locId("fridge"),
  };
  data.mfgSettings = [settings];

  /* ── shift opening / closing checklists ── */
  data.checklistTemplates = defaultRows().map((d) => ({ ...base(`checklist:${d.k}`), ...d.row }));

  return { data, users, pins, pinHashes };
}
