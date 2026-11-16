/**
 * المعياري مقابل الفعلي في التصنيع: what a batch should have used according to the product's recipe, against what
 * the chef actually put in, in quantity and in money — per product, per chef and per ingredient. Plus the trimmings
 * (دوبريه) of single-raw-material and meat batches, the other place where money leaks.
 *
 * The standard of a batch is the product's CURRENT recipe scaled the way the batch form scales it:
 *   weight / portion → × meals · chicken → × the product's weight · burger → × net kilos
 * A product without a recipe has no standard and is left out of the comparison (it is counted in `noStandard`).
 * Pure.
 */
import type { Localized, MfgBatch, MfgProduct } from "@/data/types";
import type { Units } from "@/lib/money";

export interface LineVariance {
  batchId: string;
  number: string;
  itemId: string;
  name: Localized;
  /** base units (g / ml / pc) */
  standard: number;
  actual: number;
  diff: number;
  unitCost: Units;
  /** + = used more than the recipe */
  diffValue: Units;
}
export interface BatchVariance {
  batch: MfgBatch;
  hasStandard: boolean;
  standardCost: Units;
  actualCost: Units;
  diffValue: Units;
  lines: LineVariance[];
}

const r3 = (n: number) => Math.round(n * 1000) / 1000;

function standardOf(b: MfgBatch, products: Map<string, MfgProduct>, byCategory: (c: MfgProduct["category"]) => MfgProduct | undefined): { outputIndex: number | null; lines: Map<string, number> }[] | null {
  const scaled = (p: MfgProduct | undefined, by: number, withRecipe = true) => {
    const m = new Map<string, number>();
    if (!p) return m;
    for (const l of [...(withRecipe ? p.lines : []), ...p.packaging]) m.set(l.itemId, r3((m.get(l.itemId) ?? 0) + l.qty * by));
    return m;
  };
  if (b.method === "weight" || b.method === "portion") {
    const p = products.get(b.outputs[0]?.productId ?? "");
    return p?.lines.length ? [{ outputIndex: null, lines: scaled(p, b.meals ?? 0) }] : null;
  }
  if (b.method === "chicken") {
    const parts = b.outputs.map((o, i) => ({ p: products.get(o.productId), i, by: o.weightKg ?? 0 })).filter((x) => x.p?.lines.length);
    return parts.length ? parts.map((x) => ({ outputIndex: x.i, lines: scaled(x.p, x.by) })) : null;
  }
  if (b.method === "burger") {
    const p = byCategory(b.category);
    return p?.lines.length ? [{ outputIndex: null, lines: scaled(p, b.netWeightKg ?? 0) }] : null;
  }
  const p = products.get(b.outputs[0]?.productId ?? "");
  return p?.packaging.length ? [{ outputIndex: null, lines: scaled(p, b.netWeightKg ?? 0, false) }] : null;
}

/** `fallback` prices and names an ingredient of the recipe that the chef left out of the batch entirely. */
export interface VarianceFallback {
  unitCost: (itemId: string) => Units;
  name: (itemId: string) => Localized | undefined;
}

export function batchVariance(b: MfgBatch, products: Map<string, MfgProduct>, fallback?: VarianceFallback): BatchVariance {
  const list = [...products.values()].sort((a, c) => a.sort - c.sort);
  const std = standardOf(b, products, (c) => list.find((p) => p.category === c && p.active && p.lines.length) ?? list.find((p) => p.category === c));
  if (!std) return { batch: b, hasStandard: false, standardCost: 0, actualCost: 0, diffValue: 0, lines: [] };
  const lines: LineVariance[] = [];
  let standardCost = 0;
  let actualCost = 0;
  for (const part of std) {
    const actual = b.inputs.filter((l) => (l.role === "ingredient" || l.role === "packaging") && (b.method !== "chicken" || l.outputIndex === part.outputIndex));
    const ids = new Set([...part.lines.keys(), ...actual.map((l) => l.itemId)]);
    for (const itemId of ids) {
      const mine = actual.filter((l) => l.itemId === itemId);
      const a = r3(mine.reduce((s, l) => s + l.qty, 0));
      const s = part.lines.get(itemId) ?? 0;
      // priced like the batch priced it
      const unitCost = mine[0]?.unitCost ?? b.inputs.find((l) => l.itemId === itemId)?.unitCost ?? fallback?.unitCost(itemId) ?? 0;
      const name = mine[0]?.name ?? b.inputs.find((l) => l.itemId === itemId)?.name ?? fallback?.name(itemId) ?? { ar: "—", en: "—" };
      standardCost += Math.round(s * unitCost);
      actualCost += Math.round(a * unitCost);
      const diff = r3(a - s);
      if (Math.abs(diff) > 0.0005) lines.push({ batchId: b.id, number: b.number, itemId, name, standard: s, actual: a, diff, unitCost, diffValue: Math.round(diff * unitCost) });
    }
  }
  return { batch: b, hasStandard: true, standardCost, actualCost, diffValue: actualCost - standardCost, lines: lines.sort((x, y) => Math.abs(y.diffValue) - Math.abs(x.diffValue)) };
}

