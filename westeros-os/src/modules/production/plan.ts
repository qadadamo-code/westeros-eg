/**
 * خطة الإنتاج اليومية: what the kitchen should make today, product by product.
 *
 *   needed  = the larger of the product's daily minimum (الحد اليومي, the stock item's par level) and what the same
 *             weekday consumed in the last four weeks plus a safety margin
 *   suggest = needed − what is on hand and still good tomorrow
 *
 * "Consumed" is what left the product's stock for sales, for other batches (fat into burgers) and for staff meals.
 * A product with neither a daily minimum nor any consumption yet has no suggestion: the screen asks for a minimum.
 * Pure — the screen passes the live rows in.
 */
import type { MfgBatch, MfgProduct, StockItem, StockMove } from "@/data/types";
import { cairoDay } from "./calc";

/** kinds that count as consumption of a manufactured product (signed quantities are netted, so a reversal gives back) */
const CONSUMED = new Set<StockMove["kind"]>(["sale", "sale_reversal", "production_out", "staff_meal"]);
export const SAFETY = 0.15;
const DAY = 86_400_000;

export type PlanBasis = "weekday" | "recent" | "none";
export interface PlanRow {
  product: MfgProduct;
  unit: "kg" | "pc";
  /** all figures below are in the product's unit (kilos or pieces) */
  onHand: number;
  /** part of what is on hand that expires today or already has */
  expiring: number;
  par: number;
  /** expected consumption today; null when there is no history yet */
  forecast: number | null;
  basis: PlanBasis;
  /** number of past days the forecast is the average of */
  samples: number;
  needed: number;
  suggest: number;
  madeToday: number;
  status: "make" | "ok" | "unknown";
}

const r3 = (n: number) => Math.round(n * 1000) / 1000;
const dayAdd = (day: string, n: number) => new Date(Date.parse(`${day}T12:00:00Z`) + n * DAY).toISOString().slice(0, 10);
const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / DAY);

/** kilos round up to the half kilo, pieces to the whole piece */
export function roundUp(qty: number, unit: "kg" | "pc"): number {
  if (qty <= 0) return 0;
  return unit === "kg" ? Math.ceil(r3(qty) * 2 - 1e-9) / 2 : Math.ceil(r3(qty) - 1e-9);
}

export function buildPlan(p: {
  products: MfgProduct[];
  items: Map<string, StockItem>;
  /** base units (g / pc) on hand per stock item, in the branch */
  onHand: Map<string, number>;
  moves: Pick<StockMove, "itemId" | "kind" | "qty" | "at">[];
  batches: Pick<MfgBatch, "status" | "day" | "outputs">[];
  now: string;
}): PlanRow[] {
  const today = cairoDay(p.now);
  const tomorrow = Date.parse(`${dayAdd(today, 1)}T00:00:00+02:00`);
  // consumption per stock item per business day (base units, positive = consumed)
  const used = new Map<string, Map<string, number>>();
  for (const m of p.moves) {
    if (!CONSUMED.has(m.kind)) continue;
    const day = cairoDay(m.at);
    if (day >= today) continue;
    let d = used.get(m.itemId);
    if (!d) used.set(m.itemId, (d = new Map()));
    d.set(day, (d.get(day) ?? 0) - m.qty);
  }
  const live = p.batches.filter((b) => b.status === "done");

  const rows = p.products.filter((x) => x.active).map((product): PlanRow => {
    const unit = product.unit;
    const k = unit === "kg" ? 1000 : 1;
    const base = (n: number) => r3(n / k);
    const onHand = Math.max(0, base(p.onHand.get(product.stockItemId) ?? 0));
    const par = base(p.items.get(product.stockItemId)?.levels?.par ?? 0);
    const qtyOf = (o: MfgBatch["outputs"][number]) => (o.unit === "kg" ? (o.weightKg ?? 0) : (o.count ?? 0));
    const mine = live.flatMap((b) => b.outputs.filter((o) => o.productId === product.id).map((o) => ({ day: b.day, o })));
    const madeToday = r3(mine.filter((x) => x.day === today).reduce((a, x) => a + qtyOf(x.o), 0));
    // newest lots are the ones still on the shelf: walk back until the on-hand quantity is covered
    let left = onHand;
    let expiring = 0;
    for (const x of [...mine].sort((a, b) => (a.o.expiresAt < b.o.expiresAt ? 1 : -1))) {
      if (left <= 0) break;
      const q = Math.min(left, qtyOf(x.o));
      if (Date.parse(x.o.expiresAt) < tomorrow) expiring += q;
      left -= q;
    }
    expiring = r3(expiring);

    const days = used.get(product.stockItemId);
    let forecast: number | null = null;
    let basis: PlanBasis = "none";
    let samples = 0;
    if (days?.size) {
      const first = [...days.keys()].sort()[0];
      const same = [1, 2, 3, 4].map((w) => dayAdd(today, -7 * w)).filter((d) => d >= first);
      if (same.length) {
        forecast = same.reduce((a, d) => a + Math.max(0, days.get(d) ?? 0), 0) / same.length;
        basis = "weekday";
        samples = same.length;
      } else {
        const n = Math.max(1, daysBetween(first, today));
        forecast = [...days.values()].reduce((a, v) => a + Math.max(0, v), 0) / n;
        basis = "recent";
        samples = n;
      }
      forecast = base(forecast);
    }
    const needed = r3(Math.max(par, (forecast ?? 0) * (1 + SAFETY)));
    const suggest = roundUp(needed - (onHand - expiring), unit);
    const status: PlanRow["status"] = !par && forecast === null ? "unknown" : suggest > 0 ? "make" : "ok";
    return { product, unit, onHand, expiring, par, forecast, basis, samples, needed, suggest: status === "unknown" ? 0 : suggest, madeToday, status };
  });
  const rank = { make: 0, unknown: 1, ok: 2 };
  return rows.sort((a, b) => rank[a.status] - rank[b.status] || (b.needed ? b.suggest / b.needed : 0) - (a.needed ? a.suggest / a.needed : 0) || a.product.sort - b.product.sort);
}
