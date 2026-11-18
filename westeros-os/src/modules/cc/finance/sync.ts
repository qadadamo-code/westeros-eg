/**
 * ترحيل حركات المخازن والتصنيع: finds the stock movements that have no entry yet (from the start date of the settings
 * on) and posts one entry per action. Safe to run again and again, and from two screens at once: an action is posted
 * once. The warehouses and their data are only read here, never written.
 */
import type { Db } from "@/data/hooks";
import type { FinAccount, FinEntry, FinLine, FinSettingsData } from "@/data/financeTypes";
import type { StockItem, StockMove, StorageLocation } from "@/data/inventoryTypes";
import type { MfgLists } from "@/data/productionTypes";
import { cairoDay, dayBefore, JournalError, openDate } from "./journal";
import { journalContext, postSystem } from "./journalOps";
import { saveAccount, settingsOf } from "./ops";
import { netLines, planEntries, STOCK_KEYS, stockKeyOf, type Plan, type Target } from "./posting";
import { indexChart, MAX_LEVEL, nextCode } from "./tree";
import { valueMoves } from "./valuation";

export const STOCK_SOURCE = "stock:";
/** where a stock entry came from, in words (refType of the movements) */
export const STOCK_REF_LABEL: Record<string, string> = {
  mfg_batch: "تشغيلة تصنيع", mfg_batch_void: "إلغاء تشغيلة", stock_request: "طلب توريد", transfer: "تحويل مخزني", opening: "رصيد أول المدة لمخزن",
  waste: "هالك مخزن", count: "جرد مخزن", receive: "استلام بضاعة", production: "تحضير", sale: "تكلفة مبيعات", start: "مخزون تاريخ البداية", revalue: "تسوية تقييم المخزون",
};
export const WAREHOUSE_LINK = "warehouse";

/** The account a posting key stands for, for this item and warehouse: the most specific rule wins, then the general link. */
export function linkedCode(settings: Pick<FinSettingsData, "links" | "rules">, t: Target, item?: Pick<StockItem, "spec" | "note"> | null, loc?: Pick<StorageLocation, "type"> | null): { code: string | undefined; specific: boolean } {
  const rules = (settings.rules ?? []).filter((r) => r.key === t.key);
  const pick = (scope: string, id: string | null | undefined) => (id ? rules.find((r) => r.scope === scope && r.id === id)?.account : undefined);
  const exact = pick("item", t.itemId) ?? pick("location", t.locationId);
  if (exact) return { code: exact, specific: true };
  return { code: pick("category", item?.spec?.category ?? item?.note) ?? pick("storeType", loc?.type) ?? settings.links[t.key], specific: false };
}

interface Ctx {
  db: Db;
  j: Awaited<ReturnType<typeof journalContext>>;
  items: Map<string, StockItem>;
  locations: Map<string, StorageLocation>;
  used: Set<string>;
}

/** The account a target posts to as the chart stands; `open` = the warehouse has no account of its own yet and may get one. */
export function findAccount(accounts: FinAccount[], used: Set<string>, s: Pick<FinSettingsData, "links" | "rules" | "stockByWarehouse">, t: Target, item?: StockItem | null, loc?: StorageLocation | null): { acc: FinAccount | null; open: boolean } {
  const { code, specific } = linkedCode(s, t, item, loc);
  const acc = accounts.find((a) => a.code === code) ?? null;
  if (!acc) return { acc: null, open: false };
  const perWarehouse = s.stockByWarehouse && !specific && loc && (STOCK_KEYS as readonly string[]).includes(t.key);
  if (!perWarehouse) return { acc, open: false };
  const child = accounts.find((a) => a.parentCode === acc.code && a.linkType === WAREHOUSE_LINK && a.linkId === loc.id);
  if (child) return { acc: child, open: false };
  // the linked account already carries lines of its own, or sits on the last level: it stays the stock account
  const fixed = indexChart(accounts).level(acc.code) >= MAX_LEVEL || (acc.postable && used.has(acc.id));
  return { acc, open: !fixed };
}

