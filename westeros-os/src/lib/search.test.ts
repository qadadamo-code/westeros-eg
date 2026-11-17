import { describe, expect, it } from "vitest";
import { searchFilter, searchScore } from "./search";

describe("search", () => {
  it("finds by any part and by words in any order", () => {
    expect(searchScore("لحم", "برجر لحم بقري")).toBeGreaterThan(0);
    expect(searchScore("بقري برجر", "برجر لحم بقري")).toBeGreaterThan(0);
    expect(searchScore("دجاج", "برجر لحم بقري")).toBe(0);
  });
  it("treats spelling variants and Arabic digits alike", () => {
    expect(searchScore("اضافه", "إضافة جبنة")).toBeGreaterThan(0);
    expect(searchScore("١٢", "صنف 12")).toBeGreaterThan(0);
  });
  it("finds by the first letters of the words", () => {
    expect(searchScore("بل", "برجر لحم")).toBeGreaterThan(0);
    expect(searchScore("ب ل ب", "برجر لحم بقري")).toBeGreaterThan(0);
    expect(searchScore("بل", "برجر اللحم")).toBeGreaterThan(0);
    expect(searchScore("cbb", "Classic Beef Burger")).toBeGreaterThan(0);
  });
  it("finds a shortened word", () => {
    expect(searchScore("بطس", "بطاطس مقلية")).toBeGreaterThan(0);
    expect(searchScore("mzrl", "Mozzarella")).toBeGreaterThan(0);
    expect(searchScore("طس", "بطاطس")).toBeGreaterThan(0); // a part of the name
    expect(searchScore("سطب", "بطاطس")).toBe(0);
  });
  it("puts the closest first", () => {
    const rows = ["صوص برجر", "برجر لحم", "بطاطس بالجبنة ريش"];
    expect(searchFilter(rows, "بر", (r) => r)[0]).toBe("برجر لحم");
    expect(searchFilter(rows, "", (r) => r)).toEqual(rows);
  });
});
