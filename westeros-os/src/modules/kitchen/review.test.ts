import { describe, expect, it } from "vitest";
import { businessDayOf, dayRange, dueForReview, inReview, reviewMinOf } from "./review";

const T0 = Date.parse("2026-11-27T10:00:00Z");
const line = (p: Partial<{ status: string; reviewAt: string | null; firedAt: string | null; createdAt: string }>) =>
  ({ status: "sent", reviewAt: null, firedAt: new Date(T0).toISOString(), createdAt: new Date(T0).toISOString(), ...p }) as never;

describe("kitchen review", () => {
  it("goes to review only after the minutes from send", () => {
    expect(dueForReview([line({})], 30, T0 + 29 * 60_000)).toHaveLength(0);
    expect(dueForReview([line({})], 30, T0 + 30 * 60_000)).toHaveLength(1);
    expect(dueForReview([line({ status: "ready" })], 30, T0 + 60 * 60_000)).toHaveLength(0);
    expect(dueForReview([line({ reviewAt: "x" })], 30, T0 + 60 * 60_000)).toHaveLength(0);
    expect(dueForReview([line({})], 0, T0 + 600 * 60_000)).toHaveLength(0);
  });
  it("stuck lines without a send time use their creation time", () => {
    expect(dueForReview([line({ firedAt: null })], 30, T0 + 31 * 60_000)).toHaveLength(1);
  });
  it("is off in the printers mode, 30 minutes by default", () => {
    expect(reviewMinOf({ kitchenPrint: true, kitchenReviewMin: 10 })).toBe(0);
    expect(reviewMinOf({ kitchenPrint: false })).toBe(30);
    expect(reviewMinOf({ kitchenPrint: false, kitchenReviewMin: 0 })).toBe(0);
  });
  it("in review until decided", () => {
    expect(inReview({ reviewAt: "x", reviewResult: null })).toBe(true);
    expect(inReview({ reviewAt: "x", reviewResult: "waste" })).toBe(false);
  });
  it("the night until 5 AM Cairo belongs to the day before", () => {
    expect(businessDayOf("2026-11-27T01:30:00Z")).toBe("2026-11-26"); // 03:30 Cairo
    expect(businessDayOf("2026-11-27T04:00:00Z")).toBe("2026-11-27"); // 06:00 Cairo
    expect(dayRange("2026-11-27")).toEqual({ from: "2026-11-27T03:00:00.000Z", to: "2026-11-28T03:00:00.000Z" });
  });
});