/** Finds (or opens) the account of a target. A stock target gets the warehouse's own account under the linked one. */
async function accountFor(c: Ctx, t: Target): Promise<FinAccount> {
  const item = t.itemId ? c.items.get(t.itemId) : null;
  const loc = t.locationId ? c.locations.get(t.locationId) : null;
  const { acc, open } = findAccount(c.j.accounts, c.used, c.j.settings, t, item, loc);
  if (!acc) throw new JournalError(`ربط الحسابات ناقص: لا يوجد حساب للبند "${t.key}"`);
  if (!open || !loc) return leaf(c, acc, t.key);
  const made = await saveAccount(c.db, null, {
    code: nextCode(acc.code, c.j.accounts), name: { ar: `${acc.name.ar}: ${loc.name.ar}`, en: loc.name.en ? `${acc.name.en}: ${loc.name.en}` : "" }, parentCode: acc.code, postable: true,
    kind: "inventory", cashflow: acc.cashflow, branchId: loc.branchId, requireCentre: false, allowManual: false, alertMin: null, alertMax: null, active: true, note: "",
  });
  const linked = await c.db.update("finAccounts", made.id, { linkType: WAREHOUSE_LINK, linkId: loc.id });
  c.j = await journalContext(c.db);
  return linked;
}
/** A linked account that was turned into a parent posts to its first open child. */
function leaf(c: Ctx, acc: FinAccount, key: string): FinAccount {
  if (acc.postable) return acc;
  const kid = indexChart(c.j.accounts).descendants(acc.code).find((a) => a.postable && a.active);
  if (!kid) throw new JournalError(`حساب الربط "${acc.name.ar}" (${key}) تجميعي وليس تحته حساب يقبل قيود`);
  return kid as FinAccount;
}

export interface SyncResult { posted: number; problems: string[] }
export interface SyncLabels { ref: (refType: string, refId: string) => string }

async function labels(db: Db, locations: Map<string, StorageLocation>): Promise<(p: Plan, moves: StockMove[]) => string> {
  const batches = new Map((await db.list("mfgBatches")).map((b) => [b.id, b]));
  const requests = new Map((await db.list("stockRequests")).map((r) => [r.id, r]));
  const where = (ids: string[]) => [...new Set(ids)].map((id) => locations.get(id)?.name.ar ?? "").filter(Boolean).join(" و");
  return (p, moves) => {
    const b = batches.get(p.refId);
    if (p.refType === "mfg_batch" && b) return `تشغيلة ${b.number}: ${b.outputs.map((o) => o.name.ar).join("، ")} (${b.chefName})`;
    if (p.refType === "mfg_batch_void" && b) return `إلغاء تشغيلة ${b.number}`;
    const r = requests.get(p.refId);
    if (p.refType === "stock_request" && r) return `طلب ${r.kind === "supply" ? "توريد" : "شراء"} رقم ${r.number}`;
    if (p.refType === "transfer") return `تحويل مخزني من ${where(moves.filter((m) => m.qty < 0).map((m) => m.locationId))} إلى ${where(moves.filter((m) => m.qty > 0).map((m) => m.locationId))}`;
    return `${STOCK_REF_LABEL[p.refType] ?? "حركة مخزنية"} ${where(moves.map((m) => m.locationId))}`.trim();
  };
}

/** The ids of the movements that already have an entry. */
export const postedMoves = (entries: Pick<FinEntry, "sourceType" | "meta">[]) => {
  const s = new Set<string>();
  for (const e of entries) if (e.sourceType?.startsWith(STOCK_SOURCE)) for (const id of (e.meta?.moves as string[] | undefined) ?? []) s.add(id);
  return s;
};

let running: Promise<SyncResult> | null = null;
/** One run at a time in this tab; a second call waits for the first and returns its result. */
export function syncStock(db: Db): Promise<SyncResult> {
  running ??= run(db).finally(() => { running = null; });
  return running;
}

