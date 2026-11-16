/**
 * The arithmetic of the Cost Control document, one function per manufacturing method. Pure: no data access.
 *
 * Weights are kilograms unless a name ends in G (grams); money is Units (0.00001 EGP). `cost` of a line is what that
 * quantity of the ingredient costs (quantity × price of the manufacturing unit), `weightG` what it adds to the mix
 * (storage packaging and piece items add 0 — they are only costed).
 */
import type { MfgChickenMode } from "@/data/productionTypes";
import type { Units } from "@/lib/money";

export interface CalcLine {
  cost: Units;
  weightG: number;
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const r3 = (n: number) => Math.round(n * 1000) / 1000;
const div = (a: number, b: number) => (b > 0 ? a / b : 0);
export const linesCost = (lines: CalcLine[]) => Math.round(sum(lines.map((l) => l.cost)));
export const linesWeightG = (lines: CalcLine[]) => r3(sum(lines.map((l) => l.weightG)));
/** نسبة in basis points (4% = 400) */
const bp = (part: number, whole: number) => Math.round(div(part, whole) * 10_000);

/* ───────── 1 · تصنيع مباشر للمنتج يخزن بالوزن ───────── */

export interface WeightResult {
  /** الوزن الإجمالي: مكونات الوصفة قبل التجهيز */
  grossKg: number;
  /** الهدر (جم) = الوزن الصافي − الوزن الإجمالي: negative when weight was lost */
  wasteG: number;
  /** سعر الإجمالي: مجموع سعر جميع المكونات (مع باكيج التخزين) */
  total: Units;
  /** سعر الكيلو = سعر الإجمالي ÷ الوزن الصافي */
  perKg: Units;
}
export function calcWeight(p: { lines: CalcLine[]; packaging: CalcLine[]; netKg: number }): WeightResult {
  const grossG = linesWeightG(p.lines);
  const total = linesCost(p.lines) + linesCost(p.packaging);
  return { grossKg: r3(grossG / 1000), wasteG: r3(p.netKg * 1000 - grossG), total, perKg: Math.round(div(total, p.netKg)) };
}

/* ───────── 2 · تصنيع مباشر يخزن بحصة محددة "بورشن" ───────── */

export interface PortionResult {
  grossKg: number;
  /** العدد المتوقع انتاجه = اجمالي وزن المكونات ÷ وزن الحصة */
  expected: number;
  /** الهدر (قطعة) = العدد الصافي − العدد المتوقع: negative when pieces are short */
  wastePcs: number;
  total: Units;
  /** سعر القطعة = سعر الإجمالي ÷ العدد الصافي */
  perPc: Units;
}
export function calcPortion(p: { lines: CalcLine[]; packaging: CalcLine[]; portionG: number; netCount: number }): PortionResult {
  const grossG = linesWeightG(p.lines);
  const expected = Math.floor(div(grossG, p.portionG) + 1e-9);
  const total = linesCost(p.lines) + linesCost(p.packaging);
  return { grossKg: r3(grossG / 1000), expected, wastePcs: p.netCount - expected, total, perPc: Math.round(div(total, p.netCount)) };
}

/* ───────── 3 · تصنيع منتجات من مادة خام واحدة (مثل الدجاج) ───────── */

export interface ChickenOutputIn {
  mode: MfgChickenMode;
  /** الوزن الناتج (كجم) */
  weightKg: number;
  /** العدد الناتج (قطعة) — not needed for products made by weight */
  count: number;
  portionG: number;
  /** الوصفة (التتبيلة والمكونات) */
  lines: CalcLine[];
  packaging: CalcLine[];
}
export interface ChickenOutputResult {
  /** هدر الميزان (جم) */
  scaleDiffG: number;
  total: Units;
  /** سعر الكيلو (بالوزن) أو سعر القطعة (بالعدد) */
  unitCost: Units;
  per: "kg" | "pc";
}
export interface ChickenResult {
  /** صافي الدجاج: مجموع الوزن الناتج لجميع المنتجات */
  netKg: number;
  /** وزن الدوبريه = وزن الدجاج − اجمالي الوزن الناتج */
  debrisKg: number;
  debrisBp: number;
  scaleDiffG: number;
  outputs: ChickenOutputResult[];
  total: Units;
}
export function chickenScaleDiffG(o: Pick<ChickenOutputIn, "mode" | "weightKg" | "count" | "portionG" | "lines">): number {
  if (o.mode === "weight") return 0;
  const nominal = o.count * o.portionG - o.weightKg * 1000;
  // متبل قبل العد: the marinade is already in the counted piece
  return r3(o.mode === "pre_count" ? nominal - linesWeightG(o.lines) : nominal);
}
export function calcChicken(p: { chickenKg: number; chickenPerKg: Units; outputs: ChickenOutputIn[] }): ChickenResult {
  const netKg = r3(sum(p.outputs.map((o) => o.weightKg)));
  const diffs = p.outputs.map(chickenScaleDiffG);
  const scaleDiffG = r3(sum(diffs));
  // every kilo that came out carries its share of the trimmings: وزن الدجاج ÷ (صافي الدجاج + هدر الميزان)
  const gross = div(p.chickenKg, netKg + scaleDiffG / 1000);
  const outputs = p.outputs.map((o, i): ChickenOutputResult => {
    const total = Math.round(linesCost(o.lines) + linesCost(o.packaging) + p.chickenPerKg * o.weightKg * gross);
    const per = o.mode === "weight" ? "kg" : "pc";
    return { scaleDiffG: diffs[i], total, per, unitCost: Math.round(div(total, per === "kg" ? o.weightKg : o.count)) };
  });
  const debrisKg = r3(p.chickenKg - netKg);
  return { netKg, debrisKg, debrisBp: bp(debrisKg, p.chickenKg), scaleDiffG, outputs, total: sum(outputs.map((o) => o.total)) };
}

/* ───────── 4 · تصنيع البرجر (لحم / دجاج) ───────── */

export interface BurgerResult {
  /** وزن الدوبريه = وزن اللحم − الوزن الصافي (لحم فقط) */
  debrisKg: number;
  debrisBp: number;
  /** وزن الدهن المقترح حسب نوع اللحم */
  suggestedFatKg: number;
  /** هدر الميزان (جم) */
  scaleDiffG: number;
  total: Units;
  /** سعر كيلو البرجر */
  perKg: Units;
  /** سعر كل منتج = سعر كيلو البرجر × حصته */
  products: { unitCost: Units; total: Units }[];
}
export function calcBurger(p: {
  kind: "beef" | "chicken";
  /** وزن اللحم قبل التنظيف (لحم) */
  meatKg: number;
  /** الوزن الصافي: اللحم بعد التنظيف / وزن دجاج الفرم */
  netKg: number;
  fatKg: number;
  /** price of a kilo of the meat cut (beef) or of the minced chicken */
  meatPerKg: Units;
  fatPerKg: Units;
  fatGramsPerKg: number;
  lines: CalcLine[];
  packaging: CalcLine[];
  products: { count: number; portionG: number }[];
}): BurgerResult {
  const beef = p.kind === "beef";
  const fatKg = beef ? p.fatKg : 0;
  const recipeG = linesWeightG(p.lines);
  const nominalG = sum(p.products.map((x) => x.count * x.portionG));
  const scaleDiffG = r3(nominalG - p.netKg * 1000 - fatKg * 1000 - recipeG);
  const meatCost = p.meatPerKg * (beef ? p.meatKg : p.netKg);
  const total = Math.round(meatCost + p.fatPerKg * fatKg + linesCost(p.lines) + linesCost(p.packaging));
  const perKg = Math.round(div(total, p.netKg + fatKg + recipeG / 1000 + scaleDiffG / 1000));
  const debrisKg = beef ? r3(p.meatKg - p.netKg) : 0;
  return {
    debrisKg, debrisBp: beef ? bp(debrisKg, p.meatKg) : 0, suggestedFatKg: beef ? r3((p.netKg * p.fatGramsPerKg) / 1000) : 0, scaleDiffG, total, perKg,
    products: p.products.map((x) => {
      const unitCost = Math.round((perKg * x.portionG) / 1000);
      return { unitCost, total: unitCost * x.count };
    }),
  };
}

/* ───────── رقم التشغيلة ───────── */

/** `2-21102026#1(5)`: category code, manufacturing date, run of that product today, chef code. */
export function batchNumber(p: { categoryCode: number; day: string; seq: number; chefCode: number }): string {
  const [y, m, d] = p.day.split("-");
  return `${p.categoryCode}-${d}${m}${y}#${p.seq}(${p.chefCode})`;
}

/** Business day in Cairo, "YYYY-MM-DD". */
export function cairoDay(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Cairo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
}

export function expiryOf(madeAt: string, shelfLifeDays: number): string {
  return new Date(Date.parse(madeAt) + Math.max(0, shelfLifeDays) * 86_400_000).toISOString();
}
