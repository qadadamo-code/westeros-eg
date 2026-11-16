import { describe, expect, it } from "vitest";
import type { ChangeRow } from "@/data/repo";
import { changedFields, fieldsText, recordName, tableLabel, undoable } from "./describe";

const row = (p: Partial<ChangeRow>): ChangeRow => ({ id: 1, table: "menu_items", rowId: "a", op: "U", before: null, after: null, source: "app", undoneAt: null, createdAt: "2026-11-16T10:00:00Z", ...p });

describe("history descriptions", () => {
  it("names tables and records", () => {
    expect(tableLabel("menu_items", "ar")).toBe("صنف منيو");
    expect(tableLabel("some_table", "en")).toBe("some table");
    expect(recordName({ before: null, after: { name: { ar: "كلاسيك", en: "Classic" } } }, "ar")).toBe("كلاسيك");
    expect(recordName({ before: { number: 7 }, after: null }, "ar")).toBe("#7");
    expect(recordName({ before: null, after: { x: 1 } }, "ar")).toBe("");
  });
  it("lists the fields that changed", () => {
    const c = row({ before: { price: 1, name: "a", updated_at: "1", z: 1 }, after: { price: 2, name: "a", updated_at: "2", z: 2 } });
    expect(changedFields(c)).toEqual(["price", "z"]);
    expect(fieldsText(["price", "z"], "ar")).toBe("السعر و1 غيرها");
    expect(fieldsText(["z"], "ar")).toBe("1 حقل");
    expect(changedFields(row({ op: "I", after: { a: 1 } }))).toEqual([]);
  });
  it("only the newest change of a record can be undone", () => {
    const older = row({ id: 1 });
    const newer = row({ id: 2 });
    const other = row({ id: 3, rowId: "b" });
    const all = [other, newer, older];
    expect(undoable(older, all)).toBe(false);
    expect(undoable(newer, all)).toBe(true);
    expect(undoable(row({ id: 4, rowId: "c", undoneAt: "x" }), all)).toBe(false);
    expect(undoable(row({ id: 5, rowId: "d", source: "restore" }), all)).toBe(false);
  });
});
