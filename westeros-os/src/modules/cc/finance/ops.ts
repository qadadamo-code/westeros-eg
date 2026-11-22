/** What the chart screen writes: accounts are saved, stopped, moved, merged, deleted, loaded from the ready tree or from Excel. */
import type { Db } from "@/data/hooks";
import type { FinAccount, FinSettings, FinSettingsData } from "@/data/financeTypes";
import type { ImportPlan } from "../catalog/Import";
import { sheetCode } from "../xlsx";
import { DEFAULT_LINKS } from "./chart";
import { accountProblem, ChartError, deleteProblem, indexChart, moveProblem, nextCode, seedRows, typeOfCode, usageOf } from "./tree";

export const DEFAULT_SETTINGS: FinSettingsData = {
  yearStartMonth: 1, startDate: null, periods: {}, links: DEFAULT_LINKS, costing: "last", approvalLimit: null, kitchenAllocation: "none", kitchenShares: {}, rules: [], stockByWarehouse: true, standardCosts: {}, transitDays: 3, currency: "EGP", currencies: [],
};
export const settingsOf = (row: FinSettings | null | undefined): FinSettingsData => ({ ...DEFAULT_SETTINGS, ...(row?.data ?? {}), links: { ...DEFAULT_LINKS, ...(row?.data?.links ?? {}) } });

export async function saveSettings(db: Db, patch: Partial<FinSettingsData>) {
  const [row] = await db.list("finSettings");
  if (row) return db.update("finSettings", row.id, { data: { ...row.data, ...patch } });
  return db.insert("finSettings", { data: patch });
}

export type AccountFields = Pick<FinAccount, "code" | "name" | "parentCode" | "postable" | "kind" | "cashflow" | "branchId" | "requireCentre" | "allowManual" | "alertMin" | "alertMax" | "active" | "note"> & { currency?: string | null };

/** Adds or edits an account. A leaf that gets its first child becomes a parent, which it can only do while it has no lines. */
export async function saveAccount(db: Db, row: FinAccount | null, f: AccountFields): Promise<FinAccount> {
  const accounts = await db.list("finAccounts");
  const entries = await db.list("finEntries");
  const problem = accountProblem({ id: row?.id, code: f.code, nameAr: f.name.ar, parentCode: f.parentCode }, accounts);
  if (problem) throw new ChartError(problem);
  const parent = accounts.find((x) => x.code === f.parentCode) ?? null;
  const type = parent?.type ?? typeOfCode(f.code)!;
  if (row) {
    const used = usageOf(row, accounts, entries);
    if (used.lines && !f.postable) throw new ChartError("الحساب عليه حركات، لا يتحول إلى تجميعي قبل نقل حركاته لحساب فرعي");
    if (used.children && f.postable) throw new ChartError("الحساب تحته حسابات فرعية، يبقى تجميعي");
    if (row.system && !f.active) throw new ChartError("حساب نظام لا يتوقف");
    if (used.lines && f.currency !== undefined && (f.currency || null) !== (row.currency || null)) throw new ChartError("الحساب عليه حركات، عملته ثابتة");
    const saved = await db.update("finAccounts", row.id, { ...f, name: { ar: f.name.ar.trim(), en: f.name.en.trim() }, code: f.code.trim(), type });
    // the children name their parent by its code
    if (f.code !== row.code) for (const k of accounts.filter((x) => x.parentCode === row.code)) await db.update("finAccounts", k.id, { parentCode: f.code });
    if (f.code !== row.code) await relink(db, row.code, f.code);
    return saved;
  }
  if (parent?.postable) {
    if (usageOf(parent, accounts, entries).lines) throw new ChartError(`الحساب "${parent.name.ar}" عليه حركات. انقل حركاته أولا أو اختر أب آخر.`);
    await db.update("finAccounts", parent.id, { postable: false });
  }
  return db.insert("finAccounts", { ...f, name: { ar: f.name.ar.trim(), en: f.name.en.trim() }, code: f.code.trim(), type, system: null, linkType: null, linkId: null });
}

