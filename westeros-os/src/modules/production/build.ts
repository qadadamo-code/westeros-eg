/**
 * Turns what the chef typed (a draft) into a costed batch: inputs taken from stock, outputs put into stock, and the
 * figures of the Cost Control document (waste, debris, scale difference, price per kilo / piece). Pure — the screen
 * shows the result live while the chef types, and ./ops.ts saves exactly the same result.
 */
import type { Localized, MfgBatch, MfgBatchInput, MfgBatchOutput, MfgCategory, MfgInputRole, MfgMeatType, MfgMethod, MfgProduct, MfgSettings, StockItem } from "@/data/types";
import type { Units } from "@/lib/money";
import { calcBurger, calcChicken, calcPortion, calcWeight, expiryOf, type CalcLine } from "./calc";

export interface DraftLine {
  itemId: string;
  /** base units of the stock item (g, ml, pc) */
  qty: number;
}
export type BatchDraft =
  | { method: "weight"; productId: string; meals: number; netKg: number; lines: DraftLine[]; packaging: DraftLine[] }
  | { method: "portion"; productId: string; meals: number; netCount: number; lines: DraftLine[]; packaging: DraftLine[] }
  | { method: "chicken"; /** the raw material being cut; absent = the default one of the constants */ itemId?: string | null; chickenKg: number; outputs: { productId: string; weightKg: number; count: number; lines: DraftLine[]; packaging: DraftLine[] }[] }
  | { method: "burger"; kind: "beef" | "chicken"; meatTypeId: string | null; meatKg: number; netKg: number; fatKg: number; lines: DraftLine[]; packaging: DraftLine[]; products: { productId: string; count: number }[] };

export interface BuildCtx {
  products: Map<string, MfgProduct>;
  items: Map<string, StockItem>;
  settings: Pick<MfgSettings, "meatTypes" | "chickenItemId" | "rawFatItemId" | "mincedChickenItemId"> | null;
  /** price of one base unit: last purchase price for raw materials, last batch for manufactured ones */
  unitCost: (itemId: string) => Units;
  madeAt: string;
}

export type BuildError =
  | "product" | "meals" | "net" | "count" | "portion" | "chicken" | "outputs" | "meat" | "meatType" | "fat" | "chickenItem" | "fatItem" | "minceItem" | "overweight";

export type BuiltBatch = Pick<
  MfgBatch,
  "method" | "category" | "categoryCode" | "meals" | "mainItemId" | "mainWeightKg" | "netWeightKg" | "grossWeightKg" | "fatWeightKg" | "suggestedFatKg" | "meatTypeId" | "expectedCount" | "waste" | "debrisKg" | "debrisBp" | "scaleDiffG" | "inputs" | "outputs" | "totalCost"
> & { errors: BuildError[]; /** ingredients priced at zero — the cost is understated until they get a price */ unpriced: Localized[] };

const NONE: Localized = { ar: "—", en: "—" };
const pos = (n: number) => Number.isFinite(n) && n > 0;

/** recipe quantities scaled by the batch multiplier (meals, or kilos of net meat) */
/** `whole`: round each quantity up to the next whole number (storage packaging of a product stored by weight). */
export function scaleLines(lines: { itemId: string; qty: number }[], by: number, whole = false): DraftLine[] {
  return lines.map((l) => { const q = Math.round(l.qty * by * 1000) / 1000; return { itemId: l.itemId, qty: whole ? Math.ceil(q) : q }; });
}

