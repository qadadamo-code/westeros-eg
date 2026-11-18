import { describe, expect, it } from "vitest";
import { major } from "@/lib/money";
import { batchNumber, calcBurger, calcChicken, calcPortion, calcWeight, cairoDay, expiryOf } from "./calc";

const EGP = (n: number) => major(n);
const line = (weightG: number, egp: number) => ({ weightG, cost: EGP(egp) });

describe("Cost Control: تصنيع يخزن بالوزن", () => {
  // the document's example: 8 ingredients = 4,452 g, net 4.45 kg, total 622 EGP → 140 EGP/kg
  const r = calcWeight({ lines: [line(2000, 300), line(850, 100), line(1250, 150), line(120, 30), line(110, 20), line(10, 5), line(2, 1), line(110, 10)], packaging: [{ weightG: 0, cost: EGP(6) }], netKg: 4.45 });
  it("gross weight is the sum of the recipe, packaging adds no weight", () => expect(r.grossKg).toBe(4.452));
  it("waste = net − gross, in grams: negative when weight was lost", () => expect(r.wasteG).toBe(-2));
  it("total includes the storage packaging", () => expect(r.total).toBe(EGP(622)));
  it("price per kilo = total ÷ net weight", () => expect(Math.round(r.perKg / EGP(1))).toBe(140));
});

describe("Cost Control: تصنيع بالحصة", () => {
  // salad box example: 2,805 g of ingredients, 200 g portion → 14 expected, 14 made, 112 EGP → 8 EGP each
  const r = calcPortion({ lines: [line(1000, 40), line(200, 20), line(50, 5), line(15, 3), line(10, 2), line(30, 2), line(1500, 26)], packaging: [{ weightG: 0, cost: EGP(14) }], portionG: 200, netCount: 14 });
  it("expected count = ingredient weight ÷ portion", () => expect(r.expected).toBe(14));
  it("waste in pieces", () => expect(r.wastePcs).toBe(0));
  it("price per piece = total ÷ net count", () => expect(r.perPc).toBe(EGP(8)));
  it("a short batch shows the missing pieces", () => expect(calcPortion({ lines: [line(2800, 100)], packaging: [], portionG: 200, netCount: 12 }).wastePcs).toBe(-2));
});

describe("Cost Control: منتجات الدجاج", () => {
  const r = calcChicken({
    chickenKg: 20,
    chickenPerKg: EGP(225),
    outputs: [
      { mode: "post_count", weightKg: 5, count: 71, portionG: 70, lines: [line(650, 80)], packaging: [{ weightG: 0, cost: EGP(5) }] },
      { mode: "weight", weightKg: 2, count: 0, portionG: 0, lines: [], packaging: [] },
      { mode: "pre_count", weightKg: 12, count: 80, portionG: 160, lines: [line(400, 60)], packaging: [] },
    ],
  });
  it("debris = chicken weight − everything that came out", () => {
    expect(r.netKg).toBe(19);
    expect(r.debrisKg).toBe(1);
    expect(r.debrisBp).toBe(500);
  });
  it("scale difference per way of counting", () => {
    expect(r.outputs[0].scaleDiffG).toBe(71 * 70 - 5000); // متبل بعد العد
    expect(r.outputs[1].scaleDiffG).toBe(0); // بالوزن
    expect(r.outputs[2].scaleDiffG).toBe(80 * 160 - 12000 - 400); // متبل قبل العد: minus the marinade
  });
  it("each product carries its recipe plus its share of the chicken, trimmings included", () => {
    // each row uses its own scale difference
    expect(r.outputs[1].total).toBe(Math.round(EGP(225) * 2 * (20 / 19)));
    expect(r.outputs[0].total).toBe(Math.round(EGP(85) + EGP(225) * 5 * (20 / (19 + r.outputs[0].scaleDiffG / 1000))));
  });
  it("priced per kilo when made by weight, per piece when counted", () => {
    expect(r.outputs[1].per).toBe("kg");
    expect(r.outputs[1].unitCost).toBe(Math.round(r.outputs[1].total / 2));
    expect(r.outputs[0].per).toBe("pc");
    expect(r.outputs[0].unitCost).toBe(Math.round(r.outputs[0].total / 71));
  });
});

