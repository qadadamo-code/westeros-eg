import { describe, expect, it } from "vitest";
import { groupsOf, mayTalk, radioOn } from "./access";

const owner = { id: "o", role: "owner" };
const chef = { id: "c", role: "chef" };
const waiter = { id: "w", role: "waiter" };
const r = { access: { c: { on: true, peers: ["o"] }, w: { on: true, peers: "all" as const } }, groups: [{ id: "g", name: "المطبخ", memberIds: ["c", "w", "x"] }] };

describe("radio access", () => {
  it("owner always on; others only when ticked", () => {
    expect(radioOn(r, owner)).toBe(true);
    expect(radioOn(r, chef)).toBe(true);
    expect(radioOn(r, { id: "x", role: "kitchen" })).toBe(false);
  });
  it("direct talk follows the sender's list", () => {
    expect(mayTalk(r, chef, owner)).toBe(true);
    expect(mayTalk(r, chef, waiter)).toBe(false);
    expect(mayTalk(r, waiter, chef)).toBe(true);
    expect(mayTalk(r, owner, waiter)).toBe(true);
    expect(mayTalk(r, waiter, { id: "x", role: "kitchen" })).toBe(false);
  });
  it("groups need the member allowed", () => {
    expect(groupsOf(r, chef).map((g) => g.id)).toEqual(["g"]);
    expect(groupsOf(r, { id: "x", role: "kitchen" })).toEqual([]);
  });
});
