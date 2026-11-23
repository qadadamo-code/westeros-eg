/**
 * الأصناف الفرعية والأكثر طلباً (Mohammed 2026-11-23):
 * - a line sells its own item, plus every menu item inside it: the parts of a box (comboOf) and the options that are menu items
 *   (a Classic Beef chosen in a Duo Beef Box). Those ride on the line as modifiers with an itemId, so the invoice prints
 *   them under the main item and the sales of each item count them.
 * - "الأكثر طلباً" and "تريند" come from those counts.
 */
import type { MenuItem, OrderItem, OrderItemModifier } from "@/data/types";

/** the group id the parts of a box carry on an order line */
export const COMBO_GROUP = "combo";

/** the parts of a box as modifier rows (price 0: the box price covers them) */
export function comboMods(item: Pick<MenuItem, "comboOf">, menu: Pick<MenuItem, "id" | "name">[]): OrderItemModifier[] {
  const out: OrderItemModifier[] = [];
  for (const c of item.comboOf ?? []) {
    const part = menu.find((m) => m.id === c.itemId);
    if (!part) continue;
    for (let k = 0; k < Math.max(1, c.qty); k++) out.push({ groupId: COMBO_GROUP, modifierId: "", name: part.name, price: 0, itemId: part.id });
  }
  return out;
}

export interface Sold { direct: number; inside: number }

/** units sold per menu item: on its own (direct) and inside other items (inside). Voided lines don't count. */
export function soldUnits(lines: Pick<OrderItem, "itemId" | "qty" | "modifiers" | "status">[]): Map<string, Sold> {
  const out = new Map<string, Sold>();
  const at = (id: string) => {
    let s = out.get(id);
    if (!s) out.set(id, (s = { direct: 0, inside: 0 }));
    return s;
  };
  for (const l of lines) {
    if (l.status === "void") continue;
    at(l.itemId).direct += l.qty;
    for (const m of l.modifiers ?? []) if (m.itemId) at(m.itemId).inside += l.qty;
  }
  return out;
}

export type Fame = "top" | "trend";

/**
 * الأكثر طلباً: the 5 items sold most in the window (at least 3 units, own + inside).
 * تريند: not in the top, but its last 7 days sold at least 3 and at least double its usual week before that.
 */
export function fameOf(lines: Pick<OrderItem, "itemId" | "qty" | "modifiers" | "status" | "createdAt">[], now: Date, windowDays = 30): Map<string, Fame> {
  const weekAgo = now.getTime() - 7 * 86_400_000;
  const all = soldUnits(lines);
  const week = soldUnits(lines.filter((l) => new Date(l.createdAt).getTime() >= weekAgo));
  const total = (s?: Sold) => (s ? s.direct + s.inside : 0);
  const out = new Map<string, Fame>();
  const ranked = [...all.entries()].map(([id, s]) => [id, total(s)] as const).filter(([, n]) => n >= 3).sort((a, b) => b[1] - a[1]);
  for (const [id] of ranked.slice(0, 5)) out.set(id, "top");
  const before = Math.max(1, (windowDays - 7) / 7);
  for (const [id, s] of week) {
    if (out.has(id)) continue;
    const recent = total(s);
    const usual = (total(all.get(id)) - recent) / before;
    if (recent >= 3 && recent >= usual * 2) out.set(id, "trend");
  }
  return out;
}

/** the kitchen notes cashiers type most (a note written twice or more), most used first: the quick-note buttons */
export function topNotes(lines: Pick<OrderItem, "notes">[], max = 10): string[] {
  const n = new Map<string, number>();
  for (const l of lines)
    for (const part of (l.notes ?? "").split(/[،,\n]+/)) {
      const t = part.trim().replace(/\s+/g, " ");
      if (t && t.length <= 40) n.set(t, (n.get(t) ?? 0) + 1);
    }
  return [...n].filter(([, c]) => c >= 2).sort((a, b) => b[1] - a[1]).slice(0, max).map(([t]) => t);
}
