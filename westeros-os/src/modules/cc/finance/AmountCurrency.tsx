/**
 * عملة المبلغ: an amount in an operation may be typed in any currency set in ثوابت النظام; it starts in the currency the operation is kept in
 * (the system's own, or the money account's), and another one asks for its rate and turns the amount into that currency.
 */
import { useState } from "react";
import type { Units } from "@/lib/money";
import { Input, Select } from "@/ui";
import { baseOf, currencyName, currencySymbol, parseRate, rateOf, rateText } from "./currency";
import { fmt } from "./ui";
import type { Fin } from "./useFinance";

export interface PaidIn { currency: string; amount: Units; rate: number }

/**
 * @param target the currency the operation is kept in
 * @param targetRate 1 target in the system's currency (1 for the system's own)
 */
export function useAmountCurrency(fin: Fin, target: string) {
  const s = fin.settings;
  const base = baseOf(s);
  const codes = [base, ...(s.currencies ?? []).map((c) => c.code).filter((c) => c !== base)];
  const [picked, setPicked] = useState("");
  const [rateT, setRateT] = useState("");
  const cur = picked && codes.includes(picked) ? picked : target;
  const on = cur !== target;
  const rate = parseRate(rateT);
  const sym = (c: string) => (c === base ? currencySymbol(c) : c);
  const pick = (c: string) => { setPicked(c); setRateT(rateText(c === base ? 1 : rateOf(c, s))); };
  /** typed amount → the operation's currency; 0 while the rate is missing */
  const convert = (amount: Units, targetRate = 1): Units => (!on ? amount : rate > 0 && targetRate > 0 ? Math.round((amount * rate) / targetRate) : 0);
  const paidIn = (amount: Units): PaidIn | undefined => (on && rate > 0 ? { currency: cur, amount, rate } : undefined);
  const problem = on && !(rate > 0) ? `اكتب سعر ${cur}` : "";
  /** the currency select, shown only when another currency is set */
  const select = codes.length > 1 ? (
    <Select label="عملة المبلغ" value={cur} onChange={(e) => pick(e.target.value)}
      options={codes.map((c) => ({ value: c, label: `${currencyName(c)} (${c})` }))} />
  ) : null;
  /** the rate and what it comes to, shown only when the amount is in another currency */
  const box = (amount: Units, targetRate = 1) => on ? (
    <div className="grid gap-3 rounded-xl border border-brass/40 bg-brass-soft/40 p-3 sm:col-span-2 sm:grid-cols-2">
      <Input label={`سعر الصرف: 1 ${cur} يساوي كام ${sym(base)}`} dir="ltr" inputMode="decimal" value={rateT} onChange={(e) => setRateT(e.target.value)}
        hint={rateOf(cur, s) ? `سعر اليوم المحفوظ: ${rateText(rateOf(cur, s))}` : "أول مرة بهذه العملة"} />
      <div className="grid gap-1.5">
        <span className="text-[13.5px] font-semibold text-ink-2">{`القيمة النهائية (${sym(target)})`}</span>
        <div className="num flex h-11 items-center rounded-xl border border-line bg-surface px-3 text-[15px] font-bold" dir="ltr">{convert(amount, targetRate) ? fmt(convert(amount, targetRate)) : "—"}</div>
      </div>
      <p className="text-[12.5px] text-muted sm:col-span-2">{`المبلغ مكتوب بـ${currencyName(cur)}، وبيتسجل في الحسابات بـ${currencyName(target)} بسعر الصرف ده.`}</p>
    </div>
  ) : null;
  return { cur, on, sym, convert, paidIn, problem, select, box };
}
