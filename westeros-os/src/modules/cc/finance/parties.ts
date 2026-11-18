/** حساب لكل طرف: a supplier, an employee or a fixed asset gets its own account under the linked one, opened the first time it is needed. */
import type { Db } from "@/data/hooks";
import type { FinAccount } from "@/data/financeTypes";
import { JournalError } from "./journal";
import { journalContext } from "./journalOps";
import { indexChart, MAX_LEVEL, nextCode } from "./tree";

export async function partyAccount(db: Db, a: { key: string; linkType: string; linkId: string; name: string; branchId?: string | null; kind?: FinAccount["kind"] }): Promise<FinAccount> {
  const j = await journalContext(db);
  const had = j.accounts.find((x) => x.linkType === a.linkType && x.linkId === a.linkId);
  if (had) {
    if (had.name.ar !== a.name.trim() && a.name.trim()) return db.update("finAccounts", had.id, { name: { ...had.name, ar: a.name.trim() } });
    return had;
  }
  const parent = j.accounts.find((x) => x.code === j.settings.links[a.key]);
  if (!parent) throw new JournalError(`ربط الحسابات ناقص: لا يوجد حساب للبند "${a.key}"`);
  if (indexChart(j.accounts).level(parent.code) >= MAX_LEVEL) return parent;
  const fields = { type: parent.type, parentCode: parent.code, postable: true, kind: a.kind ?? parent.kind, cashflow: parent.cashflow, requireCentre: false, allowManual: true, system: null, alertMin: null, alertMax: null, active: true, note: "" };
  let accounts = j.accounts;
  if (parent.postable) {
    // what was booked on the general account before it had children moves to a general child, so nothing is lost
    const used = j.entries.filter((e) => e.lines.some((l) => l.account === parent.id));
    if (used.length) {
      const general = await db.insert("finAccounts", { ...fields, code: nextCode(parent.code, accounts), name: { ar: `${parent.name.ar}: عام`, en: "" }, branchId: null, linkType: "general", linkId: parent.code });
      for (const e of used) await db.update("finEntries", e.id, { lines: e.lines.map((l) => (l.account === parent.id ? { ...l, account: general.id } : l)) });
      await db.audit("finance.split", "finAccounts", parent.id, { into: general.code, entries: used.length });
      accounts = [...accounts, general];
    }
    await db.update("finAccounts", parent.id, { postable: false });
  }
  return db.insert("finAccounts", { ...fields, code: nextCode(parent.code, accounts), name: { ar: a.name.trim(), en: "" }, branchId: a.branchId ?? null, linkType: a.linkType, linkId: a.linkId });
}
