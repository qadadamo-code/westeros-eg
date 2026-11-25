/**
 * مكونات الصنف والمتاح في الفرع (Saqr 2026-11-25): for a menu item, the lines of its recipe with what one portion needs
 * and what the branch has, and how many portions that makes: the lowest of (on hand ÷ qty per portion) over its ingredients.
 * An item is short when one ingredient is below one portion. An item without a recipe counts as short too (Saqr's "اه",
 * 2026-11-25) until its recipe is added.
 */
import { useMemo } from "react";
import { useLive } from "@/data/hooks";
import type { MenuItem, Recipe, StockItem } from "@/data/types";
import { sameItem } from "@/modules/cc/menu/menuBranch";

export interface StockLine { itemId: string; name: string; unit: StockItem["baseUnit"]; need: number; have: number }
export interface StockInfo { lines: StockLine[]; portions: number; short: boolean; noRecipe?: boolean }

/** pure: recipe lines against on-hand quantities (base units) */
const NO_RECIPE: StockInfo = { lines: [], portions: 0, short: true, noRecipe: true };
export function stockInfoOf(recipe: Pick<Recipe, "lines" | "yieldQty"> | null, onHand: Map<string, number>, items: Map<string, Pick<StockItem, "name" | "baseUnit">>): StockInfo {
  if (!recipe || !recipe.lines.length) return NO_RECIPE;
  const y = recipe.yieldQty || 1;
  const lines: StockLine[] = recipe.lines
    .filter((l) => l.qty > 0)
    .map((l) => ({
      itemId: l.itemId,
      name: items.get(l.itemId)?.name.ar ?? "—",
      unit: items.get(l.itemId)?.baseUnit ?? "pc",
      need: (l.qty * (1 + (l.lossBp ?? 0) / 10_000)) / y,
      have: Math.max(0, onHand.get(l.itemId) ?? 0),
    }));
  if (!lines.length) return NO_RECIPE;
  const portions = Math.max(0, Math.floor(Math.min(...lines.map((l) => (l.need > 0 ? l.have / l.need : Infinity))) + 1e-9));
  return { lines, portions: Number.isFinite(portions) ? portions : 0, short: lines.some((l) => l.have + 1e-9 < l.need) };
}

const UNIT = { g: ["جم", "كجم"], ml: ["مل", "لتر"], pc: ["حبة", "حبة"] } as const;
export function qtyLabel(q: number, unit: StockItem["baseUnit"]): string {
  const big = unit !== "pc" && Math.abs(q) >= 1000;
  const v = big ? q / 1000 : q;
  return `${Number(v.toFixed(big ? 2 : v % 1 ? 1 : 0))} ${UNIT[unit][big ? 1 : 0]}`;
}

/** stock info for every menu item of the branch, worked out on demand */
export function useBranchStock(branchId: string | null | undefined, menu: MenuItem[]) {
  const recipes = useLive("recipes").data;
  const levels = useLive("stockLevels").data;
  const stockItems = useLive("stockItems").data;
  return useMemo(() => {
    const onHand = new Map<string, number>();
    for (const l of levels) if (!branchId || l.branchId === branchId) onHand.set(l.itemId, (onHand.get(l.itemId) ?? 0) + l.qty);
    const items = new Map(stockItems.map((i) => [i.id, i]));
    const recipeOf = new Map(recipes.filter((r) => r.ownerType === "menu_item" && !r.scopeItemId && r.lines.length).map((r) => [r.ownerId, r]));
    const cache = new Map<string, StockInfo>();
    return (item: MenuItem): StockInfo => {
      if (cache.has(item.id)) return cache.get(item.id)!;
      // كل فرع إله منيو: a branch copy without its own recipe uses the same item's recipe from another branch
      let r = recipeOf.get(item.id) ?? null;
      if (!r) {
        const twin = menu.find((m) => m.id !== item.id && recipeOf.has(m.id) && sameItem(m, item));
        r = twin ? recipeOf.get(twin.id)! : null;
      }
      const info = stockInfoOf(r, onHand, items);
      cache.set(item.id, info);
      return info;
    };
  }, [recipes, levels, stockItems, branchId, menu]);
}
