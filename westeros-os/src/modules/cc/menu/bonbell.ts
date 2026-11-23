/**
 * المنيو من Bonbell: the menu as it stands on vendor.bonbell.net (read 2026-11-23, nothing changed there), and the
 * plan that brings it into the system. The plan is shown to the user first; nothing is written before they approve.
 * Matching: Bonbell id (externalRef) first, then the Arabic or English name. Rows that are not in Bonbell stay as they are.
 */
import type { MenuCategory, MenuItem, ModifierGroup, SalesChannel } from "@/data/types";
import { UNITS_PER_MAJOR as U } from "@/lib/money";

export interface BbOption { name: string; price: number; minQty: number; maxQty: number }
export interface BbGroup { name: string; nameAr?: string; required: boolean; multi: boolean; min: number; max: number; options: BbOption[] }
export interface BbItem {
  ref: string;
  name: { en: string; ar: string };
  price: number;
  /** percent, as Bonbell keeps it */
  discountPct: number;
  prep: number;
  calories?: number | null;
  description: string;
  /** Bonbell's scenarios */
  channels: string[];
  visible: boolean;
  recommended: boolean;
  image: string | null;
  groups: BbGroup[];
}
export interface BbCategory { ref: string; name: { en: string; ar: string }; image: string | null; visible: boolean; items: BbItem[] }
export interface BbMenu { readAt: string; categories: BbCategory[]; sideOptions: { name: string; price: number }[] }

