import { describe, expect, it } from "vitest";
import { major } from "@/lib/money";
import { baseOf, currencyOf, foreignBalance, rateOf, transferValue } from "./currency";
import { voucherLines, voucherProblem, type VoucherInput } from "./treasury";

const s = { currency: "EGP", currencies: [{ code: "USD", rate: 50 }, { code: "EUR", rate: 55 }] };
const v = (p: Partial<VoucherInput>): VoucherInput => ({ type: "transfer", date: "2026-11-22", moneyId: "till", otherId: "usd", amount: major(5000), party: "", memo: "", branchId: null, ...p });
const sum = (lines: { debit: number; credit: number }[]) => lines.reduce((a, l) => [a[0] + l.debit, a[1] + l.credit], [0, 0]);

describe("العملات", () => {
  it("an account without a currency is kept in the system's", () => {
    expect(baseOf({})).toBe("EGP");
    expect(currencyOf({ currency: null }, s)).toBe("EGP");
    expect(currencyOf({ currency: "USD" }, s)).toBe("USD");
    expect(rateOf("EGP", s)).toBe(1);
    expect(rateOf("USD", s)).toBe(50);
    expect(rateOf("SAR", s)).toBeNull();
  });

  it("تحويل من خزينة بالجنيه لبنك بالدولار: 5000 ج.م بسعر 1 جنيه = 0.02 دولار يوصل 100 دولار", () => {
    const lines = voucherLines(v({ fx: { base: "EGP", money: "EGP", other: "USD", rate: 0.02 } }));
    const [dr, cr] = sum(lines);
    expect(dr).toBe(cr);
    expect(dr).toBe(major(5000));
    expect(lines[0]).toMatchObject({ account: "usd", debit: major(5000), fx: { currency: "USD", amount: major(100), rate: 50 } });
    expect(lines[1].fx).toBeUndefined();
  });

  it("تحويل من بنك بالدولار لخزينة بالجنيه: 100 دولار بسعر 52 يوصل 5200 ج.م", () => {
    const lines = voucherLines(v({ moneyId: "usd", otherId: "till", amount: major(100), fx: { base: "EGP", money: "USD", other: "EGP", rate: 52 } }));
    expect(lines[0]).toMatchObject({ account: "till", debit: major(5200) });
    expect(lines[1]).toMatchObject({ account: "usd", credit: major(5200), fx: { currency: "USD", amount: major(100), rate: 52 } });
  });

  it("بين عملتين أجنبيتين يحتاج سعر العملة الأولى بالجنيه", () => {
    const f = { base: "EGP", money: "USD", other: "EUR", rate: 0.9 };
    expect(voucherProblem(v({ moneyId: "usd", otherId: "eur", amount: major(100), fx: f }))).toMatch("العملة الأساسية");
    const lines = voucherLines(v({ moneyId: "usd", otherId: "eur", amount: major(100), fx: { ...f, fromBase: 50 } }));
    expect(lines[0]).toMatchObject({ account: "eur", debit: major(5000), fx: { currency: "EUR", amount: major(90) } });
    expect(lines[1]).toMatchObject({ account: "usd", credit: major(5000), fx: { currency: "USD", amount: major(100), rate: 50 } });
  });

  it("no rate, no voucher", () => {
    expect(voucherProblem(v({ fx: { base: "EGP", money: "EGP", other: "USD", rate: 0 } }))).toBe("اكتب سعر الصرف");
    expect(transferValue(major(1), { from: "EGP", to: "USD", rate: 0 }, "EGP")).toBeNull();
  });

  it("a payment from a dollar account is typed in dollars and booked in pounds", () => {
    const lines = voucherLines(v({ type: "payment", moneyId: "usd", otherId: "rent", amount: major(10), fx: { base: "EGP", money: "USD", rate: 50 } }));
    expect(lines).toEqual([{ account: "rent", debit: major(500), credit: 0 }, { account: "usd", debit: 0, credit: major(500), fx: { currency: "USD", amount: major(10), rate: 50 } }]);
  });

  it("the balance of a dollar account counts dollars, and a reversal takes them back", () => {
    const inn = { debit: major(5000), credit: 0, fx: { currency: "USD", amount: major(100), rate: 50 } };
    const out = { debit: 0, credit: major(2600), fx: { currency: "USD", amount: major(50), rate: 52 } };
    expect(foreignBalance([inn, out], "USD", s)).toBe(major(50));
    expect(foreignBalance([inn, { ...inn, debit: 0, credit: inn.debit }], "USD", s)).toBe(0);
    // a line without dollars (an opening balance) is turned at today's rate
    expect(foreignBalance([{ debit: major(1000), credit: 0 }], "USD", s)).toBe(major(20));
  });

  it("vouchers in the system's currency are unchanged", () => {
    expect(voucherLines(v({}))).toEqual([{ account: "usd", debit: major(5000), credit: 0 }, { account: "till", debit: 0, credit: major(5000) }]);
  });
});

describe("daily rates and denominations", () => {
  it("turns the feed (1 base = x) into 1 unit = rate in the base", async () => {
    const { ratesFromFeed } = await import("./currency");
    expect(ratesFromFeed({ date: "2026-11-23", egp: { usd: 0.02, ils: 0.075, eur: 0 } }, "EGP", ["USD", "ILS", "EUR"])).toEqual({ USD: 50, ILS: 13.333333 });
    expect(ratesFromFeed(null, "EGP", ["USD"])).toEqual({});
  });
  it("falls back to the second source and refuses when both fail", async () => {
    const { fetchRates } = await import("./currency");
    let n = 0;
    const get = (async () => { n++; if (n === 1) return { ok: false, status: 503 }; return { ok: true, json: async () => ({ egp: { usd: 0.02 } }) }; }) as unknown as typeof fetch;
    expect(await fetchRates("EGP", ["USD"], get)).toEqual({ USD: 50 });
    const bad = (async () => { throw new Error("offline"); }) as unknown as typeof fetch;
    await expect(fetchRates("EGP", ["USD"], bad)).rejects.toThrow("offline");
  });
  it("is due once a Cairo day, only when on and there is another currency", async () => {
    const { ratesDue } = await import("./currency");
    const now = new Date("2026-11-23T10:00:00Z");
    expect(ratesDue({ currencies: [] }, now)).toBe(false);
    expect(ratesDue({ currencies: [{ code: "USD", rate: 50 }] }, now)).toBe(true);
    expect(ratesDue({ currencies: [{ code: "USD", rate: 50 }], ratesAuto: false }, now)).toBe(false);
    expect(ratesDue({ currencies: [{ code: "USD", rate: 50 }], ratesAt: "2026-11-23T06:00:00Z" }, now)).toBe(false);
    expect(ratesDue({ currencies: [{ code: "USD", rate: 50 }], ratesAt: "2026-11-22T21:30:00Z" }, now)).toBe(true); // 23:30 Cairo on the 22nd
  });
  it("counts cash with any denominations", async () => {
    const { denomsOf, parseDenom } = await import("./currency");
    const { countedTotal } = await import("./treasury");
    expect(denomsOf({})).toEqual([0.5, 1, 5, 10, 20, 50, 100, 200, 500]);
    expect(denomsOf({ denominations: [100, 0.25] })).toEqual([0.25, 100]);
    expect(parseDenom("0.5")).toBe(0.5); expect(parseDenom("0.125")).toBe(0); expect(parseDenom("x")).toBe(0);
    expect(countedTotal({ "500": 2, "0.5": 3 })).toBe(1001.5 * 100000);
  });
});
