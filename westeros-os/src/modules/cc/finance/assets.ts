/** الأصول الثابتة: the register, the monthly depreciation entry, and the sale or write-off of an asset. */
import type { Db } from "@/data/hooks";
import type { FinDoc, FinEntry, FinLine } from "@/data/financeTypes";
import type { Units } from "@/lib/money";
import { JournalError, openDate } from "./journal";
import { journalContext, postSystem, type Actor } from "./journalOps";
import { partyAccount } from "./parties";
import { addMonths, monthEnd } from "./treasury";

export const ASSET = "asset";
export const DEPRECIATION = "depreciation";
export const ASSET_TYPES = [
  { key: "asset.kitchen", label: "معدات المطبخ", life: 60 },
  { key: "asset.fitout", label: "تجهيزات وديكور", life: 60 },
  { key: "asset.devices", label: "أجهزة وكمبيوتر", life: 36 },
  { key: "asset.vehicles", label: "سيارات ودراجات توصيل", life: 60 },
] as const;
export const typeLabel = (key: string) => ASSET_TYPES.find((t) => t.key === key)?.label ?? "أصل ثابت";
export const METHODS = [
  { id: "straight", label: "قسط ثابت", hint: "نفس المبلغ كل شهر على عمر الأصل." },
  { id: "declining", label: "قسط متناقص", hint: "نسبة سنوية من القيمة الدفترية، فالإهلاك أكبر في أول العمر." },
] as const;

export interface AssetData {
  typeKey: string;
  cost: Units;
  /** قيمة الخردة: what it is expected to fetch at the end; never depreciated */
  salvage: Units;
  lifeMonths: number;
  method: "straight" | "declining";
  /** declining balance: yearly rate in percent */
  ratePct: number;
  bought: string;
  /** first month charged, "YYYY-MM" */
  start: string;
  /** depreciation already taken before the asset was entered here */
  opening: Units;
  centreId: string | null;
  serial: string; place: string; note: string;
  posted: { month: string; amount: Units }[];
  buyEntryId: string | null;
  disposal: { date: string; proceeds: Units; entryId: string | null; note: string } | null;
}
export const assetOf = (d: FinDoc) => ({ salvage: 0, opening: 0, ratePct: 0, centreId: null, serial: "", place: "", note: "", posted: [], buyEntryId: null, disposal: null, ...(d.data as object) }) as unknown as AssetData;
export const accumulated = (a: AssetData) => a.opening + a.posted.reduce((s, p) => s + p.amount, 0);
export const bookValue = (a: AssetData) => a.cost - accumulated(a);

/** The charge of one month given what was taken so far; 0 once only the scrap value is left. */
export function chargeOf(a: Pick<AssetData, "cost" | "salvage" | "lifeMonths" | "method" | "ratePct">, taken: Units): Units {
  const left = a.cost - a.salvage - taken;
  if (left <= 0) return 0;
  const per = a.method === "declining" ? Math.round(((a.cost - taken) * (a.ratePct || 0)) / 100 / 12) : Math.round((a.cost - a.salvage) / Math.max(1, a.lifeMonths));
  // the last month takes whatever rounding left behind
  return per <= 0 || left - per < Math.max(1, per / 2) ? left : per;
}
/** The months still to be charged up to `upTo`, in order, each with its amount. */
export function dueCharges(a: AssetData, upTo: string): { month: string; amount: Units }[] {
  if (a.disposal) return [];
  const done = new Set(a.posted.map((p) => p.month));
  const out: { month: string; amount: Units }[] = [];
  let taken = accumulated(a);
  for (let m = a.start, i = 0; m <= upTo && i < 1200; m = addMonths(m, 1), i++) {
    if (done.has(m)) continue;
    const amount = chargeOf(a, taken);
    if (!amount) break;
    out.push({ month: m, amount });
    taken += amount;
  }
  return out;
}
/** جدول الإهلاك حتى آخر العمر */
export function schedule(a: AssetData): { month: string; amount: Units; book: Units; posted: boolean }[] {
  const rows = [...a.posted].sort((x, y) => x.month.localeCompare(y.month));
  let taken = a.opening;
  const out = rows.map((p) => { taken += p.amount; return { ...p, book: a.cost - taken, posted: true }; });
  for (const d of dueCharges(a, addMonths(a.start, 1200))) { taken += d.amount; out.push({ ...d, book: a.cost - taken, posted: false }); }
  return out.sort((x, y) => x.month.localeCompare(y.month));
}
export function assetProblem(f: { name: string; data: Pick<AssetData, "typeKey" | "cost" | "salvage" | "lifeMonths" | "method" | "ratePct" | "bought" | "start" | "opening"> }): string {
  const d = f.data;
  if (!f.name.trim()) return "اكتب اسم الأصل";
  if (!d.typeKey) return "اختر نوع الأصل";
  if (!(d.cost > 0)) return "اكتب تكلفة الأصل";
  if (d.salvage < 0 || d.salvage >= d.cost) return "قيمة الخردة أقل من التكلفة";
  if (d.opening < 0 || d.opening > d.cost - d.salvage) return "مجمع الإهلاك السابق أكبر من القابل للإهلاك";
  if (!d.bought) return "اختر تاريخ الشراء";
  if (!/^\d{4}-\d{2}$/.test(d.start)) return "اختر أول شهر إهلاك";
  if (d.method === "straight" ? !(d.lifeMonths >= 1) : !(d.ratePct > 0 && d.ratePct <= 100)) return d.method === "straight" ? "اكتب العمر بالشهور" : "اكتب نسبة الإهلاك السنوية";
  return "";
}

