/** What the journal writes. A posted entry is never edited or deleted: a mistake is undone by a reversal entry. */
import type { Db } from "@/data/hooks";
import type { FinDoc, FinEntry, FinEntryKind, FinLine } from "@/data/financeTypes";
import { nowIso } from "@/lib/time";
import { amountOf, cleanLines, entryProblem, fiscalYear, JournalError, monthOf, nextNo, reversed } from "./journal";
import { settingsOf } from "./ops";

export interface EntryInput {
  date: string;
  memo: string;
  lines: FinLine[];
  branchId: string | null;
  kind?: FinEntryKind;
  attachments?: FinEntry["attachments"];
  meta?: Record<string, unknown>;
  sourceType?: string | null;
  sourceId?: string | null;
}
export interface Actor { id: string | null; name: string; canApprove: boolean }

async function context(db: Db) {
  const accounts = await db.list("finAccounts");
  const entries = await db.list("finEntries");
  const settings = settingsOf((await db.list("finSettings"))[0]);
  return { accounts, entries, settings, byId: new Map(accounts.map((a) => [a.id, a])) };
}
const base = (i: EntryInput, actor: Actor) => ({
  date: i.date, memo: i.memo.trim().slice(0, 500), lines: cleanLines(i.lines), branchId: i.branchId, kind: i.kind ?? ("manual" as const), attachments: i.attachments ?? [], meta: i.meta ?? {},
  sourceType: i.sourceType ?? null, sourceId: i.sourceId ?? null, createdBy: actor.id, createdByName: actor.name,
});
const blank = { no: 0, year: 0, reverses: null, reversedBy: null, approvedBy: null, postedAt: null, reason: "" };

/** حفظ كمسودة: nothing is checked but the date; a draft moves no balance. */
export async function saveDraft(db: Db, row: FinEntry | null, input: EntryInput, actor: Actor): Promise<FinEntry> {
  if (row && row.status !== "draft" && row.status !== "rejected") throw new JournalError("القيد المرحل لا يعدل. اعمل قيد عكسي ثم قيد جديد.");
  const f = { ...base(input, actor), status: "draft" as const, year: fiscalYear(input.date || nowIso().slice(0, 10)) };
  return row ? db.update("finEntries", row.id, { ...f, reason: "" }) : db.insert("finEntries", { ...blank, ...f });
}

/** ترحيل: checks the entry, then posts it, or sends it for approval when it is above the limit and the user cannot approve. */
export async function submitEntry(db: Db, row: FinEntry | null, input: EntryInput, actor: Actor): Promise<FinEntry> {
  if (row && row.status !== "draft" && row.status !== "rejected") throw new JournalError("القيد المرحل لا يعدل. اعمل قيد عكسي ثم قيد جديد.");
  const c = await context(db);
  const f = base(input, actor);
  const problem = entryProblem(f, c.byId, c.settings, { manual: true });
  if (problem) throw new JournalError(problem);
  const year = fiscalYear(f.date, c.settings.yearStartMonth);
  const wait = c.settings.approvalLimit != null && amountOf(f) > c.settings.approvalLimit && !actor.canApprove;
  const state = wait
    ? { status: "pending" as const, year, no: 0, postedAt: null, approvedBy: null }
    : { status: "posted" as const, year, no: nextNo(c.entries, year), postedAt: nowIso(), approvedBy: actor.id };
  return row ? db.update("finEntries", row.id, { ...f, ...state, reason: "" }) : db.insert("finEntries", { ...blank, ...f, ...state });
}

