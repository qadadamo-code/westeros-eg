/**
 * منيو منفصل لكل فرع (Saqr 2026-11-24): every branch has a menu of its own (categories, items, option groups and their
 * options), so a change in one branch's menu never reaches another, and each branch's cashier and kitchen sell its own.
 * Rows saved before this (no branch) belong to the main branch, so nothing already there changes; another branch starts
 * empty and is filled or kept up to date from a branch's menu with "تحديث المنيو".
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

type MenuSet = { cats: MenuCategory[]; items: MenuItem[]; groups: ModifierGroup[]; mods: Modifier[] };
const norm = (t: string | null | undefined) => (t ?? "").trim().replace(/\s+/g, " ").toLowerCase();
/** the same item on two branches: the same code, else the same Arabic name */
export const sameItem = (a: Pick<MenuItem, "sku" | "name">, b: Pick<MenuItem, "sku" | "name">) => (a.sku && b.sku ? a.sku === b.sku : norm(a.name.ar) === norm(b.name.ar));

/**
 * تحديث المنيو من فرع (Saqr 2026-11-24): brings the source branch's menu into this branch without doubling anything.
 * An item already here (same code, else same name) has its data updated from the source with its option groups; an item
 * that isn't here is added with all its options. Categories match by name. Items only this branch has stay as they are.
 * Kitchen stations belong to a branch, so they are kept (new rows start on the default station).
 */
export async function syncMenu(db: Db, src: MenuSet, dst: MenuSet, to: string): Promise<{ added: number; updated: number }> {
  const strip = <T extends { id: string; createdAt?: string; updatedAt?: string; restaurantId?: string }>(r: T) => {
    const { id: _i, createdAt: _c, updatedAt: _u, restaurantId: _r, ...rest } = r;
    return rest;
  };
  // الفئات
  const catId = new Map<string, string>();
  for (const c of src.cats) {
    const here = dst.cats.find((x) => norm(x.name.ar) === norm(c.name.ar));
    if (here) {
      await db.update("menuCategories", here.id, { name: c.name, imageUrl: c.imageUrl ?? null, active: c.active, sort: c.sort, color: c.color, icon: c.icon });
      catId.set(c.id, here.id);
    } else {
      const id = uuid();
      await db.insert("menuCategories", { ...strip(c), id, branchId: to, stationId: null, externalRef: null });
      catId.set(c.id, id);
    }
  }
  // الأصناف: which one here each source item is (or a new id)
  const itemId = new Map<string, string>();
  const existing = new Map<string, MenuItem>();
  for (const i of src.items) {
    const here = dst.items.find((x) => sameItem(x, i) && ![...existing.values()].includes(x));
    if (here) existing.set(i.id, here);
    itemId.set(i.id, here?.id ?? uuid());
  }
  // the source's option groups, copied once each for the items that use them
  const used = new Set(src.items.flatMap((i) => i.modifierGroupIds));
  const groupId = new Map<string, string>();
  for (const g of src.groups) {
    if (!used.has(g.id)) continue;
    const id = uuid();
    groupId.set(g.id, id);
    await db.insert("modifierGroups", { ...strip(g), id, branchId: to, externalRef: null });
  }
  for (const m of src.mods) {
    const g = groupId.get(m.groupId);
    if (g) await db.insert("modifiers", { ...strip(m), groupId: g, menuItemId: m.menuItemId ? itemId.get(m.menuItemId) ?? null : null });
  }
  let added = 0, updated = 0;
  for (const i of src.items) {
    const here = existing.get(i.id);
    const fields = {
      ...strip(i), branchId: to, externalRef: null,
      categoryId: catId.get(i.categoryId) ?? i.categoryId,
      modifierGroupIds: i.modifierGroupIds.map((g) => groupId.get(g)).filter((g): g is string => !!g),
      comboOf: (i.comboOf ?? []).map((c) => ({ ...c, itemId: itemId.get(c.itemId) ?? c.itemId })),
    };
    if (here) {
      const { stationId: _s, ...keep } = fields;
      await db.update("menuItems", here.id, keep);
      updated++;
    } else {
      await db.insert("menuItems", { ...fields, id: itemId.get(i.id)!, stationId: null });
      added++;
    }
  }
  // the groups the updated items had before, when no other item here uses them, go (their options with them)
  const kept = new Set(dst.items.filter((x) => ![...existing.values()].includes(x)).flatMap((x) => x.modifierGroupIds));
  const old = new Set([...existing.values()].flatMap((x) => x.modifierGroupIds));
  for (const g of old) if (!kept.has(g)) await db.remove("modifierGroups", g);
  return { added, updated };
}

/** is a menu row on the working branch's menu (the cashier's and kitchen's branch) */
export function useOnWorkingMenu() {
  const { branchId } = useSession();
  const main = mainBranchOf(useLive("branches").data);
  return useMemo(() => onMenuOf(branchId, main), [branchId, main]);
}