const idOf = (j: Awaited<ReturnType<typeof journalContext>>, key: string) => {
  const a = j.accounts.find((x) => x.code === j.settings.links[key]);
  if (!a) throw new JournalError(`ربط الحسابات ناقص: لا يوجد حساب للبند "${key}"`);
  if (!a.postable) { const kid = j.accounts.find((x) => x.parentCode === a.code && x.postable && x.active); if (!kid) throw new JournalError(`حساب "${a.name.ar}" تجميعي وليس تحته حساب يقبل قيود`); return kid.id; }
  return a.id;
};
const accumulatedAccount = (db: Db, typeKey: string) => partyAccount(db, { key: "asset.accumulated", linkType: "asset-acc", linkId: typeKey, name: `مجمع إهلاك ${typeLabel(typeKey)}`, kind: "fixed_asset" });

export interface AssetInput { name: string; branchId: string | null; data: Omit<AssetData, "posted" | "buyEntryId" | "disposal">; /** new asset: the till, bank or supplier account that paid for it; "" = already in the books */ paidFrom?: string }
export async function saveAsset(db: Db, row: FinDoc | null, f: AssetInput): Promise<FinDoc> {
  const problem = assetProblem(f);
  if (problem) throw new JournalError(problem);
  const old = row ? assetOf(row) : null;
  if (old?.disposal) throw new JournalError("الأصل مستبعد، لا يتعدل");
  if (old && (old.posted.length || old.buyEntryId) && (old.cost !== f.data.cost || old.typeKey !== f.data.typeKey || old.opening !== f.data.opening)) throw new JournalError("للأصل قيود مسجلة، فالتكلفة والنوع ومجمع الإهلاك السابق لا تتعدل");
  const all = await db.list("finDocs", { where: { kind: ASSET } });
  const data: AssetData = { ...f.data, posted: old?.posted ?? [], buyEntryId: old?.buyEntryId ?? null, disposal: null };
  const fields = { kind: ASSET, name: f.name.trim(), branchId: f.branchId, status: "active", date: f.data.bought, data: data as unknown as Record<string, unknown> };
  const doc = row ? await db.update("finDocs", row.id, fields) : await db.insert("finDocs", { ...fields, code: String(Math.max(0, ...all.map((d) => Number(d.code) || 0)) + 1) });
  if (!row && f.paidFrom) {
    const j = await journalContext(db);
    const e = await postSystem(db, { date: openDate(j.settings, f.data.bought), memo: `شراء أصل: ${doc.name}`, branchId: f.branchId, kind: "auto", sourceType: "asset-buy", sourceId: doc.id, lines: [{ account: idOf(j, f.data.typeKey), debit: f.data.cost, credit: 0 }, { account: f.paidFrom, debit: 0, credit: f.data.cost }] });
    return db.update("finDocs", doc.id, { data: { ...data, buyEntryId: e?.id ?? null } as unknown as Record<string, unknown> });
  }
  return doc;
}

