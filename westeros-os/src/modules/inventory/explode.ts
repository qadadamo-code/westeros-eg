/**
 * Recipe explosion — which stock items (base units) one order line consumes. Pure; shared by the live deduction
 * (./deduct.ts), the demo seed and the reports.
 *
 *   menu item recipe × qty ÷ yield
 *   + each chosen modifier's recipe (an item-scoped one wins: "large" mango juice ≠ "large" lemon-mint)
 *   + combos: each component's recipe × component qty
 * Trim yield and cooking loss are grossed up (costing.grossQty). Prep items stay prep items (they are stocked).
 */
import type { MenuItem, Modifier, OrderItem, OrderMode, Recipe, StockItem } from "@/data/types";
import { grossQty } from "./costing";
import { q3 } from "./units";
import { COMBO_GROUP } from "@/modules/menu/sold";

export interface ExplodeContext {
  menuItems: Map<string, MenuItem>;
  stockItems: Map<string, StockItem>;
  /** recipeKey(ownerType, ownerId, scopeItemId?) → recipe */
  recipes: Map<string, Recipe>;
  /** modifier id → its side option id: a side option's own recipe (أصناف البيع > الإضافات الجانبية) serves every item it is on */
  sideOf?: Map<string, string>;
}

export const recipeKey = (t: Recipe["ownerType"], id: string, scope?: string | null) => (scope ? `${t}:${id}@${scope}` : `${t}:${id}`);

export function explodeContext(menuItems: MenuItem[], stockItems: StockItem[], recipes: Recipe[], modifiers: Pick<Modifier, "id" | "sideOptionId">[] = []): ExplodeContext {
  return {
    sideOf: new Map(modifiers.filter((m) => m.sideOptionId).map((m) => [m.id, m.sideOptionId as string])),
    menuItems: new Map(menuItems.map((m) => [m.id, m])),
    stockItems: new Map(stockItems.map((s) => [s.id, s])),
    recipes: new Map(recipes.map((r) => [recipeKey(r.ownerType, r.ownerId, r.scopeItemId), r])),
  };
}

/** The modifier recipe that applies on this menu item. */
export const modifierRecipe = (ctx: Pick<ExplodeContext, "recipes" | "sideOf">, modifierId: string, itemId: string) => {
  const side = ctx.sideOf?.get(modifierId);
  return ctx.recipes.get(recipeKey("modifier", modifierId, itemId)) ?? ctx.recipes.get(recipeKey("modifier", modifierId)) ?? (side ? ctx.recipes.get(recipeKey("modifier", side)) : undefined);
};

/** محلي / استلام: a line marked for one kind of order is skipped on the other; with no mode every line counts */
export const lineApplies = (l: { use?: "dine" | "pickup" }, mode?: OrderMode | null) => !l.use || !mode || (l.use === "dine" ? mode === "dine_in" : mode !== "dine_in");

function addRecipe(out: Map<string, number>, r: Recipe | undefined, portions: number, ctx: ExplodeContext, mode?: OrderMode | null) {
  if (!r) return;
  const per = portions / Math.max(1, r.yieldQty || 1);
  for (const l of r.lines) if (lineApplies(l, mode)) out.set(l.itemId, q3((out.get(l.itemId) ?? 0) + grossQty(l, ctx.stockItems.get(l.itemId)) * per));
}

/** Stock items one order line consumes. Totals ≤ 0 (a "no X" on an item without X) are dropped. */
export function explodeLine(line: Pick<OrderItem, "itemId" | "qty" | "modifiers">, ctx: ExplodeContext, mode?: OrderMode | null): Map<string, number> {
  const out = new Map<string, number>();
  const item = ctx.menuItems.get(line.itemId);
  const own = ctx.recipes.get(recipeKey("menu_item", line.itemId));
  if (own) addRecipe(out, own, line.qty, ctx, mode);
  else if (item?.comboOf?.length) for (const c of item.comboOf) addRecipe(out, ctx.recipes.get(recipeKey("menu_item", c.itemId)), line.qty * c.qty, ctx, mode);
  for (const m of line.modifiers) {
    if (m.groupId === COMBO_GROUP) continue; // a part of a box: the box's own recipe or comboOf above covers it
    const r = modifierRecipe(ctx, m.modifierId, line.itemId);
    // an option that is a menu item (a burger chosen in a box) uses that item's recipe when it has no recipe of its own
    addRecipe(out, r ?? (m.itemId ? ctx.recipes.get(recipeKey("menu_item", m.itemId)) : undefined), line.qty, ctx, mode);
  }
  for (const [k, v] of out) if (v <= 0) out.delete(k);
  return out;
}
