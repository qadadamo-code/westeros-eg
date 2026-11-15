/**
 * Westeros manufactured products, meat cuts, portion weights and chefs — the lists of the "الريسبي" tab of the
 * Cost Control sheet (read 2026-11-15). Recipe quantities are empty in the sheet, so recipes start empty here and are
 * filled in from the product screen. Category codes follow the sheet's batch numbers (hot mixes use 2); the others
 * are assigned in order and can be changed per product.
 */
import type { MfgCategory, MfgChickenMode, MfgMethod, MfgStorageTemp } from "@/data/productionTypes";

export interface WProduct {
  k: string;
  ar: string;
  en: string;
  category: MfgCategory;
  method: MfgMethod;
  chickenMode?: MfgChickenMode;
  recipeType?: "main" | "sub" | "marinade";
  unit: "kg" | "pc";
  portion?: number;
  temp?: MfgStorageTemp;
}

export const CATEGORY_CODE: Record<MfgCategory, number> = { cold_sauce: 1, hot_sauce: 2, other: 3, chicken: 4, beef_burger: 5, chicken_burger: 6, fat: 7, marinade: 8 };

export const WESTEROS_PRODUCTS: WProduct[] = [
  // صوص بارد — تصنيع مباشر يخزن بالوزن
  { k: "stark-sauce", ar: "ستارك صوص", en: "Stark sauce", category: "cold_sauce", method: "weight", unit: "kg" },
  { k: "westeros-sauce", ar: "ويستروس صوص", en: "Westeros sauce", category: "cold_sauce", method: "weight", unit: "kg" },
  { k: "dynamite-sauce", ar: "ديناميت صوص", en: "Dynamite sauce", category: "cold_sauce", method: "weight", unit: "kg" },
  { k: "knockout-sauce", ar: "نوك اوت صوص", en: "Knock-out sauce", category: "cold_sauce", method: "weight", unit: "kg" },
  { k: "ranch-sauce", ar: "رانش صوص", en: "Ranch sauce", category: "cold_sauce", method: "weight", unit: "kg" },
  { k: "cheddar-sauce", ar: "جبنة شيدر صوص", en: "Cheddar cheese sauce", category: "cold_sauce", method: "weight", unit: "kg" },
  { k: "caesar-sauce", ar: "سيزر صوص", en: "Caesar sauce", category: "cold_sauce", method: "weight", unit: "kg" },
  // صوص ساخن / خلطات ساخنة
  { k: "smoky-mix", ar: "سموكي", en: "Smoky mix", category: "hot_sauce", method: "weight", unit: "kg" },
  { k: "white-mushroom-mix", ar: "وايت مشروم", en: "White mushroom mix", category: "hot_sauce", method: "weight", unit: "kg" },
  { k: "brownie-mix", ar: "براوني", en: "Brownie mix", category: "hot_sauce", method: "weight", unit: "kg" },
  // اخرى — تصنيع بالحصة "بورشن"
  { k: "coleslaw", ar: "سلطة كول سلو", en: "Coleslaw", category: "other", method: "portion", unit: "pc" },
  { k: "corn-mayo-salad", ar: "سلطة ذرة بالمايونيز", en: "Corn & mayo salad", category: "other", method: "portion", unit: "pc" },
  { k: "fitness-dressing", ar: "صوص سلطة فيتنس", en: "Fitness salad dressing", category: "other", method: "portion", unit: "pc" },
  { k: "veg-rice", ar: "رز بالخضار", en: "Vegetable rice", category: "other", method: "portion", unit: "pc" },
  { k: "cordon-bleu-ready", ar: "كوردن بلو جاهز", en: "Cordon bleu, ready", category: "other", method: "portion", unit: "pc", temp: "frozen" },
  { k: "nuggets-ready", ar: "ناجيتس جاهز", en: "Nuggets, ready", category: "other", method: "portion", unit: "pc", temp: "frozen" },
  { k: "picasso-mix", ar: "بيكاسو", en: "Picasso", category: "other", method: "portion", unit: "pc" },
  { k: "pesto-mix", ar: "بيستو", en: "Pesto", category: "other", method: "portion", unit: "pc" },
  { k: "cajun-mix", ar: "كاجون", en: "Cajun", category: "other", method: "portion", unit: "pc" },
  { k: "westeros-box", ar: "علبة ويستروس", en: "Westeros box", category: "other", method: "portion", unit: "pc" },
  // الدجاج — منتجات من مادة خام واحدة
  { k: "chicken-crispy", ar: "دجاج كرسبي", en: "Crispy chicken", category: "chicken", method: "chicken", chickenMode: "post_count", unit: "pc", portion: 120 },
  { k: "chicken-steak", ar: "دجاج ستيك", en: "Chicken steak", category: "chicken", method: "chicken", chickenMode: "post_count", unit: "pc", portion: 70 },
  { k: "chicken-shawarma", ar: "دجاج شاورما", en: "Chicken shawarma", category: "chicken", method: "chicken", chickenMode: "post_count", unit: "pc", portion: 150 },
  { k: "chicken-cordon-bleu", ar: "دجاج كوردن بلو", en: "Chicken cordon bleu", category: "chicken", method: "chicken", chickenMode: "pre_count", unit: "pc", portion: 160 },
  { k: "chicken-nuggets", ar: "دجاج ناجيتس", en: "Chicken nuggets", category: "chicken", method: "chicken", chickenMode: "pre_count", unit: "pc", portion: 13 },
  { k: "chicken-bites", ar: "دجاج بايتس", en: "Chicken bites", category: "chicken", method: "chicken", chickenMode: "weight", unit: "kg", portion: 18 },
  { k: "chicken-mince", ar: "دجاج فرم", en: "Minced chicken", category: "chicken", method: "chicken", chickenMode: "weight", unit: "kg" },
  // البرجر
  { k: "beef-burger-150", ar: "بيف برجر 150جم", en: "Beef burger 150 g", category: "beef_burger", method: "burger", unit: "pc", portion: 150, temp: "frozen" },
  { k: "beef-burger-80", ar: "بيف برجر 80جم", en: "Beef burger 80 g", category: "beef_burger", method: "burger", unit: "pc", portion: 80, temp: "frozen" },
  { k: "chicken-burger-150", ar: "تشكن برجر 150جم", en: "Chicken burger 150 g", category: "chicken_burger", method: "burger", unit: "pc", portion: 150, temp: "frozen" },
  { k: "chicken-burger-80", ar: "تشكن برجر 80جم", en: "Chicken burger 80 g", category: "chicken_burger", method: "burger", unit: "pc", portion: 80, temp: "frozen" },
  // الدهن
  { k: "fat-ready", ar: "دهن بلدي جاهز", en: "Prepared beef fat", category: "fat", method: "fat", unit: "kg", temp: "frozen" },
  // التتبيلات
  { k: "marinade-crispy", ar: "تتبيلة دجاج كرسبي", en: "Crispy chicken marinade", category: "marinade", method: "weight", recipeType: "marinade", unit: "kg" },
  { k: "marinade-steak", ar: "تتبيلة دجاج ستيك", en: "Chicken steak marinade", category: "marinade", method: "weight", recipeType: "marinade", unit: "kg" },
  { k: "marinade-chicken-burger", ar: "تتبيلة تشكن برجر", en: "Chicken burger marinade", category: "marinade", method: "weight", recipeType: "marinade", unit: "kg" },
  { k: "marinade-cordon-bleu", ar: "تتبيلة دجاج كوردن بلو", en: "Cordon bleu marinade", category: "marinade", method: "weight", recipeType: "marinade", unit: "kg" },
  { k: "marinade-nuggets", ar: "تتبيلة دجاج ناجيتس", en: "Nuggets marinade", category: "marinade", method: "weight", recipeType: "marinade", unit: "kg" },
];

