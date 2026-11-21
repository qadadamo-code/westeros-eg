/** طلب توريد: who is told, sending moves nothing, scanning counts each sticker once, receiving moves the stock. */
import { describe, expect, it } from "vitest";
import { LocalAdapter } from "@/data/local/LocalAdapter";
import { makeDb } from "@/data/hooks";
import type { MfgBatch, MfgLists } from "@/data/types";
import { WESTEROS_BRANCH_ID, WESTEROS_RESTAURANT_ID } from "@/data/westeros/seed";
import { applyMoves, levelId } from "@/modules/inventory/stock";
import { buildTestKitchen, T } from "@/modules/production/testKitchen";
import { DEFAULT_LISTS } from "../lib";
import { memberCan } from "../perms";
import { matchScan, mineLine, parseSticker, pendingFor, receiveLines, sendLines, setRequestStatus, supplyCode, supplyLink } from "./supply";

const R = WESTEROS_RESTAURANT_ID;
const L = (s: string) => ({ ar: s, en: s });

describe("supply permissions", () => {
  const lists: MfgLists = {
    ...DEFAULT_LISTS,
    userTypes: [
      { id: "keeper", name: "أمين مخزن", from: 1, count: 10, role: "chef", perms: ["supply.handle"] },
      { id: "chef", name: "شيف", from: 11, count: 10, role: "chef", perms: [] },
      { id: "br", name: "مدير فرع", from: 21, count: 10, role: "manager", perms: ["supply.branch"] },
      { id: "old", name: "مدير قديم", from: 31, count: 10, role: "manager" },
    ],
    userTypeOf: { a: "keeper", a2: "keeper", b: "chef", c: "br", d: "old" },
  };
  const stores = {
    locations: [
      { id: "central", branchId: "main", keeperId: "a", active: true },
      { id: "dry", branchId: "main", keeperId: "a2", active: true },
      { id: "shop", branchId: "b2", keeperId: null, active: true },
    ],
    levels: [{ itemId: "sauce", locationId: "central", qty: 5 }, { itemId: "oil", locationId: "dry", qty: 2 }],
  };
  it("tells the keeper of the warehouse the product is stored in, when the role allows it", () => {
    const req = { branchId: "b2" };
    expect(mineLine({ id: "a", name: "", role: "chef" }, lists, { itemId: "sauce" }, req, stores)).toBe(true);
    expect(mineLine({ id: "a2", name: "", role: "chef" }, lists, { itemId: "sauce" }, req, stores)).toBe(false);
    expect(mineLine({ id: "a2", name: "", role: "chef" }, lists, { itemId: "oil" }, req, stores)).toBe(true);
    // keeps a warehouse but the role has no permission
    expect(mineLine({ id: "b", name: "", role: "chef" }, { ...lists, userTypeOf: { ...lists.userTypeOf, b: "chef" } }, { itemId: "sauce" }, req, { ...stores, locations: stores.locations.map((l) => (l.id === "central" ? { ...l, keeperId: "b" } : l)) })).toBe(false);
    // nobody holds it: every keeper outside the branch is told
    expect(mineLine({ id: "a2", name: "", role: "chef" }, lists, { itemId: "salt" }, req, stores)).toBe(true);
    expect(mineLine({ id: "x", name: "", role: "owner" }, lists, { itemId: "sauce" }, req, stores)).toBe(true);
    expect(memberCan({ id: "c", role: "manager" }, lists, "supply.branch")).toBe(true);
    expect(memberCan({ id: "a", role: "chef" }, lists, "supply.branch")).toBe(false);
    // a role saved before the permissions existed keeps what its level allowed
    expect(memberCan({ id: "d", role: "manager" }, lists, "supply.handle")).toBe(true);
  });
  it("tells the purchasing employees about open purchase requests", () => {
    const withBuyer: MfgLists = { ...lists, userTypes: [...lists.userTypes!, { id: "buy", name: "مشتريات", from: 41, count: 10, role: "chef", perms: ["purchase.handle"] }], userTypeOf: { ...lists.userTypeOf, e: "buy" } };
    const base = { kind: "purchase", lines: [], receivedAt: null, dueDate: "2026-11-21" } as const;
    const reqs = [{ ...base, id: "1", status: "new" }, { ...base, id: "2", status: "done", receivedAt: "x" }, { ...base, id: "3", status: "postponed", dueDate: "2026-11-30" }] as unknown as Parameters<typeof pendingFor>[2];
    expect(pendingFor({ id: "e", name: "", role: "chef" }, withBuyer, reqs, stores, "2026-11-21T10:00:00Z").toBuy.map((r) => r.id)).toEqual(["1"]);
    expect(pendingFor({ id: "a", name: "", role: "chef" }, withBuyer, reqs, stores).toBuy).toHaveLength(0);
  });
  it("reads the stickers", () => {
    expect(parseSticker("https://x.app/app/manufacturing/log?b=2-21102026%231(5)&p=M001&s=3")).toEqual({ type: "batch", number: "2-21102026#1(5)", product: "M001", index: 3 });
    expect(parseSticker("https://x.app/app/manufacturing/log?b=2-21102026%231(5)")).toEqual({ type: "batch", number: "2-21102026#1(5)", product: null, index: null });
    expect(parseSticker(supplyLink(12, "10005", 2))).toEqual({ type: "supply", request: 12, sku: "10005", index: 2 });
    expect(parseSticker(supplyCode(12, "10005", 2))).toEqual({ type: "supply", request: 12, sku: "10005", index: 2 });
    expect(parseSticker("hello")).toBeNull();
  });
});

