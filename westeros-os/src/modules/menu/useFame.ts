/** الأكثر طلباً والتريند والمبيعات لكل صنف، من طلبات آخر 30 يوم (الصنف لوحده + جوه أصناف تانية). */
import { useMemo } from "react";
import { useLive } from "@/data/hooks";
import { fameOf, soldUnits, type Fame, type Sold } from "./sold";

const DAYS = 30;

export function useFame(): { fame: Map<string, Fame>; sold: Map<string, Sold> } {
  // a day's resolution keeps the query stable across renders
  const since = useMemo(() => new Date(new Date().setHours(0, 0, 0, 0) - DAYS * 86_400_000).toISOString(), []);
  const lines = useLive("orderItems", { gte: { createdAt: since } }).data;
  return useMemo(() => ({ fame: fameOf(lines, new Date(), DAYS), sold: soldUnits(lines) }), [lines]);
}

export const FAME_LABEL: Record<Fame, string> = { top: "الأكثر طلباً", trend: "تريند" };
