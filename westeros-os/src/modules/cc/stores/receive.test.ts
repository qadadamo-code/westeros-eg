/** Finishing a request moves stock once, into (or out of) the warehouse chosen for each line. */
import { describe, expect, it } from "vitest";
import { LocalAdapter } from "@/data/local/LocalAdapter";
import { makeDb } from "@/data/hooks";
import { WESTEROS_BRANCH_ID, WESTEROS_RESTAURANT_ID } from "@/data/westeros/seed";
import { levelId } from "@/modules/inventory/stock";
import { buildTestKitchen, T } from "@/modules/production/testKitchen";
import { finishRequest } from "./receive";

const R = WESTEROS_RESTAURANT_ID;

describe("finishing a request", async () => {
  const repo = new LocalAdapter({ name: `req-test-${Math.random()}`, memory: true, buildSeed: buildTestKitchen, now: () => new Date("2026-11-16T10:00:00Z") });
  await repo.ready();
  const db = makeDb(repo, R, WESTEROS_BRANCH_ID, null);
  const locs = (await db.list("storageLocations")).filter((l) => l.id !== T.fridge);
  const [store, branch] = locs;
  const L = (s: string) => ({ ar: s, en: s });
  const qty = async (loc: string, item: string) => (await db.get("stockLevels", levelId(R, loc, item)))?.qty ?? 0;
  const request = (kind: "purchase" | "supply", number: number, toLocationId: string | null) =>
    db.insert("stockRequests", { kind, number, at: "2026-11-16T10:00:00.000Z", dueDate: "2026-11-17", branchLocationId: kind === "supply" ? branch.id : null, lines: [{ itemId: T.mayo, name: L("مايونيز"), qty: 3, unit: "كيلو" }], keeperId: null, keeperName: "", status: "in_progress", note: "", toLocationId, receivedAt: null });

  it("a purchase enters the warehouse chosen for the line, once", async () => {
    const r = await request("purchase", 1, T.fridge);
    const done = await finishRequest(db, r.id, { [T.mayo]: store.id });
    expect(done.status).toBe("done");
    expect(done.receivedAt).toBeTruthy();
    expect(done.lines[0].locationId).toBe(store.id);
    expect(await qty(store.id, T.mayo)).toBe(3000);
    expect(await qty(T.fridge, T.mayo)).toBe(0);
    await expect(finishRequest(db, r.id, {})).rejects.toThrow();
    expect(await qty(store.id, T.mayo)).toBe(3000);
  });

  it("falls back to the request's warehouse", async () => {
    const r = await request("purchase", 2, T.fridge);
    await finishRequest(db, r.id, {});
    expect(await qty(T.fridge, T.mayo)).toBe(3000);
  });

  it("a supply leaves the warehouse and enters the branch, and refuses a shortfall", async () => {
    const r = await request("supply", 1, store.id);
    await finishRequest(db, r.id, {});
    expect(await qty(store.id, T.mayo)).toBe(0);
    expect(await qty(branch.id, T.mayo)).toBe(3000);
    const again = await request("supply", 2, store.id);
    await expect(finishRequest(db, again.id, {})).rejects.toThrow();
    expect((await db.get("stockRequests", again.id))?.status).toBe("in_progress");
  });

  it("a supply that names the branch enters the branch warehouse chosen for the line", async () => {
    const other = await db.insert("branches", { name: L("فرع 2"), slug: "b2", address: L(""), phone: "", isDefault: false, etaBranchCode: "0", active: true } as never);
    const dest = await db.insert("storageLocations", { branchId: other.id, name: L("مخزن فرع 2"), kind: "store", sort: 9, active: true });
    const r = await db.insert("stockRequests", { kind: "supply", number: 3, at: "2026-11-16T10:00:00.000Z", dueDate: "2026-11-17", branchLocationId: null, branchId: other.id, lines: [{ itemId: T.mayo, name: L("مايونيز"), qty: 2, unit: "كيلو" }], keeperId: null, keeperName: "", status: "in_progress", note: "", toLocationId: null, receivedAt: null });
    // the destination must be a warehouse of the asking branch
    await expect(finishRequest(db, r.id, { [T.mayo]: branch.id }, { [T.mayo]: store.id })).rejects.toThrow();
    const done = await finishRequest(db, r.id, { [T.mayo]: branch.id }, { [T.mayo]: dest.id });
    expect(done.lines[0].toLocationId).toBe(dest.id);
    expect(await qty(branch.id, T.mayo)).toBe(1000);
    expect(await qty(dest.id, T.mayo)).toBe(2000);
  });
});
