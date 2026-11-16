/** What the showcase views draw from the live menu: categories with their sellable items and photos. */
import { useMemo } from "react";
import { useLive } from "@/data/hooks";
import type { MenuCategory, MenuItem } from "@/data/types";
import { categoryPhoto, menuPhoto } from "@/data/westeros/menuImages";
import type { CoffeeItem } from "@/fx/PourMenu";

export interface ShowItem {
  item: MenuItem;
  photo: string;
}
export interface ShowCategory {
  cat: MenuCategory;
  photo: string | null;
  items: ShowItem[];
}

/** a drawn plate with the item's first letter, for an item without a photo */
export function platePlaceholder(name: string, color = "#f8bb18"): string {
  const ch = [...name.trim()][0] ?? "•";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400"><defs><radialGradient id="g" cx="50%" cy="42%"><stop offset="0" stop-color="#2a2a2a"/><stop offset="1" stop-color="#0d0d0d"/></radialGradient></defs><rect width="400" height="400" fill="url(#g)"/><circle cx="200" cy="200" r="150" fill="none" stroke="${color}" stroke-width="3" opacity=".7"/><circle cx="200" cy="200" r="118" fill="none" stroke="${color}" stroke-width="1.5" opacity=".35"/><text x="200" y="245" text-anchor="middle" font-family="Tajawal,system-ui,sans-serif" font-size="130" font-weight="800" fill="${color}">${ch}</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export function useShowcase() {
  const cats = useLive("menuCategories", { orderBy: [{ field: "sort" }] });
  const items = useLive("menuItems", { orderBy: [{ field: "sort" }] });
  return useMemo(() => {
    const categories: ShowCategory[] = cats.data
      .filter((c) => c.active)
      .map((cat) => ({
        cat,
        photo: categoryPhoto(cat.name.ar),
        items: items.data.filter((i) => i.categoryId === cat.id && i.active).map((item) => ({ item, photo: item.imageUrl ?? menuPhoto(item.name.ar) ?? platePlaceholder(item.name.ar, cat.color) })),
      }))
      .filter((c) => c.items.length);
    return { loading: cats.loading || items.loading, categories };
  }, [cats.data, cats.loading, items.data, items.loading]);
}

const has = (c: ShowCategory, re: RegExp) => re.test(`${c.cat.name.ar} ${c.cat.name.en}`.toLowerCase());
const itemHas = (i: ShowItem, re: RegExp) => re.test(`${i.item.name.ar} ${i.item.name.en}`.toLowerCase());

/** cold flavoured drinks for the flavour wheel */
export const flavourItems = (cs: ShowCategory[]) => cs.filter((c) => has(c, /موكتيل|صودا|mocktail|soda/)).flatMap((c) => c.items).slice(0, 7);
/** offers and boxes for the stacked deck (falls back to the first items of the menu) */
export function offerItems(cs: ShowCategory[]): ShowItem[] {
  const offers = cs.filter((c) => has(c, /عروض|عرض|offer|combo|box/)).flatMap((c) => c.items);
  return (offers.length ? offers : cs.flatMap((c) => c.items.slice(0, 1))).slice(0, 8);
}
/** coffee and milkshakes for the pour stage */
export const pourItems = (cs: ShowCategory[]) => cs.filter((c) => has(c, /شيك|shake|قهوة|coffee|ساخن|hot/)).flatMap((c) => c.items).filter((i) => itemHas(i, /شيك|shake|قهوة|coffee|لاتيه|latte|كابتشينو|cappuccino|اسبريسو|espresso/));

/** how a drink is poured on the stage, read from its name */
export function pourRecipe(i: ShowItem, name: string, subtitle: string, n: number): CoffeeItem {
  const base = { id: i.item.id, name, subtitle, description: i.item.description.ar || undefined };
  if (itemHas(i, /قهوة|coffee|اسبريسو|espresso/)) return { ...base, vessel: "demitasse", layers: [{ type: "espresso", amount: 0.72 }], crema: true };
  if (itemHas(i, /لاتيه|latte|كابتشينو|cappuccino/)) return { ...base, vessel: "cup", layers: [{ type: "espresso", amount: 0.3 }, { type: "milk", amount: 0.44 }], foam: 0.14, art: "heart" };
  const vessel = n % 2 ? "glass-mug" : "tall-glass";
  if (itemHas(i, /شوكو|chocolate|هازلنت|hazelnut|بيناتيلا|nutella|peanut/)) return { ...base, vessel, layers: [{ type: "espresso", amount: 0.34 }, { type: "milk", amount: 0.42 }], foam: 0.1, blend: 0.6 };
  if (itemHas(i, /كراميل|caramel|لوتس|lotus/)) return { ...base, vessel, layers: [{ type: "espresso", amount: 0.14 }, { type: "milk", amount: 0.6 }], foam: 0.12, blend: 0.95 };
  return { ...base, vessel, layers: [{ type: "milk", amount: 0.72 }], foam: 0.13 };
}

/** deep page colours the flavour wheel blends between */
export const FLAVOUR_COLORS = ["#3d2a04", "#43121a", "#0f3327", "#11304a", "#34163f", "#4a2408", "#1d1d1d"];
