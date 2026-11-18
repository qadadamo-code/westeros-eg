/**
 * مراكز التكلفة وتوزيع المصروفات: the centres themselves (two levels), the split of a shared expense over the branches
 * or centres that share it, and the monthly hand-over of what the central kitchen spent to the branches it serves.
 */
import type { Db } from "@/data/hooks";
import type { FinAccount, FinCentre, FinEntry, FinLine, FinSettingsData } from "@/data/financeTypes";
import type { StockMove, StorageLocation } from "@/data/inventoryTypes";
import type { Units } from "@/lib/money";
import { cairoDay, JournalError, openDate } from "./journal";
import { journalContext, postSystem, submitEntry, type Actor } from "./journalOps";
import { allocationLines, salesByBranch } from "./statements";
import { monthEnd } from "./treasury";

export const SUGGESTED_CENTRES = ["المطبخ", "الصالة", "التوصيل", "الإدارة", "التسويق", "المطبخ المركزي"];
export const KITCHEN_SOURCE = "kitchen-allocation";
export const SHARED_SOURCE = "allocation";

export const KITCHEN_METHODS: { id: FinSettingsData["kitchenAllocation"]; label: string; hint: string }[] = [
  { id: "none", label: "بدون توزيع", hint: "مصروفات المطبخ المركزي تفضل عليه، وتظهر في عمود لوحده في قائمة دخل الفروع." },
  { id: "by_supply", label: "حسب التوريد", hint: "كل فرع يتحمل بنسبة قيمة البضاعة اللي استلمها من المطبخ المركزي في الشهر." },
  { id: "by_sales", label: "حسب المبيعات", hint: "كل فرع يتحمل بنسبة مبيعاته في الشهر." },
  { id: "fixed", label: "نسب ثابتة", hint: "تكتب نسبة كل فرع مرة واحدة وتتطبق كل شهر." },
];

export function centreProblem(f: { id?: string; code: string; nameAr: string; parentId: string | null }, all: Pick<FinCentre, "id" | "code" | "parentId">[]): string {
  if (!f.nameAr.trim()) return "اكتب اسم مركز التكلفة";
  if (!f.code.trim()) return "اكتب كود المركز";
  if (all.some((c) => c.id !== f.id && c.code === f.code.trim())) return "الكود مستخدم لمركز آخر";
  if (f.parentId) {
    if (f.parentId === f.id) return "المركز لا يتبع نفسه";
    const parent = all.find((c) => c.id === f.parentId);
    if (!parent) return "المركز الرئيسي غير موجود";
    if (parent.parentId) return "مراكز التكلفة مستويين فقط";
    if (f.id && all.some((c) => c.parentId === f.id)) return "هذا المركز تحته مراكز، لا ينفع يتبع مركز آخر";
  }
  return "";
}
export const nextCentreCode = (all: Pick<FinCentre, "code">[]) => String(Math.max(0, ...all.map((c) => Number(c.code)).filter(Number.isFinite)) + 1).padStart(2, "0");

export async function saveCentre(db: Db, row: FinCentre | null, f: { code: string; nameAr: string; parentId: string | null; branchId: string | null; active: boolean }): Promise<FinCentre> {
  const all = await db.list("finCentres");
  const problem = centreProblem({ ...f, id: row?.id }, all);
  if (problem) throw new JournalError(problem);
  const fields = { code: f.code.trim(), name: { ar: f.nameAr.trim(), en: row?.name.en ?? "" }, parentId: f.parentId, branchId: f.branchId, active: f.active };
  return row ? db.update("finCentres", row.id, fields) : db.insert("finCentres", fields);
}
export const centreUsed = (id: string, entries: Pick<FinEntry, "lines">[]) => entries.reduce((n, e) => n + e.lines.filter((l) => l.centreId === id).length, 0);
/** A centre with lines on it or centres under it stays; it can be switched off instead. */
export async function removeCentre(db: Db, row: FinCentre) {
  const [all, entries] = await Promise.all([db.list("finCentres"), db.list("finEntries")]);
  if (all.some((c) => c.parentId === row.id)) throw new JournalError("تحته مراكز أخرى. انقلها أو احذفها أولا.");
  if (centreUsed(row.id, entries)) throw new JournalError("عليه حركات في القيود، لا يتحذف. ممكن توقفه.");
  await db.remove("finCentres", row.id);
}
/** مركز لكل فرع، والمراكز المقترحة: adds only what is not there by name. Returns how many were added. */
export async function addSuggestedCentres(db: Db, names: string[]): Promise<number> {
  let made = 0;
  for (const name of names) {
    const all = await db.list("finCentres");
    if (all.some((c) => c.name.ar === name)) continue;
    await db.insert("finCentres", { code: nextCentreCode(all), name: { ar: name, en: "" }, parentId: null, branchId: null, active: true });
    made++;
  }
  return made;
}