export function buildBatch(d: BatchDraft, ctx: BuildCtx): BuiltBatch {
  const errors: BuildError[] = [];
  const unpriced: Localized[] = [];
  const inputs: MfgBatchInput[] = [];
  const add = (l: DraftLine, role: MfgInputRole, outputIndex: number | null = null): CalcLine => {
    const it = ctx.items.get(l.itemId);
    if (!it || !pos(l.qty)) return { cost: 0, weightG: 0 };
    const unitCost = ctx.unitCost(l.itemId);
    const cost = Math.round(l.qty * unitCost);
    const weightG = role === "packaging" || it.baseUnit === "pc" ? 0 : l.qty;
    if (unitCost <= 0 && !unpriced.some((n) => n.ar === it.name.ar)) unpriced.push(it.name);
    inputs.push({ itemId: l.itemId, name: it.name, role, qty: l.qty, weightG, unitCost, cost, outputIndex });
    return { cost, weightG };
  };
  const out = (p: MfgProduct, x: { weightKg: number | null; count: number | null; totalCost: Units; unitCost: Units; scaleDiffG?: number; unit?: "kg" | "pc" }): MfgBatchOutput => ({
    productId: p.id, stockItemId: p.stockItemId, name: p.name, unit: x.unit ?? p.unit, weightKg: x.weightKg, count: x.count, portionGrams: p.portionGrams, scaleDiffG: x.scaleDiffG ?? 0,
    totalCost: x.totalCost, unitCost: x.unitCost, shelfLifeDays: p.shelfLifeDays, expiresAt: expiryOf(ctx.madeAt, p.shelfLifeDays), storageTemp: p.storageTemp, storageMethod: p.storageMethod, ingredientsText: p.ingredientsText,
  });
  const empty = (method: MfgMethod, category: MfgCategory = "", categoryCode = 0): BuiltBatch => ({
    method, category, categoryCode, meals: null, mainItemId: null, mainWeightKg: null, netWeightKg: null, grossWeightKg: null, fatWeightKg: null, suggestedFatKg: null, meatTypeId: null, expectedCount: null,
    waste: null, debrisKg: null, debrisBp: null, scaleDiffG: null, inputs, outputs: [], totalCost: 0, errors, unpriced,
  });

  if (d.method === "weight" || d.method === "portion") {
    const p = ctx.products.get(d.productId);
    if (!p) return { ...empty(d.method), errors: ["product"] };
    const b = empty(d.method, p.category, p.categoryCode);
    if (!pos(d.meals)) errors.push("meals");
    const lines = d.lines.map((l) => add(l, "ingredient"));
    const packaging = d.packaging.map((l) => add(l, "packaging"));
    if (d.method === "weight") {
      if (!pos(d.netKg)) errors.push("net");
      const r = calcWeight({ lines, packaging, netKg: d.netKg });
      return { ...b, meals: d.meals, netWeightKg: d.netKg, grossWeightKg: r.grossKg, waste: r.wasteG, totalCost: r.total, outputs: [out(p, { weightKg: d.netKg, count: null, totalCost: r.total, unitCost: r.perKg, unit: "kg" })] };
    }
    if (!pos(p.portionGrams ?? 0)) errors.push("portion");
    if (!pos(d.netCount)) errors.push("count");
    const r = calcPortion({ lines, packaging, portionG: p.portionGrams ?? 0, netCount: d.netCount });
    return {
      ...b, meals: d.meals, grossWeightKg: r.grossKg, expectedCount: r.expected, waste: r.wastePcs, totalCost: r.total,
      outputs: [out(p, { weightKg: Math.round(d.netCount * (p.portionGrams ?? 0)) / 1000, count: d.netCount, totalCost: r.total, unitCost: r.perPc, unit: "pc" })],
    };
  }

  if (d.method === "chicken") {
    const chickenId = d.itemId ?? ctx.settings?.chickenItemId ?? null;
    const rows = d.outputs.map((o) => ({ o, p: ctx.products.get(o.productId) })).filter((x): x is { o: (typeof d.outputs)[number]; p: MfgProduct } => !!x.p);
    const first = rows[0]?.p;
    const b = empty("chicken", first?.category ?? "", first?.categoryCode ?? 0);
    if (!chickenId || !ctx.items.has(chickenId)) errors.push("chickenItem");
    if (!pos(d.chickenKg)) errors.push("chicken");
    if (!rows.length) errors.push("outputs");
    const chickenPerKg = chickenId ? ctx.unitCost(chickenId) * 1000 : 0;
    if (chickenId && pos(d.chickenKg)) add({ itemId: chickenId, qty: d.chickenKg * 1000 }, "main");
    const outs = rows.map(({ o, p }, i) => {
      const mode = p.chickenMode ?? "weight";
      if (!pos(o.weightKg)) errors.push("net");
      if (mode !== "weight" && !pos(o.count)) errors.push("count");
      if (mode !== "weight" && !pos(p.portionGrams ?? 0)) errors.push("portion");
      return { mode, weightKg: o.weightKg || 0, count: o.count || 0, portionG: p.portionGrams ?? 0, lines: o.lines.map((l) => add(l, "ingredient", i)), packaging: o.packaging.map((l) => add(l, "packaging", i)) };
    });
    const r = calcChicken({ chickenKg: d.chickenKg, chickenPerKg, outputs: outs });
    if (pos(d.chickenKg) && r.netKg > d.chickenKg + 1e-9) errors.push("overweight");
    return {
      ...b, mainItemId: chickenId, mainWeightKg: d.chickenKg, netWeightKg: r.netKg, debrisKg: r.debrisKg, debrisBp: r.debrisBp, scaleDiffG: r.scaleDiffG, totalCost: r.total, errors: [...new Set(errors)],
      outputs: rows.map(({ o, p }, i) => out(p, { weightKg: o.weightKg, count: r.outputs[i].per === "pc" ? o.count : null, totalCost: r.outputs[i].total, unitCost: r.outputs[i].unitCost, scaleDiffG: r.outputs[i].scaleDiffG, unit: r.outputs[i].per })),
    };
  }

  // 4 · burger
  {
    const beef = d.kind === "beef";
    const rows = d.products.map((x) => ({ x, p: ctx.products.get(x.productId) })).filter((r): r is { x: (typeof d.products)[number]; p: MfgProduct } => !!r.p && pos(r.x.count));
    const first = rows[0]?.p;
    const b = empty("burger", first?.category ?? "", first?.categoryCode ?? 0);
    const meat: MfgMeatType | undefined = beef ? ctx.settings?.meatTypes.find((m) => m.id === d.meatTypeId) : undefined;
    const mainId = beef ? (meat?.stockItemId ?? null) : (ctx.settings?.mincedChickenItemId ?? null);
    const fatId = ctx.settings?.rawFatItemId ?? null;
    if (beef && !meat) errors.push("meatType");
    if (!mainId || !ctx.items.has(mainId)) errors.push(beef ? "meatType" : "minceItem");
    if (beef && !pos(d.meatKg)) errors.push("meat");
    if (!pos(d.netKg)) errors.push("net");
    if (beef && pos(d.meatKg) && d.netKg > d.meatKg + 1e-9) errors.push("overweight");
    if (!rows.length) errors.push("count");
    if (rows.some((r) => !pos(r.p.portionGrams ?? 0))) errors.push("portion");
    const fatKg = beef ? d.fatKg || 0 : 0;
    if (beef && pos(fatKg) && (!fatId || !ctx.items.has(fatId))) errors.push("fatItem");
    const meatPerKg = mainId ? ctx.unitCost(mainId) * 1000 : 0;
    const fatPerKg = fatId ? ctx.unitCost(fatId) * 1000 : 0;
    if (mainId) add({ itemId: mainId, qty: (beef ? d.meatKg : d.netKg) * 1000 }, "main");
    if (beef && fatId && pos(fatKg)) add({ itemId: fatId, qty: fatKg * 1000 }, "fat");
    const lines = d.lines.map((l) => add(l, "ingredient"));
    const packaging = d.packaging.map((l) => add(l, "packaging"));
    const r = calcBurger({ kind: d.kind, meatKg: d.meatKg, netKg: d.netKg, fatKg, meatPerKg, fatPerKg, fatGramsPerKg: meat?.fatGramsPerKg ?? 0, lines, packaging, products: rows.map((x) => ({ count: x.x.count, portionG: x.p.portionGrams ?? 0 })) });
    return {
      ...b, mainItemId: mainId, mainWeightKg: beef ? d.meatKg : d.netKg, netWeightKg: d.netKg, fatWeightKg: beef ? fatKg : null, suggestedFatKg: beef ? r.suggestedFatKg : null, meatTypeId: beef ? d.meatTypeId : null,
      debrisKg: beef ? r.debrisKg : null, debrisBp: beef ? r.debrisBp : null, scaleDiffG: r.scaleDiffG, totalCost: r.total, errors: [...new Set(errors)],
      outputs: rows.map(({ x, p }, i) => out(p, { weightKg: Math.round(x.count * (p.portionGrams ?? 0)) / 1000, count: x.count, totalCost: r.products[i].total, unitCost: r.products[i].unitCost, unit: "pc" })),
    };
  }
}

export const outputLabel = (o: Pick<MfgBatchOutput, "name">) => o.name ?? NONE;
