/**
 * Central-kitchen manufacturing (التصنيع) — the "Cost Control System" document as a system
 * (supabase/migrations/0015_production.sql; src/modules/production). Nothing here names a product: categories, meat
 * cuts, storage methods and the raw materials the methods use are all defined by the restaurant in the constants.
 *
 *  - A manufactured product (MfgProduct) is made in batches (MfgBatch, "تشغيلة") by a chef, with one of the
 *    manufacturing methods of the Cost Control document: by weight, by portion, from one raw material, burger.
 *  - Every batch is signed by the chef who made it and carries a batch number
 *    `<category code>-<DDMMYYYY>#<run of the day>(<chef code>)`, production and expiry dates (the sticker).
 *  - Quantities are in the stock item's base unit (g / ml / pc); money is Units (0.00001 EGP).
 */
import type { Units } from "@/lib/money";

interface Row {
  id: string;
  createdAt: string;
  updatedAt: string;
  restaurantId: string;
}
interface Loc {
  ar: string;
  en: string;
}

/** طريقة التصنيع */
export type MfgMethod =
  /** 1 · تصنيع مباشر يخزن بالوزن (صوصات باردة، خلطات ساخنة) */
  | "weight"
  /** 2 · تصنيع مباشر يخزن بحصة محددة "بورشن" */
  | "portion"
  /** 3 · منتجات من مادة خام واحدة (مثل الدجاج) — the id stays "chicken", the raw material is chosen per batch */
  | "chicken"
  /** 4 · البرجر (لحم / دجاج) */
  | "burger";

/** Chicken products only: how the piece is weighed against its marinade. */
export type MfgChickenMode =
  /** تصنيع مباشر لمنتج بالوزن (فرم، بايتس) */
  | "weight"
  /** متبل قبل العد (ناجيتس، كوردن بلو) */
  | "pre_count"
  /** متبل بعد العد (كرسبي، ستيك) */
  | "post_count";

/** id of a category defined in the constants (MfgSettings.productCategories) */
export type MfgCategory = string;
/** فئة الأصناف المصنعة: defined by the restaurant, with the code that starts the batch number. */
export interface MfgCategoryDef {
  id: string;
  name: Loc;
  code: number;
  /** نوع البرجر: set on the categories the burger method makes — meat (with fat and trimmings) or minced chicken */
  burger: "beef" | "chicken" | null;
}
export type MfgStorageTemp = "chilled" | "frozen" | "room";

/** One ingredient of a recipe: `qty` base units of a stock item. */
export interface MfgRecipeLine {
  itemId: string;
  qty: number;
  /** sale items only: "dine" = only on a dine-in order (ورق صواني), "pickup" = only on takeaway/delivery (علبة، شنطة). Missing = both. */
  use?: LineUse;
}
/** محلي / استلام (Saqr 2026-11-25): the packaging that goes with one kind of order only */
export type LineUse = "dine" | "pickup";

export interface MfgProduct extends Row {
  code: string;
  name: Loc;
  category: MfgCategory;
  /** numeric category code — the first part of the batch number */
  categoryCode: number;
  method: MfgMethod;
  chickenMode: MfgChickenMode | null;
  /** the recipe was saved in الوصفات (it may have no ingredients yet) */
  recipeDefined?: boolean;
  /** ملاحظات التصنيع: written with the recipe, shown when the product is manufactured */
  mfgNotes?: string;
  /** وصفة رئيسية / فرعية / تتبيلة */
  recipeType: "main" | "sub" | "marinade";
  /** stored and costed per kilo or per piece */
  unit: "kg" | "pc";
  /** وزن الحصة (جم) */
  portionGrams: number | null;
  /** طريقة التخزين (كيس صغير، نايلون مكبس، GN 1/1 …) */
  storageMethod: string;
  storageTemp: MfgStorageTemp;
  /** نوع المخزن (STORE_TYPES id); unset = read from storageTemp */
  storeType?: string | null;
  /** صلاحية المنتج بالأيام */
  shelfLifeDays: number;
  /** شرح مبسط للمكونات — يطبع على ستيكر الصلاحية */
  ingredientsText: string;
  /**
   * Recipe. weight / portion methods: quantities for ONE meal (عدد الوجبات multiplies them).
   * single raw material / burger: quantities per 1 kg of the net raw material or meat.
   */
  lines: MfgRecipeLine[];
  /** باكيج التخزين, scaled like `lines`: costed on the batch, never part of the product's weight */
  packaging: MfgRecipeLine[];
  /** the stock item this product is held as (kind "prep") */
  stockItemId: string;
  /* Cost Control 3.2 — optional so older rows stay valid */
  imageUrl?: string | null;
  /** وحدة التصنيع, from the constants */
  mfgUnit?: string;
  /** كمية وحدة التخزين: how much of the product one storage unit holds */
  storageQty?: number | null;
  active: boolean;
  sort: number;
}

