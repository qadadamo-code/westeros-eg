/** أسعار الصرف اليومية: once a day the other currencies take today's rate from a free public feed (no key, no cost). */
import { useEffect } from "react";
import type { Db } from "@/data/hooks";
import type { FinSettingsData } from "@/data/financeTypes";
import { baseOf, fetchRates, ratesDue } from "./currency";
import { saveSettings } from "./ops";

let running: Promise<number> | null = null;
let triedDay = "";

/** Takes today's rates now. Returns how many currencies got a new rate. Throws when the feed can't be reached. */
export async function updateRates(db: Db, s: Partial<FinSettingsData>): Promise<number> {
  const base = baseOf(s);
  const list = (s.currencies ?? []).filter((c) => c.code !== base);
  if (!list.length) return 0;
  const got = await fetchRates(base, list.map((c) => c.code));
  const currencies = list.map((c) => (got[c.code] ? { ...c, rate: got[c.code] } : c));
  await saveSettings(db, { currencies, ratesAt: new Date().toISOString() });
  return Object.keys(got).length;
}

/** Mounted on the finance screens: when today's rates are due, take them once, quietly. */
export function useAutoRates(db: Db, s: Partial<FinSettingsData>, ready: boolean) {
  const due = ready && ratesDue(s);
  useEffect(() => {
    if (!due || running) return;
    const day = new Date().toDateString();
    if (triedDay === day) return; // one try a day per open app, even when the feed is down
    triedDay = day;
    running = updateRates(db, s).catch(() => 0).finally(() => { running = null; });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [due]);
}
