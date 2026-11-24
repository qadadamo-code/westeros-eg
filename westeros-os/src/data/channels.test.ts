import { describe, expect, it } from "vitest";
import { channelFor, defaultChannels, modeOf, soldOn, soldPatch } from "./channels";

describe("قنوات البيع لكل صنف", () => {
  const [dine, take, , talabat] = defaultChannels(null);
  it("an item switched off for a channel is gone from it only", () => {
    const item = { offChannels: [talabat.id], hiddenOn: [] };
    expect(soldOn(item, talabat)).toBe(false);
    expect(soldOn(item, dine)).toBe(true);
    expect(soldOn(soldPatch(item, talabat, true), talabat)).toBe(true);
  });
  it("switching on lifts an old kind-wide hide", () => {
    const item = { offChannels: [], hiddenOn: ["dine_in" as const] };
    expect(soldOn(item, dine)).toBe(false);
    expect(soldPatch(item, dine, true)).toEqual({ offChannels: [], hiddenOn: [] });
  });
  it("aggregators take orders as pick-up and are found by id", () => {
    expect(talabat.kind).toBe("aggregator");
    expect(modeOf("aggregator")).toBe("takeaway");
    expect(channelFor({ salesChannels: [], tax: null as never }, { channelId: "talabat", mode: "takeaway" })?.id).toBe("talabat");
    expect(channelFor({ salesChannels: [], tax: null as never }, { channelId: null, mode: "takeaway" })?.id).toBe(take.id);
  });
});
