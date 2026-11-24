/**
 * منيو منفصل لكل فرع (Saqr 2026-11-24): every branch has a menu of its own (categories, items, option groups and their
 * options), so a change in one branch's menu never reaches another, and each branch's cashier and kitchen sell its own.
 * Rows saved before this (no branch) belong to the main branch, so nothing already there changes; another branch starts
 * empty and can copy a branch's menu with one button.
 */
import { createContext, useContext, useMemo } from "react";
import { useSession } from "@/auth/session";
import { useLive } from "@/data/hooks";
import type { Branch, MenuCategory, MenuItem, Modifier, ModifierGroup } from "@/data/types";
import type { Db } from "@/data/hooks";
import { uuid } from "@/lib/id";

/** the branch whose menu is open on the screen; dialogs save new rows to it */
export const MenuBranchCtx = createContext<string | null>(null);
export const useMenuBranch = () => useContext(MenuBranchCtx);

/** the branch the menu rows without a branch belong to: the default branch (not a central kitchen) */
export function mainBranchOf(branches: Pick<Branch, "id" | "isDefault" | "isCentral">[]): string | null {
  return (branches.find((b) => b.isDefault && !b.isCentral) ?? branches.find((b) => !b.isCentral) ?? branches[0])?.id ?? null;
}

/** is this row on the branch's menu */
export const onMenuOf = (branchId: string | null, main: string | null) => (row: { branchId?: string | null }) => !branchId || (row.branchId ?? main) === branchId;

/** one branch's menu out of all the rows: options follow their group */
export function branchMenu<C extends MenuCategory, I extends MenuItem, G extends ModifierGroup, M extends Modifier>(
  all: { cats: C[]; items: I[]; groups: G[]; mods: M[] }, branchId: string | null, main: string | null,
) {
  const on = onMenuOf(branchId, main);
  const groups = all.groups.filter(on);
  const ids = new Set(groups.map((g) => g.id));
  return { cats: all.cats.filter(on), items: all.items.filter(on), groups, mods: all.mods.filter((m) => ids.has(m.groupId)) };
}

/**
 * نسخ المنيو: adds a copy of one branch's menu to another (new rows, the source stays as it is). Links inside the menu
 * (item → category, item → option groups, box contents, option → item) point to the copies; kitchen stations belong to a
 * branch, so the copies start on the default station.
 */
export async function copyMenu(db: Db, src: { cats: MenuCategory[]; items: MenuItem[]; groups: ModifierGroup[]; mods: Modifier[] }, to: string): Promise<number> {
  const strip = <T extends { id: string; createdAt?: string; updatedAt?: string; restaurantId?: string }>(r: T) => {
    const { id: _i, createdAt: _c, updatedAt: _u, restaurantId: _r, ...rest } = r;
    return rest;
  };
  const catId = new Map(src.cats.map((c) => [c.id, uuid()]));
  const groupId = new Map(src.groups.map((g) => [g.id, uuid()]));
  const itemId = new Map(src.items.map((i) => [i.id, uuid()]));
  for (const c of src.cats) await db.insert("menuCategories", { ...strip(c), id: catId.get(c.id)!, branchId: to, stationId: null, externalRef: null });
  for (const g of src.groups) await db.insert("modifierGroups", { ...strip(g), id: groupId.get(g.id)!, branchId: to, externalRef: null });
  for (const i of src.items) {
    await db.insert("menuItems", {
      ...strip(i), id: itemId.get(i.id)!, branchId: to, stationId: null, externalRef: null,
      categoryId: catId.get(i.categoryId) ?? i.categoryId,
      modifierGroupIds: i.modifierGroupIds.map((g) => groupId.get(g)).filter((g): g is string => !!g),
      comboOf: (i.comboOf ?? []).map((c) => ({ ...c, itemId: itemId.get(c.itemId) ?? c.itemId })),
    });
  }
  for (const m of src.mods) {
    const g = groupId.get(m.groupId);
    if (!g) continue;
    await db.insert("modifiers", { ...strip(m), groupId: g, menuItemId: m.menuItemId ? itemId.get(m.menuItemId) ?? null : null });
  }
  return src.items.length;
}

/** is a menu row on the working branch's menu (the cashier's and kitchen's branch) */
export function useOnWorkingMenu() {
  const { branchId } = useSession();
  const main = mainBranchOf(useLive("branches").data);
  return useMemo(() => onMenuOf(branchId, main), [branchId, main]);
}