/** for matching names: no emoji, no case, the common Arabic letter variants folded */
export const norm = (s: string | null | undefined) =>
  (s ?? "")
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}️]/gu, "")
    .replace(/[أإآ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه").replace(/[ً-ْـ]/g, "")
    .toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

/** Bonbell's scenarios → the channels an item is hidden on (Car Pickup has no channel of its own here: it is a takeaway) */
export function hiddenOnOf(channels: string[]): SalesChannel[] {
  const has = (x: string) => channels.some((c) => norm(c) === norm(x));
  const out: SalesChannel[] = [];
  if (!has("Delivery")) out.push("delivery");
  if (!has("Dine in") && !has("Dine-in")) out.push("dine_in");
  if (!has("Take away") && !has("Car Pickup")) out.push("takeaway");
  return out;
}

/** discount in price units from Bonbell's percent, rounded to the pound like Bonbell shows the final price */
export const discountUnits = (price: number, pct: number) => {
  if (!pct) return 0;
  const final = Math.round(price * (1 - pct / 100));
  return Math.max(0, (price - final) * U);
};

/** a group as our columns keep it: max ≥ 1 always (multi with no limit = the number of options) */
export function groupRow(g: BbGroup) {
  const n = Math.max(1, g.options.length);
  const max = g.multi ? (g.max > 0 ? g.max : n) : 1;
  // an optional group asks for nothing (Bonbell keeps a min of 1 there meaning "once picked")
  const min = g.required ? Math.max(1, Math.min(g.min || 1, max)) : 0;
  return { name: { ar: g.nameAr || g.name, en: g.name }, min, max, required: g.required, multi: g.multi };
}

export interface PlanItem {
  bb: BbItem;
  category: BbCategory;
  /** the item it updates, or null = a new item */
  current: MenuItem | null;
  /** what changes on an existing item (empty = only its options are brought in) */
  changes: string[];
}
export interface ImportPlanBb {
  newCategories: BbCategory[];
  /** categories of the system whose name or visibility Bonbell changes */
  catChanges: { c: BbCategory; current: MenuCategory; changes: string[] }[];
  items: PlanItem[];
  /** items of the system that Bonbell does not have: left as they are */
  untouched: MenuItem[];
  /** Bonbell category → the category of the system it fills (null = a new one) */
  catIds: Record<string, string | null>;
  groups: number;
  options: number;
}

/** Same item twice in Bonbell (e.g. Kids Box under two categories): each keeps its own row, matched by its own id. */
export function planImport(menu: BbMenu, cats: MenuCategory[], items: MenuItem[]): ImportPlanBb {
  const used = new Set<string>();
  const byRef = new Map(items.filter((i) => i.externalRef).map((i) => [i.externalRef as string, i]));
  const find = (bb: BbItem): MenuItem | null => {
    const r = byRef.get(bb.ref);
    if (r) return r;
    const ar = norm(bb.name.ar);
    const en = norm(bb.name.en);
    return items.find((i) => !used.has(i.id) && !i.externalRef && ((ar && norm(i.name.ar) === ar) || (en && norm(i.name.en) === en))) ?? null;
  };
  // a Bonbell category fills: the one it was imported into, the one with its name, or the one most of its items already sit in
  const matched = new Map<string, MenuItem | null>();
  for (const c of menu.categories) for (const bb of c.items) {
    const cur = find(bb);
    if (cur) used.add(cur.id);
    matched.set(bb.ref, cur);
  }
  const catIds: Record<string, string | null> = {};
  const taken = new Set<string>();
  for (const c of menu.categories) {
    const byName = cats.find((x) => x.externalRef === c.ref) ?? cats.find((x) => (norm(c.name.ar) && norm(x.name.ar) === norm(c.name.ar)) || norm(x.name.en) === norm(c.name.en));
    if (byName) (catIds[c.ref] = byName.id), taken.add(byName.id);
  }
  for (const c of menu.categories) {
    if (catIds[c.ref]) continue;
    const votes = new Map<string, number>();
    for (const bb of c.items) {
      const cur = matched.get(bb.ref);
      if (cur) votes.set(cur.categoryId, (votes.get(cur.categoryId) ?? 0) + 1);
    }
    const best = [...votes.entries()].sort((a, b) => b[1] - a[1])[0];
    catIds[c.ref] = best && !taken.has(best[0]) && best[1] * 2 >= c.items.length && cats.some((x) => x.id === best[0] && !x.externalRef) ? best[0] : null;
    if (catIds[c.ref]) taken.add(catIds[c.ref] as string);
  }
  const catFor = (c: BbCategory) => cats.find((x) => x.id === catIds[c.ref]) ?? null;
  const out: ImportPlanBb = { newCategories: [], catChanges: [], items: [], untouched: [], groups: 0, options: 0, catIds };
  for (const c of menu.categories) {
    const cc = catFor(c);
    if (!cc) out.newCategories.push(c);
    else {
      const ch: string[] = [];
      if ((c.name.ar && cc.name.ar !== c.name.ar) || cc.name.en !== c.name.en) ch.push(`الاسم ← ${c.name.ar || c.name.en}`);
      if (cc.active !== c.visible) ch.push(c.visible ? "هتظهر" : "هتتخفي");
      if (ch.length) out.catChanges.push({ c, current: cc, changes: ch });
    }
    for (const bb of c.items) {
      const cur = matched.get(bb.ref) ?? null;
      const changes: string[] = [];
      if (cur) {
        if (cur.name.ar !== bb.name.ar || cur.name.en !== bb.name.en) changes.push("الاسم");
        if (cur.price !== bb.price * U) changes.push(`السعر ${cur.price / U} ← ${bb.price}`);
        if ((cur.discount ?? 0) !== discountUnits(bb.price, bb.discountPct)) changes.push("الخصم");
        if ((cur.description.en || "") !== bb.description) changes.push("الوصف");
        if (cur.recommended !== undefined && !!cur.recommended !== bb.recommended) changes.push(bb.recommended ? "مميز" : "مش مميز");
        if ((cur.calories ?? null) !== (bb.calories ?? null)) changes.push("السعرات");
        if (cur.prepMinutes !== bb.prep) changes.push("وقت التحضير");
        if ((cur.imageUrl ?? null) !== bb.image) changes.push("الصورة");
        if (cur.active !== bb.visible) changes.push(bb.visible ? "يظهر" : "مخفي");
        if (catFor(c)?.id !== cur.categoryId) changes.push("الفئة");
      }
      out.items.push({ bb, category: c, current: cur, changes });
      out.groups += bb.groups.length;
      out.options += bb.groups.reduce((a, g) => a + g.options.length, 0);
    }
  }
  out.untouched = items.filter((i) => !used.has(i.id));
  return out;
}

/** the item row fields that come from Bonbell */
export function itemFields(bb: BbItem, categoryId: string, groupIds: string[], current?: MenuItem | null) {
  return {
    categoryId,
    name: { ar: bb.name.ar, en: bb.name.en },
    // Bonbell keeps one (English) description: an Arabic one written here stays
    description: { ar: current?.description.ar ?? "", en: bb.description },
    price: bb.price * U,
    discount: discountUnits(bb.price, bb.discountPct),
    prepMinutes: bb.prep,
    calories: bb.calories ?? null,
    imageUrl: bb.image,
    active: bb.visible,
    recommended: bb.recommended,
    hiddenOn: hiddenOnOf(bb.channels) as SalesChannel[],
    externalRef: bb.ref,
    modifierGroupIds: groupIds,
  };
}

export const groupsOf = (item: Pick<MenuItem, "modifierGroupIds">, groups: ModifierGroup[]) =>
  item.modifierGroupIds.map((id) => groups.find((g) => g.id === id)).filter((g): g is ModifierGroup => !!g);