/* ───────── توزيع مصروف مشترك ───────── */

const inRange = (d: string, f: { from: string; to: string }) => d >= f.from && d <= f.to;
/** What an account carries in a period on one branch; `null` = the lines no branch owns (عام). */
export function bookedOn(entries: FinEntry[], accountId: string, f: { from: string; to: string }, branchId: string | null, centreId?: string | null): Units {
  let s = 0;
  for (const e of entries) {
    if (e.status !== "posted" || e.kind === "closing" || !inRange(e.date, f)) continue;
    for (const l of e.lines) if (l.account === accountId && ((l.branchId ?? e.branchId) ?? null) === branchId && (centreId === undefined || (l.centreId ?? null) === centreId)) s += l.debit - l.credit;
  }
  return s;
}

export interface SharedInput {
  accountId: string;
  from: string;
  to: string;
  /** where it was booked: a branch, or null for what no branch owns */
  sourceBranchId: string | null;
  target: "branch" | "centre";
  by: "shares" | "sales";
  /** branch or centre id → weight (by = shares) */
  shares: Record<string, number>;
  /** leave empty to split everything booked in the period */
  amount?: Units | null;
}
export function sharedPlan(a: { accounts: FinAccount[]; entries: FinEntry[]; branchIds: string[] }, v: SharedInput): { amount: Units; weights: Record<string, number>; lines: FinLine[]; problem: string } {
  const none = (problem: string) => ({ amount: 0, weights: {}, lines: [], problem });
  if (!v.accountId) return none("اختر الحساب");
  if (!v.from || !v.to || v.from > v.to) return none("اختر الفترة");
  const booked = bookedOn(a.entries, v.accountId, v, v.sourceBranchId);
  const amount = v.amount ?? booked;
  if (!(amount > 0)) return none("لا يوجد مبلغ على هذا الحساب في الفترة");
  if (amount > booked) return none("المبلغ أكبر من المسجل على الحساب في الفترة");
  if (v.by === "sales" && v.target === "centre") return none("التوزيع بالمبيعات على الفروع فقط");
  const raw = v.by === "sales" ? salesByBranch(a.accounts, a.entries, v, a.branchIds.filter((b) => b !== v.sourceBranchId)) : v.shares;
  const weights = Object.fromEntries(Object.entries(raw).filter(([k, w]) => w > 0 && !(v.target === "branch" && k === v.sourceBranchId)));
  if (!Object.keys(weights).length) return none(v.by === "sales" ? "لا توجد مبيعات في الفترة توزع عليها" : "اكتب النسب");
  return { amount, weights, lines: allocationLines(v.accountId, amount, { branchId: v.sourceBranchId }, weights, v.target), problem: "" };
}
export async function allocateShared(db: Db, v: SharedInput, memo: string, actor: Actor): Promise<FinEntry> {
  const j = await journalContext(db);
  const branches = await db.list("branches");
  const plan = sharedPlan({ accounts: j.accounts, entries: j.entries, branchIds: branches.map((b) => b.id) }, v);
  if (plan.problem) throw new JournalError(plan.problem);
  const n = j.entries.filter((e) => e.sourceType === SHARED_SOURCE).length + 1;
  return submitEntry(db, null, { date: openDate(j.settings, v.to), memo: memo.trim() || `توزيع ${j.byId.get(v.accountId)?.name.ar ?? "مصروف"}`, lines: plan.lines, branchId: null, kind: "adjust", sourceType: SHARED_SOURCE, sourceId: `${v.to}:${n}`, meta: { from: v.from, to: v.to, by: v.by, target: v.target } }, actor);
}

/* ───────── توزيع مصروفات المطبخ المركزي ───────── */

type Branch = { id: string; isCentral?: boolean };
/** قيمة ما استلمه كل فرع من مخازن المطبخ المركزي في الفترة */
export function supplyByBranch(moves: Pick<StockMove, "kind" | "groupId" | "refId" | "id" | "locationId" | "value" | "at">[], locations: Map<string, Pick<StorageLocation, "branchId">>, central: Set<string>, f: { from: string; to: string }): Record<string, number> {
  const fromKitchen = new Set<string>();
  const key = (m: { groupId: string | null; refId: string | null; id: string }) => m.groupId ?? m.refId ?? m.id;
  for (const m of moves) if (m.kind === "transfer_out" && central.has(locations.get(m.locationId)?.branchId ?? "")) fromKitchen.add(key(m));
  const out: Record<string, number> = {};
  for (const m of moves) {
    if (m.kind !== "transfer_in" || !fromKitchen.has(key(m)) || !inRange(cairoDay(m.at), f)) continue;
    const b = locations.get(m.locationId)?.branchId;
    if (!b || central.has(b)) continue;
    out[b] = (out[b] ?? 0) + Math.max(0, m.value);
  }
  return out;
}