export async function approveEntry(db: Db, id: string, actor: Actor): Promise<FinEntry> {
  const c = await context(db);
  const e = c.entries.find((x) => x.id === id);
  if (!e || e.status !== "pending") throw new JournalError("القيد ليس في انتظار الاعتماد");
  if (!actor.canApprove) throw new JournalError("ليس لديك صلاحية اعتماد القيود");
  const problem = entryProblem(e, c.byId, c.settings, { manual: true });
  if (problem) throw new JournalError(problem);
  return db.update("finEntries", id, { status: "posted", no: nextNo(c.entries, e.year), postedAt: nowIso(), approvedBy: actor.id });
}
export async function rejectEntry(db: Db, id: string, reason: string, actor: Actor): Promise<FinEntry> {
  const e = await db.get("finEntries", id);
  if (!e || e.status !== "pending") throw new JournalError("القيد ليس في انتظار الاعتماد");
  if (!actor.canApprove) throw new JournalError("ليس لديك صلاحية اعتماد القيود");
  return db.update("finEntries", id, { status: "rejected", reason: reason.trim(), approvedBy: actor.id });
}
/** A draft or a rejected entry never moved a balance, so it may be deleted. */
export async function removeDraft(db: Db, id: string) {
  const e = await db.get("finEntries", id);
  if (!e) return;
  if (e.status === "posted") throw new JournalError("القيد المرحل لا يحذف. اعمل قيد عكسي.");
  await db.remove("finEntries", id);
}

/** قيد عكسي: posts the mirror image on `date` and ties the two together. */
export async function reverseEntry(db: Db, id: string, opts: { date: string; memo?: string }, actor: Actor): Promise<FinEntry> {
  const c = await context(db);
  const e = c.entries.find((x) => x.id === id);
  if (!e || e.status !== "posted") throw new JournalError("يعكس القيد المرحل فقط");
  if (e.reversedBy) throw new JournalError("القيد معكوس بالفعل");
  if (e.kind === "reversal") throw new JournalError("القيد العكسي لا يعكس. اعمل قيد جديد.");
  if (e.sourceType?.startsWith("stock:") && e.sourceType !== "stock:revalue") throw new JournalError("قيد تلقائي من حركة مخزنية، يتصحح من مصدره وليس بقيد عكسي");
  if (!actor.canApprove) throw new JournalError("ليس لديك صلاحية عكس القيود");
  const lines = reversed(e.lines);
  const problem = entryProblem({ date: opts.date, lines }, c.byId, c.settings);
  if (problem) throw new JournalError(problem);
  const year = fiscalYear(opts.date, c.settings.yearStartMonth);
  const rev = await db.insert("finEntries", {
    ...blank, date: opts.date, memo: (opts.memo?.trim() || `عكس القيد ${e.year}/${e.no}: ${e.memo}`).slice(0, 500), lines, branchId: e.branchId, kind: "reversal", status: "posted", attachments: [], meta: {},
    sourceType: e.sourceType ? `reversal:${e.sourceType}` : null, sourceId: e.sourceId, createdBy: actor.id, createdByName: actor.name, year, no: nextNo(c.entries, year), postedAt: nowIso(), approvedBy: actor.id, reverses: e.id,
  });
  await db.update("finEntries", e.id, { reversedBy: rev.id });
  return rev;
}

/**
 * An entry the system makes for a movement in another section. One entry per (sourceType, sourceId): asking again
 * returns the one that exists, unless it was reversed. Returns null when the lines come to nothing.
 */
export async function postSystem(db: Db, input: EntryInput & { sourceType: string; sourceId: string }, ctx?: Awaited<ReturnType<typeof context>>): Promise<FinEntry | null> {
  const c = ctx ?? (await context(db));
  const lines = cleanLines(input.lines);
  if (!lines.length) return null;
  const dup = c.entries.find((e) => e.sourceType === input.sourceType && e.sourceId === input.sourceId && !e.reversedBy);
  if (dup) return dup;
  const problem = entryProblem({ date: input.date, lines }, c.byId, c.settings);
  if (problem) throw new JournalError(problem);
  const year = fiscalYear(input.date, c.settings.yearStartMonth);
  const row = await db.insert("finEntries", {
    ...blank, ...base({ ...input, lines, kind: input.kind ?? "auto" }, { id: null, name: "السيستم", canApprove: true }), status: "posted", year, no: nextNo(c.entries, year), postedAt: nowIso(),
  });
  c.entries.push(row);
  return row;
}
export { context as journalContext };

