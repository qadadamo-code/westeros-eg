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
import { handlesKinds, matchScan, parseSticker, pendingFor, receiveLines, sendLines, setRequestStatus, supplyCode, supplyLink } from "./supply";

const R = WESTEROS_RESTAURANT_ID;
const L = (s: string) => ({ ar: s, en: s });

describe("supply permissions", () => {
  const lists: MfgLists = {
    ...DEFAULT_LISTS,
    userTypes: [
      { id: "raw", name: "أمين مخزن", from: 1, count: 10, role: "chef", perms: ["supply.raw"] },
      { id: "made", name: "شيف مطبخ مركزي", from: 11, count: 10, role: "chef", perms: ["supply.made"] },
      { id: "br", name: "مدير فرع", from: 21, count: 10, role: "manager", perms: ["supply.branch"] },
      { id: "old", name: "مدير قديم", from: 31, count: 10, role: "manager" },
    ],
    userTypeOf: { a: "raw", b: "made", c: "br", d: "old" },
  };
  it("reads the kinds and the branch choice from the role", () => {
    expect(handlesKinds({ id: "a", name: "", role: "chef" }, lists)).toEqual(["raw"]);
    expect(handlesKinds({ id: "b", name: "", role: "chef" }, lists)).toEqual(["made"]);
    expect(handlesKinds({ id: "c", name: "", role: "manager" }, lists)).toEqual([]);
    expect(memberCan({ id: "c", role: "manager" }, lists, "supply.branch")).toBe(true);
    expect(memberCan({ id: "a", role: "chef" }, lists, "supply.branch")).toBe(false);
    // a role saved before the permissions existed keeps what its level allowed
    expect(memberCan({ id: "d", role: "manager" }, lists, "supply.raw")).toBe(true);
    expect(memberCan({ id: "x", role: "owner" }, lists, "supply.made")).toBe(true);
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
    expect(pendingFor(sender, null, all, items).toSend.map((r) => r.id)).toEqual([req.id]);
    expect(pendingFor(keeper, null, all, items).count).toBe(0);
  });

  it("postponing to a later day keeps it quiet until that day", async () => {
    const later = await setRequestStatus(db, req, sender, "postponed", "2026-11-23");
    expect(later.dueDate).toBe("2026-11-23");
    expect(pendingFor(sender, null, [later], items, "2026-11-21T10:00:00Z").count).toBe(0);
    expect(pendingFor(sender, null, [later], items, "2026-11-23T08:00:00Z").count).toBe(1);
  });

  it("sending records the quantities and moves nothing", async () => {
    const sent = await sendLines(db, req.id, sender, { [T.mayo]: { qty: 2.5, locationId: T.fridge }, [T.sauceStock]: { qty: 3, locationId: T.fridge } });
    expect(sent.status).toBe("sent");
    expect(sent.lines.map((l) => l.sentQty)).toEqual([2.5, 3]);
    expect(await qty(T.fridge, T.mayo)).toBe(5000);
    expect(pendingFor(keeper, null, [sent], items).toReceive).toHaveLength(1);
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
