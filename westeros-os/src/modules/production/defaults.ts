/** Constants a new restaurant starts with. Pure data: safe to import from the seed and from scripts. */
import type { MfgCategoryDef, MfgSettings } from "@/data/types";

/**
 * The starting list of categories, named as the restaurant names its production lists. It is only a starting point:
 * the restaurant renames, adds and removes categories and sets their codes in the constants.
 */
export const DEFAULT_CATEGORIES: MfgCategoryDef[] = [
  { id: "cold_sauce", name: { ar: "صوص بارد", en: "Cold sauces" }, code: 1, burger: null },
  { id: "hot_sauce", name: { ar: "صوص ساخن", en: "Hot sauces" }, code: 2, burger: null },
  { id: "marinade", name: { ar: "التتبيلات", en: "Marinades" }, code: 3, burger: null },
  { id: "chicken", name: { ar: "الدجاج", en: "Chicken" }, code: 4, burger: null },
  { id: "beef_burger", name: { ar: "اللحم", en: "Beef burger" }, code: 5, burger: "beef" },
  { id: "chicken_burger", name: { ar: "برجر دجاج", en: "Chicken burger" }, code: 6, burger: "chicken" },
  { id: "other", name: { ar: "اخرى", en: "Other" }, code: 7, burger: null },
];
/** طرق التخزين ودرجات الحرارة كما في المستند */
export const DEFAULT_STORAGE_METHODS = ["كيس صغير", "كيس كبير", "نايلون مكبس", "GN 1/1", "GN 1/2"];

export const categoriesOf = (s: Pick<MfgSettings, "productCategories"> | null | undefined): MfgCategoryDef[] => s?.productCategories ?? DEFAULT_CATEGORIES;
export const categoryName = (cats: MfgCategoryDef[], id: string): { ar: string; en: string } => cats.find((c) => c.id === id)?.name ?? { ar: "بدون فئة", en: "No category" };
