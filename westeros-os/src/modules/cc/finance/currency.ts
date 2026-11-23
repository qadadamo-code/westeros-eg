/**
 * العملات: the system's own currency (العملة الأساسية, chosen in ثوابت النظام > الحسابات), the other currencies an account may be kept in,
 * and the exchange rate a voucher between two currencies asks for.
 * Every journal line stays in the system's currency; a line on an account kept in another currency also carries what moved in that currency (`fx`).
 */
import type { FinAccount, FinFx, FinLine, FinSettingsData } from "@/data/financeTypes";
import type { Units } from "@/lib/money";

/** the currencies offered when one is added */
export const CURRENCY_LIST: { code: string; name: string; symbol: string }[] = [
  { code: "EGP", name: "جنيه مصري", symbol: "ج.م" },
  { code: "USD", name: "دولار أمريكي", symbol: "$" },
  { code: "EUR", name: "يورو", symbol: "€" },
  { code: "GBP", name: "جنيه إسترليني", symbol: "£" },
  { code: "SAR", name: "ريال سعودي", symbol: "ر.س" },
  { code: "AED", name: "درهم إماراتي", symbol: "د.إ" },
  { code: "KWD", name: "دينار كويتي", symbol: "د.ك" },
  { code: "QAR", name: "ريال قطري", symbol: "ر.ق" },
  { code: "BHD", name: "دينار بحريني", symbol: "د.ب" },
  { code: "OMR", name: "ريال عماني", symbol: "ر.ع" },
  { code: "JOD", name: "دينار أردني", symbol: "د.أ" },
  { code: "TRY", name: "ليرة تركية", symbol: "₺" },
  { code: "CNY", name: "يوان صيني", symbol: "¥" },
  { code: "ILS", name: "شيكل", symbol: "₪" },
];
export const currencyName = (code: string) => CURRENCY_LIST.find((c) => c.code === code)?.name ?? code;
/** ج.م، $، ر.س … */
export const currencySymbol = (code: string) => CURRENCY_LIST.find((c) => c.code === code)?.symbol ?? code;

type Cur = Pick<FinSettingsData, "currency" | "currencies">;
/** the system's own currency */
export const baseOf = (s: Partial<Cur>) => s.currency || "EGP";
/** the currency an account is kept in: its own, or the system's */
export const currencyOf = (a: Pick<FinAccount, "currency"> | null | undefined, s: Partial<Cur>) => a?.currency || baseOf(s);
export const isForeign = (a: Pick<FinAccount, "currency"> | null | undefined, s: Partial<Cur>) => currencyOf(a, s) !== baseOf(s);
/** آخر سعر: one unit of `code` in the system's currency (the system's own is 1); null when none was saved yet */
export function rateOf(code: string, s: Partial<Cur>): number | null {
  if (code === baseOf(s)) return 1;
  const r = s.currencies?.find((c) => c.code === code)?.rate;
  return r && r > 0 ? r : null;
}
/** a typed rate: "50" or "50.25"; 0 when it is not a positive number */
export const parseRate = (t: string) => { const n = Number(String(t).replace(/,/g, "").trim()); return Number.isFinite(n) && n > 0 ? n : 0; };
export const rateText = (n: number | null | undefined) => (n && n > 0 ? String(Math.round(n * 1e6) / 1e6) : "");

