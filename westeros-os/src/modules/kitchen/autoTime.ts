/**
 * نظام طابعات المطبخ (Saqr 2026-11-26): no one taps the kitchen screen, so each order gets a time when it enters the
 * kitchen and is marked ready by itself when the time is up.
 *   the first 3 orders in the kitchen take 12 minutes each; each order past them takes 3 minutes more than the one
 *   before (4th 15, 5th 18 …); every distinct menu category in the order adds 1 minute.
 * Pure.
 */
import type { KitchenTime } from "@/data/types";

export const DEFAULT_KITCHEN_TIME: KitchenTime = { baseMin: 12, baseOrders: 3, perOrder: 3, perCategory: 1 };

export const kitchenTimeOf = (t: Partial<KitchenTime> | null | undefined): KitchenTime => ({ ...DEFAULT_KITCHEN_TIME, ...(t ?? {}) });

/** minutes for an order that is number `position` in the kitchen (1 = nothing else cooking) with `categories` distinct categories */
export function orderMinutes(position: number, categories: number, t: KitchenTime = DEFAULT_KITCHEN_TIME): number {
  return t.baseMin + Math.max(0, position - t.baseOrders) * t.perOrder + Math.max(0, categories) * t.perCategory;
}