export type MfgInputRole = "main" | "fat" | "ingredient" | "packaging";
export interface MfgBatchInput {
  itemId: string;
  name: Loc;
  role: MfgInputRole;
  /** base units taken out of stock */
  qty: number;
  /** grams this line adds to the mix (0 for packaging and piece items) */
  weightG: number;
  unitCost: Units;
  cost: Units;
  /** chicken batches: which output this line belongs to */
  outputIndex: number | null;
}

export interface MfgBatchOutput {
  /** the warehouse chosen for this product when the batch was saved (absent on older batches) */
  locationId?: string | null;
  productId: string;
  stockItemId: string;
  name: Loc;
  unit: "kg" | "pc";
  weightKg: number | null;
  count: number | null;
  portionGrams: number | null;
  /** هدر / فرق الميزان بالجرام لهذا المنتج */
  scaleDiffG: number;
  totalCost: Units;
  /** سعر الكيلو أو سعر القطعة */
  unitCost: Units;
  shelfLifeDays: number;
  expiresAt: string;
  storageTemp: MfgStorageTemp;
  storageMethod: string;
  ingredientsText: string;
}

export interface MfgBatch extends Row {
  branchId: string;
  locationId: string;
  /** رقم التشغيلة: 2-21102026#1(5) */
  number: string;
  seq: number;
  method: MfgMethod;
  category: MfgCategory;
  categoryCode: number;
  madeAt: string;
  /** business day "YYYY-MM-DD" (Cairo) */
  day: string;
  /** the chef who made it: membership id + a snapshot of the name and code */
  chefId: string;
  chefName: string;
  chefCode: number;
  /** عدد الوجبات (weight / portion) */
  meals: number | null;
  /** main raw material: the one the batch was cut from, or the meat cut */
  mainItemId: string | null;
  /** وزن المادة الخام / اللحم قبل التشغيل */
  mainWeightKg: number | null;
  /** الوزن الصافي: sauce after cooking, meat after trimming */
  netWeightKg: number | null;
  /** الوزن الإجمالي للمكونات قبل التجهيز */
  grossWeightKg: number | null;
  fatWeightKg: number | null;
  suggestedFatKg: number | null;
  meatTypeId: string | null;
  /** portion method */
  expectedCount: number | null;
  /** الهدر: grams (weight) or pieces (portion) */
  waste: number | null;
  debrisKg: number | null;
  /** نسبة الدوبريه، basis points */
  debrisBp: number | null;
  scaleDiffG: number | null;
  inputs: MfgBatchInput[];
  outputs: MfgBatchOutput[];
  totalCost: Units;
  status: "done" | "void";
  voidedBy: string | null;
  voidedAt: string | null;
  voidReason: string;
  note: string;
  labelsPrinted: number;
  /** stock moves of this batch share this group id */
  moveGroupId: string;
}

export interface MfgMeatType {
  id: string;
  name: Loc;
  /** the raw stock item this cut is bought as */
  stockItemId: string | null;
  /** وزن الدهن المقترح: grams of fat per kilo of trimmed meat */
  fatGramsPerKg: number;
}