/** What a voucher touching an account kept in another currency needs. */
export interface FxInput {
  /** currency of the money account (the one the amount is typed in) */
  from: string;
  /** transfer only: currency of the receiving account */
  to?: string;
  /** 1 `from` = rate `to` (transfer between two currencies) or 1 `from` = rate in the system's currency */
  rate: number;
  /** transfer between two currencies, neither the system's: 1 `from` in the system's currency */
  fromBase?: number;
}
/** How a transfer between two currencies is valued: what leaves, what arrives, and what both are worth in the system's currency. */
export function transferValue(amount: Units, f: Required<Pick<FxInput, "from" | "to" | "rate">> & { fromBase?: number }, base: string): { received: Units; value: Units; fromRate: number; toRate: number } | null {
  if (!(amount > 0) || !(f.rate > 0)) return null;
  const received = Math.round(amount * f.rate);
  const fromRate = f.from === base ? 1 : f.to === base ? f.rate : f.fromBase ?? 0;
  if (!(fromRate > 0)) return null;
  const value = f.from === base ? amount : f.to === base ? received : Math.round(amount * fromRate);
  return { received, value, fromRate, toRate: received ? value / received : 0 };
}
export const fx = (currency: string, amount: Units, rate: number): FinFx => ({ currency, amount, rate: Math.round(rate * 1e6) / 1e6 });

/**
 * رصيد الحساب بعملته (debit − credit). A line that carries what moved in the account's currency counts that;
 * any other line (an opening balance, a manual entry) is turned into the account's currency at today's rate.
 */
export function foreignBalance(lines: Pick<FinLine, "debit" | "credit" | "fx">[], code: string, s: Partial<Cur>): Units {
  const rate = rateOf(code, s) ?? 0;
  return lines.reduce((sum, l) => {
    const sign = l.debit - l.credit >= 0 ? 1 : -1;
    if (l.fx && l.fx.currency === code) return sum + sign * l.fx.amount;
    return sum + (rate ? Math.round((l.debit - l.credit) / rate) : 0);
  }, 0);
}

/** فئات العملة الأساسية لما ما تتحددش: the notes and coins named by the owner */
export const DEFAULT_DENOMS = [0.5, 1, 5, 10, 20, 50, 100, 200, 500];
export const denomsOf = (s: Partial<Pick<FinSettingsData, "denominations">>) => [...(s.denominations?.length ? s.denominations : DEFAULT_DENOMS)].sort((a, b) => a - b);
/** a typed denomination: a positive number with at most 2 decimals; 0 otherwise */
export const parseDenom = (t: string) => { const n = parseRate(t); return n && Math.round(n * 100) === n * 100 ? n : 0; };

type Auto = Pick<FinSettingsData, "ratesAuto" | "ratesAt" | "currencies">;
/** the rates are due once a calendar day (Cairo), only when on and there is another currency */
export function ratesDue(s: Partial<Auto>, now = new Date()): boolean {
  if (s.ratesAuto === false || !s.currencies?.length) return false;
  if (!s.ratesAt) return true;
  const day = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: "Africa/Cairo" });
  return day(new Date(s.ratesAt)) !== day(now);
}
/**
 * Free daily rates, no key and no account (an open, community-kept currency feed served from two public CDNs).
 * The feed says how much 1 base is in each currency; the system keeps 1 unit in the base, so each rate is turned over.
 */
const RATE_URLS = (b: string) => [
  `https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/${b}.min.json`,
  `https://latest.currency-api.pages.dev/v1/currencies/${b}.min.json`,
];
export function ratesFromFeed(feed: unknown, base: string, codes: string[]): Record<string, number> {
  const table = (feed as Record<string, Record<string, number>> | null)?.[base.toLowerCase()];
  const out: Record<string, number> = {};
  if (!table || typeof table !== "object") return out;
  for (const c of codes) {
    const x = Number(table[c.toLowerCase()]);
    if (Number.isFinite(x) && x > 0) out[c] = Math.round((1 / x) * 1e6) / 1e6;
  }
  return out;
}
export async function fetchRates(base: string, codes: string[], get: typeof fetch = fetch): Promise<Record<string, number>> {
  let last: unknown = null;
  for (const url of RATE_URLS(base.toLowerCase())) {
    try {
      const r = await get(url, { cache: "no-store" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const out = ratesFromFeed(await r.json(), base, codes);
      if (Object.keys(out).length) return out;
      throw new Error("no rates");
    } catch (e) { last = e; }
  }
  throw last instanceof Error ? last : new Error("تعذر جلب الأسعار");
}
