import { describe, expect, it } from "vitest";
import { DEFAULT_LINKS, DEFAULT_TREE } from "./chart";
import { accountProblem, balanceOf, deleteProblem, indexChart, LEVEL_LEN, movement, moveProblem, nextCode, rollup, seedRows, usageOf } from "./tree";

const rows = seedRows(new Set()).map((r) => ({ ...r, id: `id-${r.code}` }));
const ix = indexChart(rows);

describe("the ready chart", () => {
  it("has six roots and unique codes whose length follows the level", () => {
    expect(ix.kids(null).map((r) => r.code)).toEqual(["1", "2", "3", "4", "5", "6"]);
    expect(new Set(DEFAULT_TREE.map((x) => x.code)).size).toBe(DEFAULT_TREE.length);
    for (const r of rows) expect(r.code.length).toBe(LEVEL_LEN[ix.level(r.code) - 1]);
  });
  it("only leaves take entries, and every link points at an account", () => {
    for (const r of rows) expect(r.postable).toBe(ix.kids(r.code).length === 0);
    for (const code of Object.values(DEFAULT_LINKS)) expect(ix.byCode.has(code)).toBe(true);
  });
  it("adds only what is missing", () => {
    expect(seedRows(new Set(rows.map((r) => r.code)))).toEqual([]);
    expect(seedRows(new Set(rows.filter((r) => r.code !== "6405").map((r) => r.code))).map((r) => r.code)).toEqual(["6405"]);
  });
});

describe("codes", () => {
  it("gives the next serial under a parent at the child's width", () => {
    expect(nextCode("1102", rows)).toBe("110201");
    expect(nextCode("110102", rows)).toBe("11010201");
    expect(nextCode("62", rows)).toBe("6207");
    expect(nextCode("11", rows)).toBe("1112");
  });
  it("refuses a sixth level", () => {
    const deep = [...rows, { ...rows[0], id: "x", code: "11010201", parentCode: "110102", name: { ar: "خزينة فرع", en: "" } }];
    expect(() => nextCode("11010201", deep)).toThrow();
  });
});

describe("saving, deleting, moving", () => {
  it("catches a used code, a repeated name and a wrong first digit", () => {
    expect(accountProblem({ code: "6201", nameAr: "جديد", parentCode: "62" }, rows)).toMatch("مستخدم");
    expect(accountProblem({ code: "6299", nameAr: "إيجار", parentCode: "62" }, rows)).toMatch("نفس الاسم");
    expect(accountProblem({ code: "7299", nameAr: "جديد", parentCode: "62" }, rows)).toMatch("أول رقم");
    expect(accountProblem({ code: "6299", nameAr: "جديد", parentCode: "62" }, rows)).toBe("");
    const own = rows.find((r) => r.code === "6201")!;
    expect(accountProblem({ id: own.id, code: "6201", nameAr: "إيجار", parentCode: "62" }, rows)).toBe("");
  });
  it("deletes only a free, non-system leaf", () => {
    const acc = (code: string) => ix.byCode.get(code)!;
    expect(deleteProblem(acc("1"), { lines: 0, children: 2 })).toMatch("الرئيسية");
    expect(deleteProblem(acc("6201"), { lines: 0, children: 0 })).toMatch("نظام");
    expect(deleteProblem(acc("110901"), { lines: 3, children: 0 })).toMatch("حركات");
    expect(deleteProblem(acc("110901"), { lines: 0, children: 0 })).toBe("");
    expect(usageOf(acc("110901"), rows, [{ lines: [{ account: "id-110901", debit: 5, credit: 0 }, { account: "id-110101", debit: 0, credit: 5 }] }])).toEqual({ lines: 1, children: 0 });
  });
  it("moves inside the same type and never under its own branch", () => {
    const acc = (code: string) => ix.byCode.get(code)!;
    expect(moveProblem(acc("110901"), acc("62"), rows)).toMatch("نفس النوع");
    expect(moveProblem(acc("1109"), acc("110901"), rows)).toMatch("فروعه");
    expect(moveProblem(acc("110901"), acc("1108"), rows)).toBe("");
  });
});

describe("balances", () => {
  const entries = [
    { status: "posted" as const, date: "2026-01-10", branchId: "b1", lines: [{ account: "id-6201", debit: 1000, credit: 0 }, { account: "id-110101", debit: 0, credit: 1000 }] },
    { status: "posted" as const, date: "2026-02-10", branchId: "b2", lines: [{ account: "id-6202", debit: 300, credit: 0 }, { account: "id-110101", debit: 0, credit: 300 }] },
    { status: "draft" as const, date: "2026-02-11", branchId: "b1", lines: [{ account: "id-6201", debit: 9, credit: 0 }, { account: "id-110101", debit: 0, credit: 9 }] },
  ];
  it("rolls posted movement up the tree in each account's direction", () => {
    const all = rollup(rows, movement(entries));
    expect(balanceOf("expense", all.get("62"))).toBe(1300);
    expect(balanceOf("expense", all.get("6"))).toBe(1300);
    expect(balanceOf("asset", all.get("1"))).toBe(-1300);
  });
  it("filters by period and branch", () => {
    expect(balanceOf("expense", rollup(rows, movement(entries, { to: "2026-01-31" })).get("6"))).toBe(1000);
    expect(balanceOf("expense", rollup(rows, movement(entries, { branchId: "b2" })).get("6"))).toBe(300);
  });
});