/** ثوابت التصنيع — one row per restaurant. */
export interface MfgSettings extends Row {
  /** membership id → chef code printed in the batch number */
  chefCodes: Record<string, number>;
  meatTypes: MfgMeatType[];
  storageMethods: string[];
  /** فئات الأصناف المصنعة; absent on rows saved before categories became constants */
  productCategories?: MfgCategoryDef[];
  /** the raw material the single-raw-material method offers first (the chef can pick another per batch) */
  chickenItemId: string | null;
  /** the fat raw material used in meat burgers, costed at its purchase price */
  rawFatItemId: string | null;
  /** no longer used (kept for rows saved earlier) */
  burgerFatItemId?: string | null;
  /** minced chicken used in chicken burgers */
  mincedChickenItemId: string | null;
  /** where finished products are stored */
  productLocationId: string | null;
  /** the remaining constants of the Cost Control document (section 4) */
  lists?: MfgLists | null;
}

export interface MfgUnitDef { name: string; base: "g" | "ml" | "pc"; factor: number }
export interface MfgLists {
  /** المنيو: الخيارات الجانبية (زي Side Options في Bonbell), the names a group's options are picked from; price in pounds */
  /** عدد الوجبات في تصنيع صنف: the ready buttons (Saqr 2026-11-25), default 0.5 · 1 · 2 · 4 · 8 */
  mealOptions?: number[];
  /** اللاسلكي (Saqr 2026-11-25): who may use it, with whom, and the group chats */
  radio?: RadioSetup;
  /** الطابعات وشكل الفاتورة وطلبية المطبخ (Saqr 2026-11-25, التشغيل > اعدادات التشغيل) */
  printing?: PrintSetup;
  /** اعدادات التشغيل لكل فرع (Saqr 2026-11-25); a branch without its own uses `printing` */
  printingByBranch?: Record<string, PrintSetup>;
  sideOptions?: { id: string; name: string; nameAr?: string; price: number; available?: boolean; menuItemId?: string | null }[];
  /** وحدة التخزين لمواد الخام */
  storageUnits: string[];
  /** وحدة التصنيع لمواد الخام */
  mfgUnits: MfgUnitDef[];
  /** فئات مواد الخام */
  rawCategories: string[];
  /** فئة الخام that holds the meats: تعريف اللحوم offers only its raw materials. Unset = the category named لحوم. */
  meatCategory?: string;
  /** فئة الخام that holds storage packaging: باكيج التخزين offers only its raw materials. Unset = the category named تغليف. */
  packagingCategory?: string;
  /** فئة الأصناف المصنعة whose products دجاج الفرم may pick (id of a product category). Unset = the category named دجاج. */
  chickenProductCategory?: string;
  /** أنواع المخازن */
  /** the removed "تعريف أنواع المخازن" list: kept only as saved, no screen reads it */
  warehouseTypes?: { id: string; name: string; holds: "raw" | "products" | "branch" }[];
  /** أنواع البرجر */
  burgerTypes: { id: "beef" | "chicken"; name: string }[];
  /** اسماء الوصفات */
  recipeNames: { main: string; sub: string; marinade: string };
  /** sticker sizes added by the restaurant (mm), offered next to the built-in ones */
  labelSizes?: MfgLabelSize[];
  /** مدى أكواد كل فئة: raw by category name, sale and product by category id. Ranges of one kind never overlap. */
  codeRanges?: { raw?: Record<string, CodeRange>; sale?: Record<string, CodeRange>; product?: Record<string, CodeRange> };
  /** أنواع المستخدمين (طبيعة المستخدم): the name the restaurant uses and the permissions it gives */
  userTypes?: MfgUserType[];
  /** membership id → user type id */
  userTypeOf?: Record<string, string>;
}
/**
 * طبيعة المستخدم. Its users take their codes from one range: `from` … `from + count − 1`. Ranges of two types never overlap.
 * (`code` is the first shape of this, kept so rows saved with it still read.)
 */
