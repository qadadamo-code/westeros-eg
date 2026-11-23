import { describe, expect, it } from "vitest";
import { calc } from "./NumCalc";

describe("calculator", () => {
  it("does × ÷ before + −", () => {
    expect(calc("12+3×4")).toBe(24);
    expect(calc("100/4-5")).toBe(20);
    expect(calc("-5+2")).toBe(-3);
    expect(calc("2.5*4")).toBe(10);
    expect(calc("١٠+٥")).toBe(15);
  });
  it("takes % of the number before it", () => {
    expect(calc("200+14%")).toBe(228);
    expect(calc("50%")).toBe(0.5);
  });
  it("ignores a trailing operator and refuses nonsense", () => {
    expect(calc("12+")).toBe(12);
    expect(calc("abc")).toBeNull();
    expect(calc("")).toBeNull();
    expect(calc("5÷0")).toBeNull();
  });
});