/** انواع اللحوم + وزن الدهن (جم لكل كيلو لحم صافي). `code` = raw material code in the sheet. */
export const WESTEROS_MEAT_TYPES: { k: string; ar: string; code: number; fat: number }[] = [
  { k: "frigon-topside", ar: "فريجون لحم وش فخدة", code: 18004, fat: 300 },
  { k: "frigon-brisket", ar: "فريجون لحم بريسكت", code: 18005, fat: 200 },
  { k: "minerva-topside", ar: "منيرفا لحم وش فخدة", code: 18006, fat: 300 },
  { k: "minerva-brisket", ar: "منيرفا لحم بريسكت", code: 18007, fat: 200 },
  { k: "meatboy-brisket", ar: "ميتابوي لحم بريسكت", code: 18008, fat: 200 },
  { k: "supreme-brisket", ar: "سوبريم لحم بريسكت", code: 18009, fat: 200 },
  { k: "supreme-topside", ar: "سوبريم لحم وش فخدة", code: 20101, fat: 300 },
];

export const WESTEROS_STORAGE_METHODS = ["كيس صغير", "كيس كبير", "نايلون مكبس", "GN 1/1", "GN 1/2", "علبة"];

/** raw material codes the manufacturing screens need */
export const RAW_CODES = { chicken: 18001, rawFat: 18002 } as const;
