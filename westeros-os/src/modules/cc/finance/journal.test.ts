import { describe, expect, it } from "vitest";
import type { FinAccount, FinEntry } from "@/data/financeTypes";
import { dayBefore, entryProblem, fiscalYear, nextNo, reversed, statement, trialBalance } from "./journal";
import { seedRows } from "./tree";

const accounts = seedRows(new Set()).map((r) => ({ ...r, id: `id-${r.code}`, createdAt: "", updatedAt: "", restaurantId: "r" })) as FinAccount[];
const byId = new Map(accounts.map((a) => [a.id, a]));
const id = (code: string) => `id-${code}`;
const L = (code: string, debit: number, credit: number) => ({ account: id(code), debit, credit });
const open = { periods: {} };
let n = 0;
const E = (date: string, lines: ReturnType<typeof L>[], o: Partial<FinEntry> = {}): FinEntry => ({
  id: `e${++n}`, createdAt: `2026-01-01T00:00:${String(n).padStart(2, "0")}Z`, updatedAt: "", restaurantId: "r", no: n, year: 2026, date, kind: "manual", status: "posted", memo: "", lines, branchId: null,
  sourceType: null, sourceId: null, reverses: null, reversedBy: null, attachments: [], createdBy: null, createdByName: "", approvedBy: null, postedAt: null, reason: "", meta: {}, ...o,
});

describe("a valid entry", () => {
  it("balances, on leaves that are active", () => {
    expect(entryProblem({ date: "2026-03-01", lines: [L("6201", 100, 0), L("110101", 0, 100)] }, byId, open)).toBe("");
    expect(entryProblem({ date: "2026-03-01", lines: [L("6201", 100, 0), L("110101", 0, 90)] }, byId, open)).toMatch("غير متوازن");
    expect(entryProblem({ date: "2026-03-01", lines: [L("62", 100, 0), L("110101", 0, 100)] }, byId, open)).toMatch("تجميعي");
    expect(entryProblem({ date: "2026-03-01", lines: [L("6201", 100, 0)] }, byId, open)).toMatch("سطرين");
    expect(entryProblem({ date: "2026-03-01", lines: [{ account: id("6201"), debit: 100, credit: 100 }, L("110101", 0, 0)] }, byId, open)).toMatch(/سطرين|معا/);
  });
  it("a person cannot post on a system-only account, the system can", () => {
    const e = { date: "2026-03-01", lines: [L("110601", 100, 0), L("110101", 0, 100)] };
    expect(entryProblem(e, byId, open, { manual: true })).toMatch("السيستم فقط");
    expect(entryProblem(e, byId, open)).toBe("");
  });
  it("a closed month takes nothing", () => {
    expect(entryProblem({ date: "2026-03-15", lines: [L("6201", 100, 0), L("110101", 0, 100)] }, byId, { periods: { "2026-03": "closed" } })).toMatch("مقفول");
  });
  it("needs a cost centre where the account asks for one", () => {
    const need = new Map(byId);
    need.set(id("6201"), { ...byId.get(id("6201"))!, requireCentre: true });
    expect(entryProblem({ date: "2026-03-01", lines: [L("6201", 100, 0), L("110101", 0, 100)] }, need, open)).toMatch("مركز تكلفة");
  });
});

describe("numbers and years", () => {
  it("counts inside the year", () => {
    expect(nextNo([{ no: 4, year: 2026 }, { no: 9, year: 2025 }], 2026)).toBe(5);
    expect(nextNo([], 2026)).toBe(1);
    expect(fiscalYear("2026-03-10", 7)).toBe(2025);
    expect(fiscalYear("2026-07-01", 7)).toBe(2026);
    expect(dayBefore("2026-03-01")).toBe("2026-02-28");
  });
});

describe("statement and trial balance", () => {
  const entries = [
    E("2026-01-05", [L("110101", 5000, 0), L("3101", 0, 5000)]),
    E("2026-02-03", [L("6201", 1000, 0), L("110101", 0, 1000)]),
    E("2026-02-20", [L("6202", 300, 0), L("110101", 0, 300)]),
    E("2026-02-21", [L("6202", 50, 0), L("110101", 0, 50)], { status: "draft" }),
  ];
  it("opens with what came before the period and runs the balance", () => {
    const s = statement(byId.get(id("110101"))!, entries, { from: "2026-02-01", to: "2026-02-28" });
    expect(s.opening).toBe(5000);
    expect(s.rows.map((r) => r.balance)).toEqual([4000, 3700]);
    expect([s.debit, s.credit, s.closing]).toEqual([0, 1300, 3700]);
  });
  it("a credit-natured account grows on its credit side", () => {
    expect(statement(byId.get(id("3101"))!, entries).closing).toBe(5000);
  });
  it("the trial balance balances and parents sum their children", () => {
    const t = trialBalance(accounts, entries, { from: "2026-02-01", to: "2026-02-28", level: 2, hideZero: true });
    expect(t.balanced).toBe(true);
    const row = (code: string) => t.rows.find((r) => r.account.code === code)!;
    expect([row("11").openDebit, row("11").moveCredit, row("11").closeDebit]).toEqual([5000, 1300, 3700]);
    expect(row("62").moveDebit).toBe(1300);
    expect([t.sum.closeDebit, t.sum.closeCredit]).toEqual([5000, 5000]);
  });
  it("a reversal mirrors the lines", () => {
    expect(reversed([L("6201", 100, 0)])).toEqual([L("6201", 0, 100)]);
  });
});
