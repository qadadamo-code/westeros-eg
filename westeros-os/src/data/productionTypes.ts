/**
 * Central-kitchen manufacturing (التصنيع) — the Westeros "Cost Control" sheet as a system
 * (supabase/migrations/0015_production.sql; src/modules/production).
 *
 *  - A manufactured product (MfgProduct) is made in batches (MfgBatch, "تشغيلة") by a chef, with one of the
 *    manufacturing methods of the Cost Control document: by weight, by portion, from chicken breast, burger, fat.
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
  /** 3 · منتجات من مادة خام واحدة (الدجاج) */
  | "chicken"
  /** 4 · البرجر (لحم / دجاج) */
  | "burger"
  /** تجهيز الدهن البلدي */
  | "fat";

/** Chicken products only: how the piece is weighed against its marinade. */
export type MfgChickenMode =
  /** تصنيع مباشر لمنتج بالوزن (فرم، بايتس) */
  | "weight"
  /** متبل قبل العد (ناجيتس، كوردن بلو) */
  | "pre_count"
  /** متبل بعد العد (كرسبي، ستيك) */
  | "post_count";

export type MfgCategory = "cold_sauce" | "hot_sauce" | "other" | "chicken" | "beef_burger" | "chicken_burger" | "marinade" | "fat";
export type MfgStorageTemp = "chilled" | "frozen" | "room";

/** One ingredient of a recipe: `qty` base units of a stock item. */
export interface MfgRecipeLine {
  itemId: string;
  qty: number;
}

export interface MfgProduct extends Row {
  code: string;
  name: Loc;
  category: MfgCategory;
  /** numeric category code — the first part of the batch number */
  categoryCode: number;
  method: MfgMethod;
  chickenMode: MfgChickenMode | null;
  /** وصفة رئيسية / فرعية / تتبيلة */
  recipeType: "main" | "sub" | "marinade";
  /** stored and costed per kilo or per piece */
  unit: "kg" | "pc";
  /** وزن الحصة (جم) */
  portionGrams: number | null;
  /** طريقة التخزين (كيس صغير، نايلون مكبس، GN 1/1 …) */
  storageMethod: string;
  storageTemp: MfgStorageTemp;
  /** صلاحية المنتج بالأيام */
  shelfLifeDays: number;
  /** شرح مبسط للمكونات — يطبع على ستيكر الصلاحية */
  ingredientsText: string;
  /**
   * Recipe. weight / portion methods: quantities for ONE meal (عدد الوجبات multiplies them); fat: per kilo ready.
   * chicken / burger: quantities per 1 kg of net chicken or meat.
   */
  lines: MfgRecipeLine[];
  /** باكيج التخزين, scaled like `lines`: costed on the batch, never part of the product's weight */
  packaging: MfgRecipeLine[];
  /** the stock item this product is held as (kind "prep") */
  stockItemId: string;
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
  /** main raw material: chicken breast, the meat cut, raw fat */
  mainItemId: string | null;
  /** وزن الدجاج / اللحم / الدهن قبل التشغيل */
  mainWeightKg: number | null;
  /** الوزن الصافي: sauce after cooking, meat after trimming, ready fat */
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
  /** raw chicken breast and raw fat stock items */
  chickenItemId: string | null;
  rawFatItemId: string | null;
  /** fat used in beef burgers (the prepared fat product's stock item, or raw fat) */
  burgerFatItemId: string | null;
  /** minced chicken used in chicken burgers */
  mincedChickenItemId: string | null;
  /** where finished products are stored */
  productLocationId: string | null;
}
