import { describe, expect, it } from "vitest";
import { loadDefaultChart } from "./ops";
import { submitEntry } from "./journalOps";
import { accumulated, assetOf, bookValue, chargeOf, depreciationDue, disposeAsset, dueCharges, runDepreciation, saveAsset, schedule, type AssetData } from "./assets";
import { financeDb } from "./testDb";
import { movement, rollup } from "./tree";

const boss = { id: null, name: "م", canApprove: true };
const base: Omit<AssetData, "posted" | "buyEntryId" | "disposal"> = { typeKey: "asset.kitchen", cost: 1_000_000, salvage: 100_000, lifeMonths: 7, method: "straight", ratePct: 0, bought: "2026-08-10", start: "2026-09", opening: 0, centreId: null, serial: "", place: "", note: "" };

describe("depreciation rules", () => {
  it("straight line ends exactly on the scrap value", () => {
    const a = { ...base, posted: [], buyEntryId: null, disposal: null };
    const s = schedule(a);
    expect(s.length).toBe(7);
    expect(s.reduce((x, r) => x + r.amount, 0)).toBe(900_000);
    expect(s[6].book).toBe(100_000);
    expect(chargeOf(a, 900_000)).toBe(0);
  });
  it("declining balance takes a share of the book value and stops at the scrap value", () => {
    const a = { ...base, method: "declining" as const, ratePct: 120, posted: [], buyEntryId: null, disposal: null };
    const d = dueCharges(a, "2026-11");
    expect(d.map((x) => x.amount)).toEqual([100_000, 90_000, 81_000]);
    const all = schedule(a);
    expect(all[all.length - 1].book).toBe(100_000);
  });
});

describe("fixed assets", async () => {
  const db = await financeDb();
  await loadDefaultChart(db);
  const acc = Object.fromEntries((await db.list("finAccounts")).map((a) => [a.code, a.id]));
  await submitEntry(db, null, { date: "2026-08-01", memo: "cap", branchId: null, lines: [{ account: acc["110101"], debit: 5_000_000, credit: 0 }, { account: acc["3101"], debit: 0, credit: 5_000_000 }] }, boss);
  const balance = async (code: string) => { const t = rollup(await db.list("finAccounts"), movement(await db.list("finEntries"))).get(code) ?? { debit: 0, credit: 0 }; return t.debit - t.credit; };
  let doc = await saveAsset(db, null, { name: "فرن", branchId: null, data: base, paidFrom: acc["110101"] });

  it("buying posts the asset; a run posts one entry per month, once", async () => {
    expect(await balance("1201")).toBe(1_000_000);
    expect(depreciationDue(await db.list("finDocs"), "2026-10").length).toBe(2);
    const made = await runDepreciation(db, "2026-12", "2026-11-18");
    expect(made.map((e) => [e.date, e.sourceId])).toEqual([["2026-09-30", "2026-09"], ["2026-10-31", "2026-10"], ["2026-11-18", "2026-11"]]);
    expect((await runDepreciation(db, "2026-11", "2026-11-18")).length).toBe(0);
    doc = (await db.get("finDocs", doc.id))!;
    expect(accumulated(assetOf(doc))).toBe(385_713);
    expect(await balance("1290")).toBe(-385_713);
    expect(await balance("6501")).toBe(385_713);
    expect((await db.list("finAccounts")).find((a) => a.linkType === "asset-acc")?.parentCode).toBe("1290");
    await expect(saveAsset(db, doc, { name: "فرن", branchId: null, data: { ...base, cost: 2_000_000 } })).rejects.toThrow("لا تتعدل");
  });

  it("selling above book value is a gain and takes the asset out", async () => {
    await expect(disposeAsset(db, doc.id, { date: "2027-02-01", proceeds: 0, moneyId: null, note: "" }, boss)).rejects.toThrow("إهلاك الشهور السابقة");
    const book = bookValue(assetOf(doc));
    const sold = await disposeAsset(db, doc.id, { date: "2026-12-05", proceeds: book + 50_000, moneyId: acc["110101"], note: "" }, boss);
    expect(sold.status).toBe("disposed");
    expect(await balance("1201")).toBe(0);
    expect(await balance("1290")).toBe(0);
    expect(await balance("4204")).toBe(-50_000);
    expect(depreciationDue(await db.list("finDocs"), "2027-06").length).toBe(0);
  });
});
