/**
 * مراجعة شاشة المطبخ (Saqr 2026-11-27). In the interactive kitchen screen mode (not the printers mode), a line still
 * not ready `kitchenReviewMin` minutes after it was sent goes to «مراجعة»: it leaves the tickets and waits in the
 * review tab, next to the name of the supervising chef (the member signed in on the kitchen screen when it arrived).
 * A member with "kitchen.review" decides: جاهز (ready, goes on as usual), هدر (wasted: recorded in the stores) or
 * خرج (it went out). Pure rules first, then the writes.
 */
import type { Db } from "@/data/hooks";
import type { OrderItem } from "@/data/types";
import type { PrintSetup } from "@/data/productionTypes";
import { nowIso } from "@/lib/time";
import { syncOrders } from "./ops";
import { DEFAULT_REVIEW_MIN } from "./autoTime";

export { DEFAULT_REVIEW_MIN };
export type ReviewResult = NonNullable<OrderItem["reviewResult"]>;
export const REVIEW_RESULT: Record<ReviewResult, { ar: string; tone: "ok" | "danger" | "neutral" }> = {
  ready: { ar: "جاهز", tone: "ok" },
  waste: { ar: "هدر", tone: "danger" },
  out: { ar: "خرج", tone: "neutral" },
};

/** minutes after send before review; 0 = off. The printers mode has no review (its orders become ready by themselves). */
export function reviewMinOf(s: Pick<PrintSetup, "kitchenReviewMin" | "kitchenPrint">): number {
  if (s.kitchenPrint) return 0;
  const m = s.kitchenReviewMin ?? DEFAULT_REVIEW_MIN;
  return m > 0 ? m : 0;
}

/** waiting in «مراجعة» */
export const inReview = (i: Pick<OrderItem, "reviewAt" | "reviewResult">) => !!i.reviewAt && !i.reviewResult;

/** the lines whose time is up: still sent/preparing, not in review yet, sent `min` minutes ago or more */
export function dueForReview<T extends Pick<OrderItem, "status" | "reviewAt" | "firedAt" | "createdAt">>(items: T[], min: number, now: number): T[] {
  if (!min) return [];
  return items.filter((i) => (i.status === "sent" || i.status === "preparing") && !i.reviewAt && Date.parse(i.firedAt ?? i.createdAt) + min * 60_000 <= now);
}

export async function sendToReview(db: Db, items: Pick<OrderItem, "id">[], at = nowIso()) {
  await Promise.all(items.map((i) => db.update("orderItems", i.id, { reviewAt: at })));
}

/** الشيف المشرف: stamped once on the lines that arrive while a member is signed in on the kitchen screen */
export async function stampChef(db: Db, items: Pick<OrderItem, "id">[], chefId: string) {
  await Promise.all(items.map((i) => db.update("orderItems", i.id, { chefId })));
}

/** the reviewer's decision for some lines of one or more orders */
export async function resolveReview(db: Db, items: OrderItem[], result: ReviewResult, by: string | null) {
  const at = nowIso();
  const lines = items.filter(inReview);
  if (!lines.length) return 0;
  const mark = { reviewResult: result, reviewedBy: by, reviewedAt: at };
  await Promise.all(
    lines.map((i) =>
      db.update("orderItems", i.id, result === "ready" ? { ...mark, status: "ready", readyAt: at } : { ...mark, status: "served", servedAt: at }),
    ),
  );
  // هدر: the ingredients deducted at send move from sale to waste in the stores
  if (result === "waste") {
    const { onLineVoided } = await import("@/modules/inventory/deduct");
    for (const i of lines) await onLineVoided(db, { id: i.id, name: i.name, voidReason: "مراجعة المطبخ" }, { waste: true, reason: "kds_review" });
  }
  await syncOrders(db, [...new Set(lines.map((i) => i.orderId))]);
  void db.audit(`kitchen.review.${result}`, "orderItems", null, { items: lines.map((i) => i.id) });
  return lines.length;
}

/* ───────── days (Cairo; the night until 5 AM belongs to the day before, like إقفال اليوم) ───────── */

const DAY_STARTS_AT = 5;
function cairoOffsetMin(d: Date): number {
  const v = new Intl.DateTimeFormat("en-US", { timeZone: "Africa/Cairo", timeZoneName: "shortOffset" }).formatToParts(d).find((p) => p.type === "timeZoneName")?.value ?? "GMT+2";
  const m = /GMT([+-])(\d{1,2})(?::(\d{2}))?/.exec(v);
  return m ? (m[1] === "-" ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3] ?? 0)) : 120;
}
/** the business day ("YYYY-MM-DD") a moment belongs to */
export function businessDayOf(at: number | string = Date.now()): string {
  const t = typeof at === "string" ? Date.parse(at) : at;
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Cairo" }).format(new Date(t - DAY_STARTS_AT * 3_600_000));
}
export const todayCairo = () => businessDayOf();
/** the ISO moments a business day starts and ends at */
export function dayRange(day: string): { from: string; to: string } {
  const midnightUtc = Date.parse(`${day}T00:00:00Z`);
  const from = midnightUtc - cairoOffsetMin(new Date(midnightUtc + 12 * 3_600_000)) * 60_000 + DAY_STARTS_AT * 3_600_000;
  return { from: new Date(from).toISOString(), to: new Date(from + 24 * 3_600_000).toISOString() };
}
/** "14:05" in Cairo */
export const hm = (iso: string) => new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Cairo", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso));
