/** Why a catalog row cannot be deleted: anything that still points at it. null = free to delete. */
import type { Db } from "@/data/hooks";
import type { Recipe } from "@/data/types";
import type { Cc } from "../useCc";

export const HAS_MOVES = "له حركات في المخزن";
export const IN_REQUEST = "موجود في طلب شراء أو توريد";

/** A stock item (raw material, or the stock card of a product). `selfProductId`: the product that owns the card. */
export async function stockItemUse(db: Db, cc: Cc, recipes: Recipe[], itemId: string, selfProductId?: string, ignoreRefIds?: Set<string>): Promise<string | null> {
  if (cc.levels.some((l) => l.itemId === itemId && l.qty !== 0)) return "له رصيد في المخزن";
  const inProduct = cc.prod.products.find((p) => p.id !== selfProductId && [...p.lines, ...p.packaging].some((l) => l.itemId === itemId));
  if (inProduct) return `داخل في وصفة ${inProduct.name.ar}`;
  if (recipes.some((r) => r.lines.some((l) => l.itemId === itemId))) return "داخل في مكونات صنف بيع";
  const s = cc.prod.settings;
  if (s && [s.chickenItemId, s.rawFatItemId, s.burgerFatItemId, s.mincedChickenItemId].includes(itemId)) return "محدد في ثوابت النظام";
  // moves of cancelled batches being deleted with the product cancel out, so they don't count
  if (ignoreRefIds?.size) {
    if ((await db.list("stockMoves", { where: { itemId } })).some((m) => !m.refId || !ignoreRefIds.has(m.refId))) return HAS_MOVES;
  } else if ((await db.list("stockMoves", { where: { itemId }, limit: 1 })).length) return HAS_MOVES;
  if ((await db.list("stockRequests")).some((r) => r.lines.some((l) => l.itemId === itemId))) return IN_REQUEST;
  return null;
}
