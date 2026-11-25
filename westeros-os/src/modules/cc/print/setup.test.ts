import { describe, expect, it } from "vitest";
import { EMPTY_PRINT, printersFor, printOf } from "./setup";

describe("printers per category", () => {
  const p = { ...EMPTY_PRINT, printers: [{ id: "a", name: "مطبخ", paper: "80" as const }, { id: "b", name: "بار", paper: "58" as const }], kitchenDefaultPrinterId: "a", categoryPrinters: { burgers: ["a", "b"], drinks: ["b"], gone: ["zz"] } };
  it("a category can have more than one printer", () => expect(printersFor(p, "burgers")).toEqual(["a", "b"]));
  it("falls back to the default kitchen printer", () => {
    expect(printersFor(p, "sides")).toEqual(["a"]);
    expect(printersFor(p, "gone")).toEqual(["a"]);
  });
  it("fills defaults", () => expect(printOf(null).kitchen.fontSize).toBe(15));
});