/** ربط الحسابات follows a code that changed */
async function relink(db: Db, from: string, to: string) {
  const [row] = await db.list("finSettings");
  const links = row?.data?.links;
  if (!row || !links || !Object.values(links).includes(from)) return;
  await db.update("finSettings", row.id, { data: { ...row.data, links: Object.fromEntries(Object.entries(links).map(([k, v]) => [k, v === from ? to : v])) } });
}

export async function removeAccount(db: Db, row: FinAccount) {
  const accounts = await db.list("finAccounts");
  const problem = deleteProblem(row, usageOf(row, accounts, await db.list("finEntries")));
  if (problem) throw new ChartError(problem);
  await db.remove("finAccounts", row.id);
  // a parent left without children takes entries again
  const parent = accounts.find((x) => x.code === row.parentCode);
  if (parent && parent.parentCode && !accounts.some((x) => x.parentCode === parent.code && x.id !== row.id)) await db.update("finAccounts", parent.id, { postable: true });
}

/** نقل: the account and everything under it go under another parent of the same type and take codes there; lines follow by id. */
export async function moveAccount(db: Db, row: FinAccount, toParentCode: string) {
  const accounts = await db.list("finAccounts");
  const to = accounts.find((x) => x.code === toParentCode);
  const problem = moveProblem(row, to, accounts);
  if (problem || !to) throw new ChartError(problem || "اختر الحساب الأب الجديد");
  if (to.postable) {
    if (usageOf(to, accounts, await db.list("finEntries")).lines) throw new ChartError(`الحساب "${to.name.ar}" عليه حركات، لا يصبح أب`);
    await db.update("finAccounts", to.id, { postable: false });
  }
  const ix = indexChart(accounts);
  const rest = accounts.filter((x) => x.id !== row.id && !ix.descendants(row.code).some((d) => d.id === x.id));
  const taken = [...rest];
  const recode = async (acc: FinAccount, parentCode: string) => {
    const code = nextCode(parentCode, taken);
    const kids = ix.kids(acc.code);
    taken.push({ ...acc, code, parentCode });
    await db.update("finAccounts", acc.id, { code, parentCode });
    await relink(db, acc.code, code);
    for (const k of kids) await recode(k, code);
  };
  await recode(row, to.code);
  const old = accounts.find((x) => x.code === row.parentCode);
  if (old && old.parentCode && !accounts.some((x) => x.parentCode === old.code && x.id !== row.id)) await db.update("finAccounts", old.id, { postable: true });
}

/** دمج: every line of `from` moves to `into`, then `from` is deleted. Both are leaves of the same type. */
export async function mergeAccounts(db: Db, from: FinAccount, into: FinAccount): Promise<number> {
  if (from.id === into.id) throw new ChartError("اختر حسابين مختلفين");
  if (from.type !== into.type) throw new ChartError("الدمج يكون بين حسابين من نفس النوع");
  if (!from.postable || !into.postable) throw new ChartError("الدمج يكون بين حسابين نهائيين");
  if (from.system) throw new ChartError("حساب نظام لا يدمج في غيره. ادمج الحساب الآخر فيه.");
  if (!into.active) throw new ChartError("الحساب المدموج فيه موقوف");
  const entries = (await db.list("finEntries")).filter((e) => e.lines.some((l) => l.account === from.id));
  for (const e of entries) await db.update("finEntries", e.id, { lines: e.lines.map((l) => (l.account === from.id ? { ...l, account: into.id } : l)) });
  await db.remove("finAccounts", from.id);
  await db.audit("finance.merge", "finAccounts", into.id, { from: from.code, fromName: from.name.ar, into: into.code, entries: entries.length });
  return entries.length;
}

/** تحميل الشجرة الجاهزة: adds the codes that are missing, never touches an account that exists. */
export async function loadDefaultChart(db: Db): Promise<number> {
  const existing = await db.list("finAccounts");
  const rows = seedRows(new Set(existing.map((x) => x.code)));
  const have = new Map(existing.map((x) => [x.code, x]));
  // parents first, and only under a parent that exists and can be one
  let n = 0;
  for (const r of rows) {
    if (r.parentCode && !have.has(r.parentCode)) continue;
    const row = await db.insert("finAccounts", r);
    have.set(row.code, row);
    n++;
  }
  return n;
}

