/**
 * الخيارات الجانبية (Mohammed 2026-11-23): the one place an option's name (Arabic and English), price and availability are
 * set. A group on an item only picks options from this list and sets how many times each may be picked; it cannot change
 * the price. An option may stand for a menu item (a burger chosen inside a box) so that item's sales count it.
 */
import type { MenuItem, Modifier } from "@/data/types";
import type { MfgLists } from "@/data/productionTypes";
import { uuid } from "@/lib/id";
import { UNITS_PER_MAJOR as U } from "@/lib/money";
import { norm } from "./bonbell";

export type SideOpt = NonNullable<MfgLists["sideOptions"]>[number];

/** the modifier columns that come from the side option */
export const modFieldsOf = (o: SideOpt) => ({
  name: { ar: o.nameAr?.trim() || o.name, en: o.name },
  price: Math.round(o.price * U),
  available: o.available !== false,
  sideOptionId: o.id,
  menuItemId: o.menuItemId ?? null,
});

/** does a modifier already match its side option? */
export const inStep = (m: Modifier, o: SideOpt) => {
  const f = modFieldsOf(o);
  return m.name.ar === f.name.ar && m.name.en === f.name.en && m.price === f.price && m.available === f.available && (m.menuItemId ?? null) === f.menuItemId;
};

export interface LinkPlan {
  /** the list after linking (options added for modifiers that had none, menu items matched by name) */
  library: SideOpt[];
  libraryChanged: boolean;
  /** modifiers to tie to their side option (only the link: name and price stay as they are until the option is edited) */
  links: { id: string; sideOptionId: string; menuItemId: string | null }[];
}

/**
 * Ties every option on the menu to the side options list, by English name: an option with no match is added to the list
 * with its own price. A side option never decided on (menuItemId undefined) whose name is a menu item's name stands for it.
 */
export function linkPlan(library: SideOpt[], mods: Modifier[], items: Pick<MenuItem, "id" | "name">[]): LinkPlan {
  const lib = library.map((o) => ({ ...o }));
  let changed = false;
  const byName = new Map(lib.map((o) => [norm(o.name), o]));
  const itemByName = new Map<string, string>();
  for (const i of items) for (const n of [i.name.en, i.name.ar]) if (norm(n) && !itemByName.has(norm(n))) itemByName.set(norm(n), i.id);
  const links: LinkPlan["links"] = [];
  for (const m of mods) {
    if (m.sideOptionId && lib.some((o) => o.id === m.sideOptionId)) continue;
    const key = norm(m.name.en || m.name.ar);
    if (!key) continue;
    let o = byName.get(key);
    if (!o) {
      o = { id: uuid(), name: m.name.en || m.name.ar, ...(m.name.ar && m.name.ar !== m.name.en ? { nameAr: m.name.ar } : {}), price: m.price / U, available: true };
      lib.push(o);
      byName.set(key, o);
      changed = true;
    }
    links.push({ id: m.id, sideOptionId: o.id, menuItemId: null });
  }
  for (const o of lib) {
    if (o.menuItemId !== undefined) continue;
    o.menuItemId = itemByName.get(norm(o.name)) ?? itemByName.get(norm(o.nameAr)) ?? null;
    changed = true;
  }
  const libById = new Map(lib.map((o) => [o.id, o]));
  for (const l of links) l.menuItemId = libById.get(l.sideOptionId)?.menuItemId ?? null;
  // options already tied whose side option now stands for a menu item
  for (const m of mods) {
    const o = m.sideOptionId ? libById.get(m.sideOptionId) : undefined;
    if (o && (o.menuItemId ?? null) !== (m.menuItemId ?? null) && !links.some((l) => l.id === m.id)) links.push({ id: m.id, sideOptionId: o.id, menuItemId: o.menuItemId ?? null });
  }
  return { library: lib, libraryChanged: changed, links };
}