/** Codes `from` … `from + count − 1` */
export interface CodeRange { from: number; count: number }
/** مقاس ستيكر مضاف من شاشة الطباعة، بالمليمتر */
export interface MfgLabelSize { w: number; h: number }
export interface MfgUserType { id: string; name: string; from?: number; count?: number; code?: number; role: "admin" | "manager" | "chef" | "kitchen" | "cashier"; /** the screens its users may open (module ids); missing = what the role allows */ screens?: string[]; /** may see prices and costs (الأمور المالية); unset = only the level that manages users */ seePrices?: boolean; /** may take changes back from السجل والاسترجاع; unset = only the level that manages users */ restore?: boolean; /** what its users may do in الحسابات (finance/perms.ts); unset = what the level allows */ finance?: string[]; /** the other permissions ticked on the role (cc/perms.ts: supply.branch, supply.handle, purchase.handle); unset = what the level allows */ perms?: string[]; /** the detailed permissions, "area:act" (cc/access.ts); unset = every action on the tabs of its screens */ access?: string[]; /** 2 = `access` saved after the ملخص tabs were added (2026-11-22) */ accessVer?: number }

/* ───────── قوائم فتح وقفل الوردية (0016_checklists.sql; src/modules/checklists) ───────── */

export type ChecklistKind = "opening" | "closing" | "other";
export type ChecklistArea = "kitchen" | "cashier" | "floor" | "all";

export interface ChecklistTask {
  id: string;
  text: Loc;
}

/** A list of tasks done every day by one department (kitchen opening, cashier closing …). */
export interface ChecklistTemplate extends Row {
  name: Loc;
  kind: ChecklistKind;
  area: ChecklistArea;
  /** roles that do this list; empty = everyone */
  roles: string[];
  items: ChecklistTask[];
  active: boolean;
  sort: number;
}

export interface ChecklistRunItem {
  taskId: string;
  text: Loc;
  /** membership id of who ticked it, with a snapshot of the name */
  doneBy: string | null;
  doneByName: string;
  doneAt: string | null;
  note: string;
}

/** One list on one business day in one branch: who ticked what and when. */
export interface ChecklistRun extends Row {
  branchId: string;
  templateId: string;
  templateName: Loc;
  kind: ChecklistKind;
  area: ChecklistArea;
  /** business day "YYYY-MM-DD" (Cairo) */
  day: string;
  items: ChecklistRunItem[];
  startedBy: string | null;
  startedByName: string;
  startedAt: string;
  completedAt: string | null;
}

/** اللاسلكي: per employee (membership id) allowed or not and the people they may talk to; named groups. */
export interface RadioSetup {
  access: Record<string, { on: boolean; peers: "all" | string[]; /** مباشر: hears messages at once and talks from the floating mic, like a walkie-talkie */ live?: boolean }>;
  groups: { id: string; name: string; memberIds: string[] }[];
}

/** a printer of the system: a name and its paper; it prints from the device set as that printer (see cc/print) */
export interface PrinterDef { id: string; name: string; paper: "58" | "80"; /** عنوان الطابعة على الشبكة */ ip?: string; /** فواتير وطلبيات (ESC/POS) أو ستيكرات (TSPL) */ kind?: "receipt" | "label" }
export interface KitchenTicketDesign {
  fontSize: number;
  header: string;
  channel: boolean;
  table: boolean;
  customer: boolean;
  modifiers: boolean;
  notes: boolean;
  time: boolean;
  cashier: boolean;
}
export interface PrintSetup {
  printers: PrinterDef[];
  receiptPrinterId: string | null;
  /** طابعة المطبخ مفعلة: tickets print; off = the kitchen works on the internal kitchen screen only */
  kitchenPrint: boolean;
  /** where a category with no printer of its own prints */
  kitchenDefaultPrinterId: string | null;
  /** menu category id → printer ids (more than one allowed) */
  categoryPrinters: Record<string, string[]>;
  kitchen: KitchenTicketDesign;
  /** محطة الطباعة: a Windows PC with the station program prints every job by IP */
  stationOn?: boolean;
  /** طابعة ستيكرات الصلاحية (التصنيع) */
  stickerPrinterId?: string | null;
}