describe("a supply request from asking to receiving", async () => {
  const repo = new LocalAdapter({ name: `supply-test-${Math.random()}`, memory: true, buildSeed: buildTestKitchen, now: () => new Date("2026-11-20T10:00:00Z") });
  await repo.ready();
  const db = makeDb(repo, R, WESTEROS_BRANCH_ID, null);
  const other = "branch-2";
  const branchStore = await db.insert("storageLocations", { branchId: other, name: L("مخزن الفرع"), kind: "store", sort: 9, active: true, type: null });
  const items = new Map((await db.list("stockItems")).map((i) => [i.id, i]));
  await applyMoves(db, [
    { itemId: T.mayo, locationId: T.fridge, branchId: WESTEROS_BRANCH_ID, kind: "receive", qty: 5000, value: 500, refType: "test", refId: "t", groupId: "t" },
    { itemId: T.sauceStock, locationId: T.fridge, branchId: WESTEROS_BRANCH_ID, kind: "receive", qty: 4000, value: 400, refType: "test", refId: "t", groupId: "t" },
  ], { items });
  const st = { locations: await db.list("storageLocations"), levels: await db.list("stockLevels") };
  const qty = async (loc: string, item: string) => (await db.get("stockLevels", levelId(R, loc, item)))?.qty ?? 0;
  const keeper = { id: "asker", name: "موظف الفرع", role: "kitchen" };
  const sender = { id: "sender", name: "أمين المخزن", role: "owner" };
  const req = await db.insert("stockRequests", {
    kind: "supply", number: 7, at: "2026-11-20T09:00:00.000Z", dueDate: "2026-11-21", branchLocationId: null, branchId: other,
    lines: [{ itemId: T.mayo, name: L("خامة صوص"), qty: 2.5, unit: "كيلو", kind: "raw" }, { itemId: T.sauceStock, name: L("صوص"), qty: 3, unit: "كيلو", kind: "made" }],
    keeperId: keeper.id, keeperName: keeper.name, status: "new", note: "", toLocationId: null, receivedAt: null, sentAt: null, history: [],
  });
  const batch = { number: "1-20112026#1(1)", status: "done", outputs: [{ productId: T.sauce, stockItemId: T.sauceStock, unit: "kg", weightKg: 4, count: null }] } as unknown as MfgBatch;
  const products = await db.list("mfgProducts");
  const ctx = { itemById: items, productByItem: new Map(products.map((p) => [p.stockItemId, { ...p, storageQty: p.id === T.sauce ? 1 : p.storageQty }])), batchByNumber: (n: string) => (n === batch.number ? batch : undefined) };

  it("tells the responsible employees, not the one who asked", async () => {
    const all = await db.list("stockRequests");
    expect(pendingFor(sender, null, all, st).toSend.map((r) => r.id)).toEqual([req.id]);
    expect(pendingFor(keeper, null, all, st).count).toBe(0);
  });

  it("postponing to a later day keeps it quiet until that day", async () => {
    const later = await setRequestStatus(db, req, sender, "postponed", "2026-11-23");
    expect(later.dueDate).toBe("2026-11-23");
    expect(pendingFor(sender, null, [later], st, "2026-11-21T10:00:00Z").count).toBe(0);
    expect(pendingFor(sender, null, [later], st, "2026-11-23T08:00:00Z").count).toBe(1);
  });

  it("sending records the quantities and moves nothing", async () => {
    const sent = await sendLines(db, req.id, sender, { [T.mayo]: { qty: 2.5, locationId: T.fridge }, [T.sauceStock]: { qty: 3, locationId: T.fridge } });
    expect(sent.status).toBe("sent");
    expect(sent.lines.map((l) => l.sentQty)).toEqual([2.5, 3]);
    expect(await qty(T.fridge, T.mayo)).toBe(5000);
    expect(pendingFor(keeper, null, [sent], st).toReceive).toHaveLength(1);
  });

  it("scans count each sticker once and receiving moves the stock", async () => {
    const r = (await db.get("stockRequests", req.id))!;
    const scans: Record<string, string[]> = {};
    const got: Record<string, number> = {};
    const scan = (text: string) => {
      const hit = matchScan(r, scans, got, text, ctx);
      if ("error" in hit) return hit.error;
      scans[hit.itemId] = [...(scans[hit.itemId] ?? []), hit.key];
      got[hit.itemId] = (got[hit.itemId] ?? 0) + hit.qty;
      return hit.qty;
    };
    expect(scan(supplyLink(7, "خامة صوص", 1))).toBe(1);
    expect(typeof scan(supplyLink(7, "خامة صوص", 1))).toBe("string"); // the same sticker again
    expect(scan(supplyLink(7, "خامة صوص", 2))).toBe(1);
    expect(scan(supplyLink(7, "خامة صوص", 3))).toBe(0.5);
    expect(typeof scan(supplyLink(8, "خامة صوص", 1))).toBe("string"); // another request
    expect(scan(`https://x/app/manufacturing/log?b=${encodeURIComponent(batch.number)}&p=M001&s=1`)).toBe(1);
    expect(scan(`https://x/app/manufacturing/log?b=${encodeURIComponent(batch.number)}&p=M001&s=2`)).toBe(1);
    expect(got).toEqual({ [T.mayo]: 2.5, [T.sauceStock]: 2 });
    const done = await receiveLines(db, req.id, keeper, {
      [T.mayo]: { qty: got[T.mayo], toLocationId: branchStore.id, scans: scans[T.mayo] },
      [T.sauceStock]: { qty: got[T.sauceStock], toLocationId: branchStore.id, scans: scans[T.sauceStock] },
    });
    expect(done.status).toBe("done");
    expect(done.receivedAt).toBeTruthy();
    expect(await qty(T.fridge, T.mayo)).toBe(2500);
    expect(await qty(branchStore.id, T.mayo)).toBe(2500);
    // 3 kg sent, 2 kg received: only the 2 kg move
    expect(await qty(T.fridge, T.sauceStock)).toBe(2000);
    expect(await qty(branchStore.id, T.sauceStock)).toBe(2000);
    await expect(receiveLines(db, req.id, keeper, { [T.mayo]: { qty: 1, toLocationId: branchStore.id, scans: ["x"] } })).rejects.toThrow();
  });
});
