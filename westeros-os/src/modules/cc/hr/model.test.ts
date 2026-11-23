import { describe, expect, it } from "vitest";
import type { HrDoc } from "@/data/hrDocTypes";
import { DEFAULT_SETTINGS, K, evalTotal, gratuityOf, leaveUsed, mayDecide, nextPenalty, quizScore, requestState, serviceYears, spanDays, expiries, turnover, dayWage } from "./model";

const doc = (p: Partial<HrDoc>): HrDoc => ({ id: Math.random().toString(), createdAt: "", updatedAt: "", restaurantId: "r", kind: "", code: "", name: "", memberId: null, branchId: null, status: "active", date: null, data: {}, ...p });

describe("hr rules", () => {
  it("warning ladder climbs inside the reset window and restarts after it", () => {
    const late = DEFAULT_SETTINGS.violations[0];
    expect(nextPenalty(late, [], "2026-11-23")).toEqual({ level: 1, penalty: { action: "verbal", days: 0 } });
    const past = [{ date: "2026-10-01", violationId: "late", status: "active" }, { date: "2026-11-01", violationId: "late", status: "active" }, { date: "2026-11-02", violationId: "late", status: "cancelled" }];
    expect(nextPenalty(late, past, "2026-11-23").penalty).toEqual({ action: "deduct", days: 0.5 });
    expect(nextPenalty(late, [{ date: "2025-01-01", violationId: "late", status: "active" }], "2026-11-23").level).toBe(1);
    const many = Array.from({ length: 9 }, (_, i) => ({ date: `2026-11-${String(i + 1).padStart(2, "0")}`, violationId: "late", status: "active" }));
    expect(nextPenalty(late, many, "2026-11-23").penalty).toEqual({ action: "deduct", days: 3 });
  });

  it("evaluation, quiz, gratuity, wages", () => {
    expect(evalTotal(DEFAULT_SETTINGS.criteria, {})).toBe(0);
    expect(evalTotal(DEFAULT_SETTINGS.criteria, Object.fromEntries(DEFAULT_SETTINGS.criteria.map((c) => [c.id, 5])))).toBe(100);
    expect(evalTotal([{ id: "a", name: "a", weight: 1 }, { id: "b", name: "b", weight: 3 }], { a: 5, b: 0 })).toBe(25);
    expect(quizScore([{ id: "1", q: "", options: ["a", "b"], answer: 1 }, { id: "2", q: "", options: ["a", "b"], answer: 0 }], [1, 1])).toBe(50);
    expect(gratuityOf(DEFAULT_SETTINGS.gratuity, 2, 6000)).toBe(6000);
    expect(gratuityOf(DEFAULT_SETTINGS.gratuity, 7, 6000)).toBe(2.5 * 6000 + 2 * 6000);
    expect(dayWage(9000, 30)).toBe(300);
    expect(Math.floor(serviceYears("2020-01-01", "2026-01-01"))).toBe(6);
    expect(spanDays("2026-11-01", "2026-11-03")).toBe(3);
    expect(turnover(2, 10, 10)).toBe(20);
  });

  it("leave balance counts approved leave of the year", () => {
    const reqs = [
      doc({ kind: K.request, memberId: "m", status: "approved", data: { typeId: "leave", from: "2026-03-01", to: "2026-03-05" } }),
      doc({ kind: K.request, memberId: "m", status: "pending", data: { typeId: "leave", from: "2026-04-01", to: "2026-04-02" } }),
      doc({ kind: K.request, memberId: "x", status: "approved", data: { typeId: "leave", from: "2026-04-01", to: "2026-04-02" } }),
    ];
    expect(leaveUsed(reqs, DEFAULT_SETTINGS.requestTypes, "m", "2026").get("annual")).toBe(5);
  });

  it("approval chain", () => {
    const type = DEFAULT_SETTINGS.requestTypes[0];
    const dec = (step: number, ok: boolean) => doc({ kind: K.decision, data: { step, ok } });
    expect(requestState(type, [])).toEqual({ step: 0, rejected: false, done: false });
    expect(requestState(type, [dec(0, true)])).toEqual({ step: 1, rejected: false, done: false });
    expect(requestState(type, [dec(1, true), dec(0, true)]).done).toBe(true);
    expect(requestState(type, [dec(0, false)]).rejected).toBe(true);
    const c = { directOf: (m: string) => (m === "emp" ? "boss" : null), headOf: () => null, roleOf: (m: string) => (m === "acc" ? "accountant" : null), isHr: (m: string) => m === "hr" };
    expect(mayDecide("direct", "emp", { id: "boss", role: "manager" }, c)).toBe(true);
    expect(mayDecide("direct", "emp", { id: "hr", role: "manager" }, c)).toBe(false);
    expect(mayDecide("direct", "new", { id: "hr", role: "manager" }, c)).toBe(true);
    expect(mayDecide("hr", "hr", { id: "hr", role: "manager" }, c)).toBe(false);
    expect(mayDecide("role:accountant", "emp", { id: "acc", role: "manager" }, c)).toBe(true);
    expect(mayDecide("hr", "emp", { id: "o", role: "owner" }, c)).toBe(true);
  });

  it("expiry alerts", () => {
    const e = expiries([{ memberId: "a", what: "عقد", date: "2026-12-01" }, { memberId: "b", what: "شهادة", date: "2027-06-01" }, { memberId: "c", what: "x", date: null }, { memberId: "d", what: "y", date: "2026-11-01" }], "2026-11-23", 30);
    expect(e.map((x) => x.memberId)).toEqual(["d", "a"]);
  });
});