async function run(db: Db): Promise<SyncResult> {
  const out: SyncResult = { posted: 0, problems: [] };
  const j = await journalContext(db);
  const start = j.settings.startDate;
  if (!start || !j.accounts.length) return out;
  const moves = await db.list("stockMoves");
  if (!moves.length) return out;
  const items = new Map((await db.list("stockItems")).map((i) => [i.id, i]));
  const locations = new Map((await db.list("storageLocations")).map((l) => [l.id, l]));
  const lists: MfgLists | null = (await db.list("mfgSettings"))[0]?.lists ?? null;
  const c: Ctx = { db, j, items, locations, used: new Set(j.entries.flatMap((e) => e.lines.map((l) => l.account))) };
  const valued = valueMoves(moves, j.settings.costing, j.settings.standardCosts);
  const byId = new Map(moves.map((m) => [m.id, m]));

  const post = async (input: { sourceType: string; sourceId: string; date: string; memo: string; branchId: string | null; kind?: FinEntry["kind"]; targets: { target: Target; debit: number; credit: number; branchId: string | null }[]; meta: Record<string, unknown> }) => {
    const lines: FinLine[] = [];
    for (const l of input.targets) lines.push({ account: (await accountFor(c, l.target)).id, debit: l.debit, credit: l.credit, branchId: l.branchId });
    const net = netLines(lines);
    const date = openDate(c.j.settings, input.date);
    const row = await postSystem(db, { sourceType: input.sourceType, sourceId: input.sourceId, date, memo: date === input.date ? input.memo : `${input.memo} (حركة يوم ${input.date.split("-").reverse().join("/")})`, branchId: input.branchId, kind: input.kind, lines: net, meta: input.meta }, c.j);
    if (row) { out.posted++; for (const l of row.lines) c.used.add(l.account); }
    return row;
  };

  // what stood in the warehouses before the start date comes in once, against the opening balances account
  if (!c.j.entries.some((e) => e.sourceType === `${STOCK_SOURCE}start` && !e.reversedBy)) {
    const before = valueMoves(moves.filter((m) => cairoDay(m.at) < start), c.j.settings.costing, c.j.settings.standardCosts).positions;
    const targets = [...before].filter(([, p]) => p.value).flatMap(([k, p]) => {
      const [itemId, locationId] = k.split("|");
      const branchId = locations.get(locationId)?.branchId ?? null;
      return [{ target: { key: stockKeyOf(items.get(itemId), lists), itemId, locationId }, debit: Math.max(0, p.value), credit: Math.max(0, -p.value), branchId }, { target: { key: "opening" }, debit: Math.max(0, -p.value), credit: Math.max(0, p.value), branchId: null }];
    });
    try {
      if (targets.length) await post({ sourceType: `${STOCK_SOURCE}start`, sourceId: "start", date: start, memo: `رصيد المخزون في تاريخ بداية القيود التلقائية (${dayBefore(start).split("-").reverse().join("/")})`, branchId: null, kind: "opening", targets, meta: { refType: "start" } });
    } catch (e) { out.problems.push(e instanceof Error ? e.message : String(e)); }
  }

  const done = postedMoves(c.j.entries);
  const pending = moves.filter((m) => !done.has(m.id) && cairoDay(m.at) >= start);
  if (!pending.length) return out;
  const memoOf = await labels(db, locations);
  for (const p of planEntries(pending, valued.byId, items, lists)) {
    try {
      const sourceType = `${STOCK_SOURCE}${p.refType}`;
      // a later movement of an action that already has an entry (the arrival of a transfer …) gets an entry of its own
      const n = c.j.entries.filter((e) => e.sourceType === sourceType && (e.sourceId === p.refId || e.sourceId?.startsWith(`${p.refId}#`))).length;
      const ms = p.moveIds.map((id) => byId.get(id)!);
      await post({ sourceType, sourceId: n ? `${p.refId}#${n + 1}` : p.refId, date: cairoDay(p.at), memo: memoOf(p, ms), branchId: p.branchId, targets: p.lines, meta: { moves: p.moveIds, refType: p.refType, refId: p.refId } });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!out.problems.includes(msg)) out.problems.push(msg);
    }
  }
  return out;
}

/** The entry (or entries) of an action in another section: a batch, a supply request, a transfer, a count. */
export const entriesOfSource = (entries: FinEntry[], refId: string) =>
  entries.filter((e) => e.sourceType?.startsWith(STOCK_SOURCE) && (e.sourceId === refId || e.sourceId?.startsWith(`${refId}#`)));

export { settingsOf };

/* ───────── مطابقة المخزون ───────── */