/** What a run up to `month` would post: one row per asset and month. */
export function depreciationDue(docs: FinDoc[], month: string) {
  return docs.filter((d) => d.kind === ASSET && d.status === "active").flatMap((d) => dueCharges(assetOf(d), month).map((c) => ({ doc: d, ...c })));
}
/** إهلاك الشهر: one entry per month for every asset that has a charge due, oldest month first. Returns the entries made. */
export async function runDepreciation(db: Db, month: string, today: string): Promise<FinEntry[]> {
  const upTo = month > today.slice(0, 7) ? today.slice(0, 7) : month;
  const docs = await db.list("finDocs", { where: { kind: ASSET } });
  const due = depreciationDue(docs, upTo);
  const made: FinEntry[] = [];
  for (const m of [...new Set(due.map((d) => d.month))].sort()) {
    const rows = due.filter((d) => d.month === m);
    const j = await journalContext(db);
    const expense = idOf(j, "exp.depreciation");
    const lines: FinLine[] = [];
    const credit = new Map<string, Units>();
    for (const r of rows) {
      const a = assetOf(r.doc);
      lines.push({ account: expense, debit: r.amount, credit: 0, memo: r.doc.name, branchId: r.doc.branchId, ...(a.centreId ? { centreId: a.centreId } : {}) });
      const acc = await accumulatedAccount(db, a.typeKey);
      credit.set(acc.id, (credit.get(acc.id) ?? 0) + r.amount);
    }
    for (const [account, amount] of credit) lines.push({ account, debit: 0, credit: amount });
    const j2 = await journalContext(db);
    const n = j2.entries.filter((e) => e.sourceType === DEPRECIATION && (e.sourceId ?? "").split("#")[0] === m && !e.reversedBy).length;
    const end = monthEnd(m);
    const e = await postSystem(db, { date: openDate(j2.settings, end > today ? today : end), memo: `إهلاك الأصول الثابتة عن ${m.split("-").reverse().join("/")}`, branchId: null, kind: "auto", sourceType: DEPRECIATION, sourceId: n ? `${m}#${n + 1}` : m, lines, meta: { month: m, assets: rows.length } }, j2);
    if (!e) continue;
    made.push(e);
    for (const r of rows) { const cur = await db.get("finDocs", r.doc.id); if (cur) await db.update("finDocs", cur.id, { data: { ...cur.data, posted: [...assetOf(cur).posted, { month: m, amount: r.amount }] } }); }
  }
  return made;
}

export function disposalLines(a: AssetData, proceeds: Units, ids: { assetId: string; accumulatedId: string; moneyId: string; gainId: string; lossId: string }): FinLine[] {
  const acc = accumulated(a), result = proceeds - (a.cost - acc);
  return [
    ...(proceeds ? [{ account: ids.moneyId, debit: proceeds, credit: 0 }] : []),
    ...(acc ? [{ account: ids.accumulatedId, debit: acc, credit: 0 }] : []),
    ...(result < 0 ? [{ account: ids.lossId, debit: -result, credit: 0 }] : []),
    { account: ids.assetId, debit: 0, credit: a.cost },
    ...(result > 0 ? [{ account: ids.gainId, debit: 0, credit: result }] : []),
  ];
}
/** بيع أو استبعاد أصل: the asset and its accumulated depreciation leave the books; the difference is a gain or a loss. */
export async function disposeAsset(db: Db, id: string, f: { date: string; proceeds: Units; moneyId: string | null; note: string }, _actor: Actor): Promise<FinDoc> {
  const doc = await db.get("finDocs", id);
  if (!doc || doc.kind !== ASSET) throw new JournalError("الأصل غير موجود");
  const a = assetOf(doc);
  if (a.disposal) throw new JournalError("الأصل مستبعد بالفعل");
  if (!f.date) throw new JournalError("اختر التاريخ");
  if (f.proceeds < 0) throw new JournalError("ثمن البيع لا يكون بالسالب");
  if (f.proceeds > 0 && !f.moneyId) throw new JournalError("اختر الخزينة أو البنك الذي استلم الثمن");
  const before = addMonths(f.date.slice(0, 7), -1);
  if (dueCharges(a, before).length) throw new JournalError("سجل إهلاك الشهور السابقة لتاريخ الاستبعاد أولا");
  const j = await journalContext(db);
  const acc = await accumulatedAccount(db, a.typeKey);
  const e = await postSystem(db, { date: f.date, memo: `${f.proceeds ? "بيع" : "استبعاد"} أصل: ${doc.name}`, branchId: doc.branchId, kind: "auto", sourceType: "asset-sale", sourceId: doc.id,
    lines: disposalLines(a, f.proceeds, { assetId: idOf(j, a.typeKey), accumulatedId: acc.id, moneyId: f.moneyId ?? "", gainId: idOf(j, "asset.gain"), lossId: idOf(j, "asset.loss") }) });
  return db.update("finDocs", doc.id, { status: "disposed", data: { ...doc.data, disposal: { date: f.date, proceeds: f.proceeds, entryId: e?.id ?? null, note: f.note.trim() } } });
}