interface Group {
  key: string;
  name: string;
  batches: number;
  standardCost: Units;
  actualCost: Units;
  diffValue: Units;
}
export interface ChefGroup extends Group {
  /** trimmings across single-raw-material and meat batches */
  mainKg: number;
  debrisKg: number;
  debrisValue: Units;
}
export interface ItemGroup {
  itemId: string;
  name: Localized;
  standard: number;
  actual: number;
  diff: number;
  diffValue: Units;
  batches: number;
}

export function varianceReport(batches: MfgBatch[], products: Map<string, MfgProduct>, from: string, to: string, fallback?: VarianceFallback) {
  const rows = batches.filter((b) => b.status === "done" && b.madeAt >= from && b.madeAt <= to).map((b) => batchVariance(b, products, fallback));
  const byProduct = new Map<string, Group & { name2: Localized }>();
  const byChef = new Map<string, ChefGroup>();
  const byItem = new Map<string, ItemGroup>();
  const t = { batches: rows.length, compared: 0, noStandard: 0, standardCost: 0, actualCost: 0, over: 0, under: 0, mainKg: 0, debrisKg: 0, debrisValue: 0 };
  for (const r of rows) {
    const b = r.batch;
    let c = byChef.get(b.chefId);
    if (!c) byChef.set(b.chefId, (c = { key: b.chefId, name: b.chefName, batches: 0, standardCost: 0, actualCost: 0, diffValue: 0, mainKg: 0, debrisKg: 0, debrisValue: 0 }));
    c.batches += 1;
    if (b.debrisKg !== null && b.mainWeightKg) {
      const main = b.inputs.find((l) => l.role === "main");
      const value = main ? Math.round(Math.max(0, b.debrisKg) * 1000 * main.unitCost) : 0;
      c.mainKg = r3(c.mainKg + b.mainWeightKg);
      c.debrisKg = r3(c.debrisKg + Math.max(0, b.debrisKg));
      c.debrisValue += value;
      t.mainKg = r3(t.mainKg + b.mainWeightKg);
      t.debrisKg = r3(t.debrisKg + Math.max(0, b.debrisKg));
      t.debrisValue += value;
    }
    if (!r.hasStandard) {
      t.noStandard += 1;
      continue;
    }
    t.compared += 1;
    t.standardCost += r.standardCost;
    t.actualCost += r.actualCost;
    c.standardCost += r.standardCost;
    c.actualCost += r.actualCost;
    c.diffValue += r.diffValue;
    const lead = b.outputs[0];
    if (lead) {
      let g = byProduct.get(lead.productId);
      if (!g) byProduct.set(lead.productId, (g = { key: lead.productId, name: lead.name.ar, name2: lead.name, batches: 0, standardCost: 0, actualCost: 0, diffValue: 0 }));
      g.batches += 1;
      g.standardCost += r.standardCost;
      g.actualCost += r.actualCost;
      g.diffValue += r.diffValue;
    }
    for (const l of r.lines) {
      if (l.diffValue > 0) t.over += l.diffValue;
      else t.under -= l.diffValue;
      let i = byItem.get(l.itemId);
      if (!i) byItem.set(l.itemId, (i = { itemId: l.itemId, name: l.name, standard: 0, actual: 0, diff: 0, diffValue: 0, batches: 0 }));
      i.standard = r3(i.standard + l.standard);
      i.actual = r3(i.actual + l.actual);
      i.diff = r3(i.diff + l.diff);
      i.diffValue += l.diffValue;
      i.batches += 1;
    }
  }
  const abs = (a: { diffValue: Units }, b: { diffValue: Units }) => b.diffValue - a.diffValue;
  return {
    rows: rows.filter((r) => r.hasStandard).sort((a, b) => b.diffValue - a.diffValue),
    byProduct: [...byProduct.values()].sort(abs),
    byChef: [...byChef.values()].sort((a, b) => b.diffValue + b.debrisValue - (a.diffValue + a.debrisValue)),
    byItem: [...byItem.values()].sort(abs),
    totals: { ...t, net: t.actualCost - t.standardCost },
  };
}
export type VarianceReport = ReturnType<typeof varianceReport>;