export interface KitchenPlan {
  month: string;
  method: FinSettingsData["kitchenAllocation"];
  total: Units;
  weights: Record<string, number>;
  /** what each branch takes */
  shares: Record<string, Units>;
  rows: { account: FinAccount; branchId: string; amount: Units }[];
  lines: FinLine[];
  problem: string;
}
/** What the central kitchen spent in a month and has not handed over yet, split by the method in the settings. */
export function kitchenPlan(a: { accounts: FinAccount[]; entries: FinEntry[]; settings: Pick<FinSettingsData, "kitchenAllocation" | "kitchenShares">; branches: Branch[]; moves: Parameters<typeof supplyByBranch>[0]; locations: Map<string, Pick<StorageLocation, "branchId">> }, month: string): KitchenPlan {
  const method = a.settings.kitchenAllocation;
  const f = { from: `${month}-01`, to: monthEnd(month) };
  const central = new Set(a.branches.filter((b) => b.isCentral).map((b) => b.id));
  const others = a.branches.filter((b) => !b.isCentral).map((b) => b.id);
  const plan: KitchenPlan = { month, method, total: 0, weights: {}, shares: {}, rows: [], lines: [], problem: "" };
  if (method === "none") return { ...plan, problem: "التوزيع متوقف في الإعدادات" };
  if (!central.size) return { ...plan, problem: "لا يوجد فرع معلم مطبخ مركزي" };
  if (!others.length) return { ...plan, problem: "لا توجد فروع يوزع عليها" };
  for (const b of central) for (const acc of a.accounts) {
    if (!acc.postable || acc.type !== "expense") continue;
    const amount = bookedOn(a.entries, acc.id, f, b);
    if (amount > 0) plan.rows.push({ account: acc, branchId: b, amount });
  }
  plan.total = plan.rows.reduce((s, r) => s + r.amount, 0);
  const raw = method === "by_sales" ? salesByBranch(a.accounts, a.entries, f, others) : method === "by_supply" ? supplyByBranch(a.moves, a.locations, central, f) : a.settings.kitchenShares;
  plan.weights = Object.fromEntries(Object.entries(raw).filter(([k, w]) => w > 0 && others.includes(k)));
  if (!plan.total) return { ...plan, problem: "لا توجد مصروفات على المطبخ المركزي في هذا الشهر لم توزع" };
  if (!Object.keys(plan.weights).length) return { ...plan, problem: method === "fixed" ? "اكتب نسب الفروع" : method === "by_sales" ? "لا توجد مبيعات للفروع في هذا الشهر" : "لا يوجد توريد من المطبخ المركزي للفروع في هذا الشهر" };
  plan.lines = plan.rows.flatMap((r) => allocationLines(r.account.id, r.amount, { branchId: r.branchId }, plan.weights, "branch"));
  for (const l of plan.lines) if (l.debit && l.branchId) plan.shares[l.branchId] = (plan.shares[l.branchId] ?? 0) + l.debit;
  return plan;
}
/** Posts the month's hand-over. Run again after more expenses arrive and only the rest moves. */
export async function allocateKitchen(db: Db, month: string, today: string): Promise<FinEntry | null> {
  const j = await journalContext(db);
  const [branches, moves, locs] = await Promise.all([db.list("branches"), db.list("stockMoves"), db.list("storageLocations")]);
  const plan = kitchenPlan({ accounts: j.accounts, entries: j.entries, settings: j.settings, branches, moves, locations: new Map(locs.map((l) => [l.id, l])) }, month);
  if (plan.problem) throw new JournalError(plan.problem);
  const end = monthEnd(month);
  const n = j.entries.filter((e) => e.sourceType === KITCHEN_SOURCE && (e.sourceId ?? "").split("#")[0] === month && !e.reversedBy).length;
  return postSystem(db, { date: openDate(j.settings, end > today ? today : end), memo: `توزيع مصروفات المطبخ المركزي عن ${month.split("-").reverse().join("/")}`, lines: plan.lines, branchId: null, kind: "adjust", sourceType: KITCHEN_SOURCE, sourceId: n ? `${month}#${n + 1}` : month, meta: { month, method: plan.method, weights: plan.weights } }, j);
}