describe("Cost Control: the document's chicken batch (20 kg, 21/10/2026)", () => {
  const r = calcChicken({
    chickenKg: 20,
    chickenPerKg: EGP(225),
    outputs: [
      { mode: "post_count", weightKg: 5, count: 71, portionG: 70, lines: [line(650, 0)], packaging: [] }, // دجاج ستيك
      { mode: "weight", weightKg: 2, count: 0, portionG: 0, lines: [], packaging: [] }, // دجاج فرم
      // كوردن بلو: 375 g marinade, then 940 g and 235 g of other ingredients
      { mode: "pre_count", weightKg: 5, count: 33, portionG: 160, lines: [{ ...line(375, 0), marinade: true }, line(940, 0), line(235, 0)], packaging: [] },
      { mode: "post_count", weightKg: 4, count: 33, portionG: 120, lines: [line(400, 0)], packaging: [] }, // كرسبي
      { mode: "weight", weightKg: 3, count: 0, portionG: 0, lines: [line(501, 0)], packaging: [] }, // بايتس
    ],
  });
  it("debris 1 kg, 5%", () => {
    expect(r.debrisKg).toBe(1);
    expect(r.debrisBp).toBe(500);
  });
  it("scale differences −30, 0, −95, −40, 0: pre-count subtracts the marinade only", () => {
    expect(r.outputs.map((o) => o.scaleDiffG)).toEqual([-30, 0, -95, -40, 0]);
  });
  it("دجاج فرم costs 473.7, 236.8 a kilo", () => {
    expect(Math.round(r.outputs[1].total / 10_000) / 10).toBe(473.7);
    expect(Math.round(r.outputs[1].unitCost / 10_000) / 10).toBe(236.8);
  });
  it("a recipe with no marinade item counts all of it as the marinade", () => {
    expect(calcChicken({ chickenKg: 10, chickenPerKg: 0, outputs: [{ mode: "pre_count", weightKg: 5, count: 33, portionG: 160, lines: [line(375, 0)], packaging: [] }] }).outputs[0].scaleDiffG).toBe(-95);
  });
});

describe("Cost Control: تصنيع البرجر", () => {
  // the document's example: 25 kg of topside, 24 kg trimmed, fat suggested at 300 g/kg
  const beef = calcBurger({
    kind: "beef", meatKg: 25, netKg: 24, fatKg: 7, meatPerKg: EGP(328), fatPerKg: EGP(120), fatGramsPerKg: 300,
    lines: [line(200, 90), line(217, 10)], packaging: [{ weightG: 0, cost: EGP(40) }], products: [{ count: 200, portionG: 150 }, { count: 17, portionG: 80 }],
  });
  it("debris and its share of the meat", () => {
    expect(beef.debrisKg).toBe(1);
    expect(beef.debrisBp).toBe(400);
  });
  it("suggested fat follows the cut", () => expect(beef.suggestedFatKg).toBe(7.2));
  it("scale difference = product weight − meat − fat − spices", () => expect(beef.scaleDiffG).toBe(200 * 150 + 17 * 80 - 24000 - 7000 - 417));
  it("price per kilo spreads the whole cost over what was produced", () => {
    const total = EGP(328) * 25 + EGP(120) * 7 + EGP(100) + EGP(40);
    expect(beef.total).toBe(total);
    expect(beef.perKg).toBe(Math.round(total / ((200 * 150 + 17 * 80) / 1000)));
  });
  it("each size costs its portion of a kilo", () => {
    expect(beef.products[0].unitCost).toBe(Math.round(beef.perKg * 0.15));
    expect(beef.products[1].unitCost).toBe(Math.round(beef.perKg * 0.08));
  });
  it("chicken burgers have no fat and no debris", () => {
    const c = calcBurger({ kind: "chicken", meatKg: 0, netKg: 10, fatKg: 3, meatPerKg: EGP(240), fatPerKg: EGP(120), fatGramsPerKg: 0, lines: [line(300, 30)], packaging: [], products: [{ count: 68, portionG: 150 }] });
    expect(c.debrisKg).toBe(0);
    expect(c.scaleDiffG).toBe(68 * 150 - 10000 - 300);
    expect(c.total).toBe(EGP(2400) + EGP(30));
  });
});

describe("batch number and dates", () => {
  it("category-date#run(chef)", () => expect(batchNumber({ categoryCode: 2, day: "2026-10-21", seq: 1, chefCode: 5 })).toBe("2-21102026#1(5)"));
  it("the business day is Cairo's", () => expect(cairoDay("2026-10-20T22:30:00Z")).toBe("2026-10-21"));
  it("expiry = production + shelf life", () => expect(expiryOf("2026-10-21T10:00:00.000Z", 3)).toBe("2026-10-24T10:00:00.000Z"));
});