const IMPORT_KEYS = { code: "كود الحساب", name: "اسم الحساب", en: "الاسم بالإنجليزية", parent: "كود الحساب الأب", note: "ملاحظات" } as const;
export const IMPORT_FIELDS = [
  { key: IMPORT_KEYS.code, aliases: ["الكود", "كود", "code", "رقم الحساب"] },
  { key: IMPORT_KEYS.name, aliases: ["الاسم", "اسم", "name", "الحساب"] },
  { key: IMPORT_KEYS.en, aliases: ["english", "name en", "الاسم الانجليزي"] },
  { key: IMPORT_KEYS.parent, aliases: ["الأب", "الحساب الأب", "parent", "الحساب الرئيسي"] },
  { key: IMPORT_KEYS.note, aliases: ["ملاحظة", "note", "notes"] },
];

/** The parent a code sits under when the file names none: the longest shorter code that exists (file or system). */
function parentByCode(code: string, known: Set<string>): string | null {
  for (let n = code.length - 1; n >= 1; n--) if (known.has(code.slice(0, n))) return code.slice(0, n);
  return null;
}

/** استيراد من اكسل: matched by code (an existing code is renamed, a new code is added). `dry` only reports. */
export async function importAccounts(db: Db, sheet: Record<string, string>[], dry: boolean): Promise<ImportPlan> {
  const existing = await db.list("finAccounts");
  const byCode = new Map(existing.map((x) => [x.code, x]));
  const plan: ImportPlan = { added: [], updated: [], skipped: 0 };
  const rows = sheet.map((r) => ({ code: sheetCode(r[IMPORT_KEYS.code]), name: (r[IMPORT_KEYS.name] ?? "").trim(), en: (r[IMPORT_KEYS.en] ?? "").trim(), parent: sheetCode(r[IMPORT_KEYS.parent]), note: (r[IMPORT_KEYS.note] ?? "").trim() }))
    .filter((r) => r.code || r.name)
    .sort((p, q) => p.code.length - q.code.length || p.code.localeCompare(q.code));
  const known = new Set([...byCode.keys(), ...rows.map((r) => r.code)]);
  const seen = new Set<string>();
  for (const r of rows) {
    const cur = byCode.get(r.code);
    if (!/^\d+$/.test(r.code) || !typeOfCode(r.code) || seen.has(r.code) || (!cur && !r.name)) { plan.skipped++; continue; }
    seen.add(r.code);
    if (cur) {
      const patch: Partial<FinAccount> = {};
      if (r.name && r.name !== cur.name.ar) patch.name = { ar: r.name, en: r.en || cur.name.en };
      else if (r.en && r.en !== cur.name.en) patch.name = { ar: cur.name.ar, en: r.en };
      if (r.note && r.note !== cur.note) patch.note = r.note;
      if (!Object.keys(patch).length) continue;
      plan.updated.push({ code: r.code, name: r.name || cur.name.ar });
      if (!dry) await db.update("finAccounts", cur.id, patch);
      continue;
    }
    const parentCode = r.code.length === 1 ? null : (r.parent && known.has(r.parent) ? r.parent : parentByCode(r.code, known));
    if (r.code.length > 1 && (!parentCode || parentCode[0] !== r.code[0])) { plan.skipped++; continue; }
    plan.added.push({ code: r.code, name: r.name });
    if (dry) continue;
    const parent = parentCode ? byCode.get(parentCode) : null;
    if (parent?.postable) byCode.set(parent.code, await db.update("finAccounts", parent.id, { postable: false }));
    const row = await db.insert("finAccounts", {
      code: r.code, name: { ar: r.name, en: r.en }, parentCode, type: typeOfCode(r.code)!, postable: true, kind: parent?.kind ?? "general",
      cashflow: parent?.cashflow ?? "operating", branchId: null, requireCentre: false, allowManual: true, system: r.code.length === 1 ? `root.${r.code}` : null,
      linkType: null, linkId: null, alertMin: null, alertMax: null, active: true, note: r.note,
    });
    byCode.set(row.code, row);
  }
  return plan;
}