export interface ReconRow {
  account: FinAccount;
  /** رصيد الحساب في الدفتر (مدين − دائن) */
  ledger: number;
  /** قيمة المخزون في المخازن بطريقة التكلفة المختارة */
  stock: number;
  /** القيمة المسجلة في أرصدة المخازن (المتوسط المرجح) */
  recorded: number;
  items: number;
  diff: number;
}
/** Each stock account against what its warehouses hold. Movements that have no entry yet show up as a difference, so sync first. */
export function stockRecon(a: { accounts: FinAccount[]; entries: FinEntry[]; settings: FinSettingsData; moves: StockMove[]; items: Map<string, StockItem>; locations: Map<string, StorageLocation>; lists: MfgLists | null; to?: string | null }): ReconRow[] {
  const used = new Set(a.entries.flatMap((e) => e.lines.map((l) => l.account)));
  const moves = a.to ? a.moves.filter((m) => cairoDay(m.at) <= a.to!) : a.moves;
  const positions = valueMoves(moves, a.settings.costing, a.settings.standardCosts).positions;
  const recorded = valueMoves(moves, "average").positions;
  const rows = new Map<string, ReconRow>();
  const row = (acc: FinAccount) => rows.get(acc.id) ?? rows.set(acc.id, { account: acc, ledger: 0, stock: 0, recorded: 0, items: 0, diff: 0 }).get(acc.id)!;
  for (const [k, p] of positions) {
    const [itemId, locationId] = k.split("|");
    const item = a.items.get(itemId), loc = a.locations.get(locationId);
    const { acc } = findAccount(a.accounts, used, a.settings, { key: stockKeyOf(item, a.lists), itemId, locationId }, item, loc);
    if (!acc || (!p.value && !p.qty)) continue;
    const r = row(acc);
    r.stock += p.value;
    r.recorded += recorded.get(k)?.value ?? 0;
    r.items += p.qty ? 1 : 0;
  }
  // every account under the linked stock accounts, even one no warehouse maps to any more
  const ix = indexChart(a.accounts);
  for (const key of STOCK_KEYS) {
    const top = a.accounts.find((x) => x.code === a.settings.links[key]);
    if (top) for (const x of [top, ...ix.descendants(top.code)] as FinAccount[]) if (x.postable && used.has(x.id)) row(x);
  }
  const own = new Map<string, number>();
  for (const e of a.entries) if (e.status === "posted" && (!a.to || e.date <= a.to)) for (const l of e.lines) own.set(l.account, (own.get(l.account) ?? 0) + l.debit - l.credit);
  for (const r of rows.values()) { r.ledger = own.get(r.account.id) ?? 0; r.diff = r.ledger - r.stock; }
  return [...rows.values()].sort((x, y) => x.account.code.localeCompare(y.account.code));
}

/** قيد تسوية: brings each stock account to the value its warehouses hold; the difference goes to فروق أسعار المخزون. */
export async function postRevaluation(db: Db, rows: ReconRow[], date: string, by: { id: string | null; name: string }): Promise<FinEntry | null> {
  const j = await journalContext(db);
  const variance = j.accounts.find((x) => x.code === j.settings.links["price.variance"]);
  if (!variance) throw new JournalError("حساب فروق أسعار المخزون غير موجود في ربط الحسابات");
  const lines: FinLine[] = [];
  let total = 0;
  for (const r of rows) {
    if (!r.diff || !r.account.postable) continue;
    lines.push({ account: r.account.id, debit: Math.max(0, -r.diff), credit: Math.max(0, r.diff), branchId: r.account.branchId });
    total += r.diff;
  }
  if (!lines.length) return null;
  lines.push({ account: variance.id, debit: Math.max(0, total), credit: Math.max(0, -total) });
  const row = await postSystem(db, { sourceType: `${STOCK_SOURCE}revalue`, sourceId: `${date}:${Date.now()}`, date, memo: "تسوية تقييم المخزون مع أرصدة المخازن", branchId: null, kind: "adjust", lines: netLines(lines), meta: { refType: "revalue" } }, j);
  return row ? db.update("finEntries", row.id, { createdBy: by.id, createdByName: by.name }) : null;
}

/** Transfers that left a warehouse and have not arrived anywhere. */
export function inTransit(moves: StockMove[]) {
  const g = new Map<string, { out: StockMove[]; arrived: boolean }>();
  for (const m of moves) {
    if (m.kind !== "transfer_out" && m.kind !== "transfer_in") continue;
    const k = m.groupId ?? m.refId ?? m.id;
    const x = g.get(k) ?? g.set(k, { out: [], arrived: false }).get(k)!;
    if (m.kind === "transfer_out") x.out.push(m); else x.arrived = true;
  }
  return [...g.entries()].filter(([, x]) => x.out.length && !x.arrived).map(([id, x]) => ({ id, at: x.out[0].at, locationId: x.out[0].locationId, value: -x.out.reduce((s, m) => s + m.value, 0), refType: x.out[0].refType }));
}
