/**
 * Search over names the way people type them: any part of the name, the words in any order,
 * the first letters of the words ("ب ل" or "بل" finds "برجر لحم"), or a word shortened ("بطس" finds "بطاطس").
 * Arabic spelling variants (أ إ آ، ة، ى، التشكيل) and Arabic digits are treated as the same.
 */
export function searchNorm(s: string): string {
  return s
    .toLowerCase()
    .replace(/[ً-ٰٟـ]/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

const isSubseq = (short: string, word: string) => {
  let i = 0;
  for (const ch of word) if (ch === short[i]) i++;
  return i === short.length;
};

/** How well the text answers the query: 0 = not at all; higher = closer. An empty query matches everything. */
export function searchScore(query: string, text: string): number {
  const q = searchNorm(query);
  if (!q) return 1;
  const t = searchNorm(text);
  if (!t) return 0;
  if (t === q) return 120;
  if (t.startsWith(q)) return 100;
  const words = t.split(" ");
  const tokens = q.split(" ");
  if (tokens.every((k) => words.some((w) => w.startsWith(k)))) return 80;
  if (tokens.every((k) => t.includes(k))) return 60;
  // the first letters of the words, with and without "ال"
  const joined = tokens.join("");
  if (joined.length >= 2) {
    const initials = words.map((w) => w[0]).join("");
    const bare = words.map((w) => (w.length > 2 && w.startsWith("ال") ? w[2] : w[0])).join("");
    if (initials.includes(joined) || bare.includes(joined)) return 40;
  }
  // every typed word is a shortened word of the name: same first letter, letters in order
  if (tokens.every((k) => k.length >= 2 && words.some((w) => w[0] === k[0] && isSubseq(k, w)))) return 20;
  return 0;
}

/** The rows that answer the query, the closest first; rows of equal closeness keep their order. */
export function searchFilter<T>(rows: readonly T[], query: string, text: (row: T) => string | (string | null | undefined)[]): T[] {
  if (!searchNorm(query)) return [...rows];
  const scored: { row: T; score: number; i: number }[] = [];
  rows.forEach((row, i) => {
    const t = text(row);
    const score = Array.isArray(t) ? Math.max(0, ...t.map((x) => (x ? searchScore(query, x) : 0))) : searchScore(query, t);
    if (score > 0) scored.push({ row, score, i });
  });
  return scored.sort((a, b) => b.score - a.score || a.i - b.i).map((x) => x.row);
}

/** Whether any of the texts answers the query (an empty query matches). */
export const searchHit = (query: string, ...texts: (string | null | undefined)[]): boolean => !searchNorm(query) || texts.some((t) => !!t && searchScore(query, t) > 0);
