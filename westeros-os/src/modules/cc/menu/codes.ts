/**
 * أكواد المنيو (Mohammed 2026-11-23): every category owns a block of 1000 codes, in its order: the first 1–999, the next
 * 1000–1999, then 2000–2999… Each item takes the next free number of its category's block (1, 2, 3… in the first).
 * The item code is its sku, so the cashier finds it by typing the number.
 */
import type { MenuCategory, MenuItem } from "@/data/types";

export const BLOCK = 1000;
/** the codes a category's block holds */
export const blockRange = (start: number) => {
  const b = Math.floor(start / BLOCK);
  return { from: b === 0 ? 1 : b * BLOCK, to: b * BLOCK + BLOCK - 1 };
};
/**
 * فئات بمدى أكواد (Saqr 2026-11-28): the category's own start and count when it has a count, else the old block of 1000.
 */
export const rangeOf = (c: Pick<MenuCategory, "code" | "codeCount">) => {
  if (c.code == null) return null;
  if (c.codeCount && c.codeCount > 0) return { from: Math.max(1, c.code), to: Math.max(1, c.code) + c.codeCount - 1 };
  return blockRange(c.code);
};
/** the start and count a new category is offered: right after the last range of the categories there */
export function suggestRange(cats: Pick<MenuCategory, "code" | "codeCount">[], count = 1000) {
  const ends = cats.map(rangeOf).filter((r): r is { from: number; to: number } => !!r).map((r) => r.to);
  return { from: ends.length ? Math.max(...ends) + 1 : 1, count };
}
/** the category whose range crosses this one, if any */
export function rangeClash(cats: Pick<MenuCategory, "id" | "code" | "codeCount" | "name">[], id: string | null, from: number, count: number) {
  const to = from + count - 1;
  return cats.find((c) => {
    if (c.id === id) return false;
    const r = rangeOf(c);
    return !!r && r.from <= to && from <= r.to;
  }) ?? null;
}
const codeOf = (sku: string | null | undefined) => (sku && /^\d+$/.test(sku.trim()) ? Number(sku.trim()) : null);

export interface CodePlan {
  cats: { id: string; code: number }[];
  /** items with no code get one silently */
  fill: { id: string; sku: string }[];
  /** items whose code is outside their category's block (or taken twice): renumbered only when the user says so */
  fix: { id: string; from: string; sku: string }[];
}

export function planCodes(cats: Pick<MenuCategory, "id" | "sort" | "code" | "codeCount">[], items: Pick<MenuItem, "id" | "categoryId" | "sort" | "sku">[]): CodePlan {
  const out: CodePlan = { cats: [], fill: [], fix: [] };
  const start = new Map<string, { from: number; to: number }>();
  const used = new Set<number>();
  for (const c of cats) {
    const r = rangeOf(c);
    if (r) for (let b = Math.floor(r.from / BLOCK); b <= Math.floor(r.to / BLOCK); b++) used.add(b);
  }
  let next = 0;
  for (const c of [...cats].sort((a, b) => a.sort - b.sort)) {
    const r = rangeOf(c);
    if (r) {
      start.set(c.id, r);
      continue;
    }
    while (used.has(next)) next++;
    used.add(next);
    const code = next === 0 ? 1 : next * BLOCK;
    start.set(c.id, blockRange(code));
    out.cats.push({ id: c.id, code });
  }
  for (const c of cats) {
    const s = start.get(c.id);
    if (!s) continue;
    const { from, to } = s;
    const mine = items.filter((i) => i.categoryId === c.id).sort((a, b) => a.sort - b.sort);
    const taken = new Set<number>();
    const ok = new Set<string>();
    for (const i of mine) {
      const n = codeOf(i.sku);
      if (n != null && n >= from && n <= to && !taken.has(n)) (taken.add(n), ok.add(i.id));
    }
    let n = from;
    const nextFree = () => {
      while (taken.has(n) && n <= to) n++;
      taken.add(n);
      return String(n);
    };
    for (const i of mine) {
      if (ok.has(i.id)) continue;
      if (!i.sku?.trim()) out.fill.push({ id: i.id, sku: nextFree() });
      else out.fix.push({ id: i.id, from: i.sku, sku: nextFree() });
    }
  }
  return out;
}

/** the next free code in a category's block, or "" when the category has no code yet */
export function nextCode(cat: Pick<MenuCategory, "code" | "codeCount"> | undefined, items: Pick<MenuItem, "categoryId" | "sku">[], categoryId: string): string {
  const r = cat ? rangeOf(cat) : null;
  if (!r) return "";
  const { from, to } = r;
  const taken = new Set(items.filter((i) => i.categoryId === categoryId).map((i) => codeOf(i.sku)));
  for (let n = from; n <= to; n++) if (!taken.has(n)) return String(n);
  return "";
}