/* ───────── قوالب القيود والقيود المتكررة (finDocs) ───────── */

export interface TemplateData { memo: string; lines: FinLine[]; branchId: string | null }
export interface RecurringData extends TemplateData { day: number; lastRun: string | null; until: string | null }
export const TEMPLATE = "entry-template";
export const RECURRING = "entry-recurring";

export async function saveTemplate(db: Db, row: FinDoc | null, name: string, data: TemplateData) {
  const f = { kind: TEMPLATE, code: "", name: name.trim(), branchId: data.branchId, status: "active", date: null, data: { ...data, lines: cleanLines(data.lines) } as unknown as Record<string, unknown> };
  return row ? db.update("finDocs", row.id, f) : db.insert("finDocs", f);
}
export async function saveRecurring(db: Db, row: FinDoc | null, name: string, data: RecurringData, active = true) {
  const f = { kind: RECURRING, code: "", name: name.trim(), branchId: data.branchId, status: active ? "active" : "stopped", date: null, data: { ...data, lines: cleanLines(data.lines) } as unknown as Record<string, unknown> };
  return row ? db.update("finDocs", row.id, f) : db.insert("finDocs", f);
}
/** Each active recurring entry gets one draft per month, on its day, for the months that are due up to today. */
export async function runRecurring(db: Db, today: string, actor: Actor): Promise<number> {
  const docs = (await db.list("finDocs", { where: { kind: RECURRING } })).filter((d) => d.status === "active");
  let made = 0;
  for (const d of docs) {
    const data = d.data as unknown as RecurringData;
    const month = monthOf(today);
    if (data.lastRun && data.lastRun >= month) continue;
    if (data.until && month > monthOf(data.until)) continue;
    const day = Math.min(Math.max(1, data.day || 1), 28);
    const date = `${month}-${String(day).padStart(2, "0")}`;
    if (date > today) continue;
    await saveDraft(db, null, { date, memo: `${d.name} (${month.split("-").reverse().join("/")})`, lines: data.lines, branchId: data.branchId, kind: "manual", sourceType: RECURRING, sourceId: `${d.id}:${month}` }, actor);
    await db.update("finDocs", d.id, { data: { ...d.data, lastRun: month } });
    made++;
  }
  return made;
}

/* ───────── الأرصدة الافتتاحية ───────── */

export const OPENING = "opening-balance";
/** One opening entry per restaurant, on the first day; saving again replaces its lines while its month is open. */
export async function saveOpening(db: Db, date: string, lines: FinLine[], actor: Actor, branchId: string | null = null): Promise<FinEntry> {
  const c = await context(db);
  const clean = cleanLines(lines);
  const problem = entryProblem({ date, lines: clean }, c.byId, c.settings);
  if (problem) throw new JournalError(problem);
  const cur = c.entries.find((e) => e.kind === "opening" && e.sourceType === OPENING && !e.reversedBy);
  const year = fiscalYear(date, c.settings.yearStartMonth);
  if (cur) {
    const lock = entryProblem({ date: cur.date, lines: cur.lines }, c.byId, c.settings);
    if (lock.includes("مقفول")) throw new JournalError(lock);
    return db.update("finEntries", cur.id, { date, lines: clean, year, no: cur.year === year ? cur.no : nextNo(c.entries, year), createdBy: actor.id, createdByName: actor.name });
  }
  return db.insert("finEntries", {
    ...blank, date, memo: "الأرصدة الافتتاحية", lines: clean, branchId, kind: "opening", status: "posted", attachments: [], meta: {}, sourceType: OPENING, sourceId: "opening",
    createdBy: actor.id, createdByName: actor.name, year, no: nextNo(c.entries, year), postedAt: nowIso(), approvedBy: actor.id,
  });
}
