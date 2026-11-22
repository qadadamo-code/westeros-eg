/**
 * خدمة التوصيل (Mohammed, 2026-11-22): طرق التوصيل (شركة خارجية أو توصيل تابع للمطعم)، طريقة تحصيل الرسوم،
 * والرسوم لصالح مين ونسبة التحصيل، والباقي يروح لحساب الإيرادات. ومندوبو التوصيل، كل مندوب له حساب ذمم تحت الأصول المتداولة.
 * Methods live in fin_settings.data.delivery; drivers are fin_docs rows of kind "delivery-driver".
 */
import type { Db } from "@/data/hooks";
import type { DeliveryMethod, FinAccount, FinDoc } from "@/data/financeTypes";
import type { Units } from "@/lib/money";
import { DEFAULT_TREE } from "./chart";
import { JournalError } from "./journal";
import { saveSettings, settingsOf } from "./ops";
import { partyAccount } from "./parties";
import { nextCode, seedRows } from "./tree";

export const DRIVER = "delivery-driver";
export const DRIVER_LINK = "delivery-driver";
export const METHOD_LINK = "delivery-method";
export const DRIVERS_KEY = "delivery.drivers";
export const PAYABLE_KEY = "delivery.fees.payable";

export const TYPE_LABEL: Record<DeliveryMethod["type"], string> = { external: "شركة خارجية", own: "توصيل تابع للمطعم" };
export const COLLECTION_LABEL: Record<DeliveryMethod["collection"], string> = {
  outside: "خارج الفاتورة (الرسوم لا تتسجل)",
  daily: "يومي من الكاشير (الرسوم على الفاتورة)",
  monthly: "رسوم شهرية ثابتة (الرسوم على الفاتورة)",
};
export const BENEFICIARY_LABEL: Record<DeliveryMethod["beneficiary"], string> = { company: "شركة التوصيل", driver: "مندوب التوصيل", employees: "موظفين محددين", restaurant: "المطعم" };
/** who may get the fee for each kind of delivery */
export const BENEFICIARIES: Record<DeliveryMethod["type"], DeliveryMethod["beneficiary"][]> = { external: ["company", "restaurant"], own: ["restaurant", "driver", "employees"] };

export const newMethod = (id: string): DeliveryMethod => ({ id, name: "", type: "own", company: "", collection: "daily", monthlyFee: 0, beneficiary: "restaurant", employeeIds: [], sharePct: 0, active: true });
export const methodsOf = (data: { delivery?: { methods: DeliveryMethod[] } }) => (data.delivery?.methods ?? []).map((m) => ({ ...newMethod(m.id), ...m }));
/** the fee is on the invoice, so it is entered with the day's sales */
export const onInvoice = (m: DeliveryMethod) => m.type === "own" || m.collection !== "outside";
/** the beneficiary's share in percent; the restaurant's own fee has none */
export const shareOf = (m: DeliveryMethod) => (m.beneficiary === "restaurant" ? 0 : Math.min(100, Math.max(0, m.sharePct)));

/** نسبة التحصيل: what of a fee goes to the beneficiary (a current liability or the driver's account) and what is left for the revenue account. */
export function feeSplit(m: DeliveryMethod, amount: Units): { party: Units; revenue: Units } {
  const party = Math.round((amount * shareOf(m)) / 100);
  return { party, revenue: amount - party };
}

/** Where the fee lands in the chart, in words, for the settings screen. */
export function feeAccountText(m: DeliveryMethod): string {
  if (!onInvoice(m)) return "الرسوم خارج الفاتورة: لا تتسجل في الحسابات";
  const s = shareOf(m);
  if (!s) return "الرسوم كلها إيرادات (رسوم التوصيل)";
  const who = m.beneficiary === "company" ? m.company.trim() || "شركة التوصيل" : BENEFICIARY_LABEL[m.beneficiary];
  const where = m.beneficiary === "driver" ? "لحساب المندوب (يخصم من اللي عليه)" : "التزامات متداولة (رسوم توصيل مستحقة للغير)";
  return s === 100 ? `الرسوم كلها لصالح ${who}: ${where}` : `${s}% لصالح ${who}: ${where}، و${100 - s}% إيرادات`;
}

export function methodProblem(m: DeliveryMethod, all: DeliveryMethod[]): string {
  const name = m.name.trim();
  if (!name) return "اكتب اسم طريقة التوصيل";
  if (all.some((x) => x.id !== m.id && x.name.trim() === name)) return "فيه طريقة توصيل بنفس الاسم";
  if (m.type === "external" && !m.company.trim()) return "اكتب اسم شركة التوصيل";
  if (!BENEFICIARIES[m.type].includes(m.beneficiary)) return "اختر الرسوم لصالح مين";
  if (m.beneficiary !== "restaurant" && !(m.sharePct > 0 && m.sharePct <= 100)) return "نسبة التحصيل من 1 إلى 100";
  if (m.beneficiary === "employees" && !m.employeeIds.length) return "اختر الموظفين";
  if (m.collection === "monthly" && m.type === "external" && !(m.monthlyFee > 0)) return "اكتب الرسوم الشهرية";
  if (m.monthlyFee < 0) return "المبالغ لا تكون بالسالب";
  return "";
}

/** Adds or changes one delivery method, keeping the others as they are. */
export async function saveMethod(db: Db, m: DeliveryMethod): Promise<DeliveryMethod[]> {
  const [row] = await db.list("finSettings");
  const all = methodsOf(settingsOf(row));
  const clean: DeliveryMethod = {
    ...m, name: m.name.trim(), company: m.type === "external" ? m.company.trim() : "",
    collection: m.type === "external" ? m.collection : "daily", monthlyFee: m.type === "external" && m.collection === "monthly" ? m.monthlyFee : 0,
    sharePct: m.beneficiary === "restaurant" ? 0 : m.sharePct, employeeIds: m.beneficiary === "employees" ? m.employeeIds : [],
  };
  const problem = methodProblem(clean, all);
  if (problem) throw new JournalError(problem);
  const methods = all.some((x) => x.id === m.id) ? all.map((x) => (x.id === m.id ? clean : x)) : [...all, clean];
  await saveSettings(db, { delivery: { methods } });
  return methods;
}

/** A method that was used stays (it is only stopped); one never used is removed. */
export async function removeMethod(db: Db, id: string): Promise<"removed" | "stopped"> {
  const [row] = await db.list("finSettings");
  const all = methodsOf(settingsOf(row));
  const used = (await db.list("finDocs", { where: { kind: "sales-day" } })).some((d) => ((d.data as { delivery?: { methodId: string }[] }).delivery ?? []).some((l) => l.methodId === id))
    || (await db.list("finDocs", { where: { kind: DRIVER } })).some((d) => driverOf(d).companyMethodId === id);
  await saveSettings(db, { delivery: { methods: used ? all.map((x) => (x.id === id ? { ...x, active: false } : x)) : all.filter((x) => x.id !== id) } });
  return used ? "stopped" : "removed";
}

/* ───────── مندوبو التوصيل ───────── */

export interface DriverData {
  /** مندوب توصيل · مشرف مندوبين */
  role: "driver" | "supervisor";
  /** اللقب */
  title: string;
  nationalId: string;
  /** رقم المكنة */
  bike: string;
  phone: string;
  /** تابع لشركة خارجية · موظف */
  affiliation: "company" | "employee";
  /** the external delivery method of his company */
  companyMethodId: string;
  /** the employee (payroll) he is */
  employeeId: string;
  note: string;
  /** his own account under ذمم مندوبي التوصيل */
  accountId: string;
}
export const driverOf = (d: FinDoc): DriverData => ({ role: "driver", title: "", nationalId: "", bike: "", phone: "", affiliation: "employee", companyMethodId: "", employeeId: "", note: "", accountId: "", ...(d.data as Partial<DriverData>) });
export const ROLE_LABEL: Record<DriverData["role"], string> = { driver: "مندوب توصيل", supervisor: "مشرف مندوبين" };

export function driverProblem(f: { name: string; data: Omit<DriverData, "accountId"> }, others: FinDoc[]): string {
  const name = f.name.trim();
  if (!name) return "اكتب اسم المندوب";
  const nid = f.data.nationalId.trim();
  if (nid && !/^\d{14}$/.test(nid)) return "الرقم القومي 14 رقم";
  if (nid && others.some((d) => driverOf(d).nationalId === nid)) return "الرقم القومي مسجل لمندوب تاني";
  if (f.data.affiliation === "employee" && !f.data.employeeId) return "اختر الموظف المسجل في النظام";
  if (f.data.affiliation === "employee" && others.some((d) => driverOf(d).affiliation === "employee" && driverOf(d).employeeId === f.data.employeeId)) return "الموظف ده متعرف كمندوب بالفعل";
  if (f.data.affiliation === "company" && !f.data.companyMethodId) return "اختر شركة التوصيل";
  return "";
}

/** The chart may have been loaded before خدمة التوصيل existed: its two accounts are added under their parents when missing. */
export async function ensureDeliveryAccounts(db: Db): Promise<void> {
  let accounts = await db.list("finAccounts");
  if (!accounts.length) return;
  const [row] = await db.list("finSettings");
  const links = settingsOf(row).links;
  const add: Record<string, string> = {};
  for (const seed of DEFAULT_TREE.filter((x) => x.key === DRIVERS_KEY || x.key === PAYABLE_KEY)) {
    const key = seed.key!;
    if (accounts.some((a) => a.code === links[key] && (a.system === key || row?.data?.links?.[key]))) continue;
    // the parent is the default one (11 الأصول المتداولة or 21 الالتزامات المتداولة)
    const parent = accounts.find((a) => a.code === seed.code.slice(0, 2));
    if (!parent) continue;
    // a code of the user's own already sits there: the next free one under the same parent is taken
    const code = accounts.some((a) => a.code === seed.code) ? nextCode(parent.code, accounts) : seed.code;
    const [r] = seedRows(new Set(), [{ ...seed, code }]);
    const made = await db.insert("finAccounts", { ...r, parentCode: parent.code, postable: true });
    accounts = [...accounts, made];
    if (code !== links[key]) add[key] = code;
  }
  if (Object.keys(add).length) await saveSettings(db, { links: { ...(row?.data?.links ?? {}), ...add } });
}

/** حساب المندوب: opened the first time it is needed, under ذمم مندوبي التوصيل. */
export async function driverAccount(db: Db, doc: FinDoc): Promise<FinAccount> {
  await ensureDeliveryAccounts(db);
  return partyAccount(db, { key: DRIVERS_KEY, linkType: DRIVER_LINK, linkId: doc.id, name: `${ROLE_LABEL[driverOf(doc).role]}: ${doc.name}`, kind: "customer" });
}

/** رسوم توصيل مستحقة لشركة أو لموظفين: one account per method under رسوم توصيل مستحقة للغير. */
export async function methodPayableAccount(db: Db, m: DeliveryMethod): Promise<FinAccount> {
  await ensureDeliveryAccounts(db);
  const who = m.beneficiary === "company" ? m.company || m.name : `${m.name} (موظفين)`;
  return partyAccount(db, { key: PAYABLE_KEY, linkType: METHOD_LINK, linkId: m.id, name: `رسوم توصيل مستحقة: ${who}` });
}

export async function saveDriver(db: Db, row: FinDoc | null, f: { name: string; branchId: string | null; active: boolean; data: Omit<DriverData, "accountId"> }): Promise<FinDoc> {
  const all = await db.list("finDocs", { where: { kind: DRIVER } });
  const data = { ...f.data, title: f.data.title.trim(), nationalId: f.data.nationalId.trim(), bike: f.data.bike.trim(), phone: f.data.phone.trim(), note: f.data.note.trim(), employeeId: f.data.affiliation === "employee" ? f.data.employeeId : "", companyMethodId: f.data.affiliation === "company" ? f.data.companyMethodId : "" };
  const problem = driverProblem({ name: f.name, data }, all.filter((d) => d.id !== row?.id));
  if (problem) throw new JournalError(problem);
  const fields = { kind: DRIVER, name: f.name.trim(), branchId: f.branchId, status: f.active ? "active" : "stopped", date: null };
  const code = String(Math.max(0, ...all.map((d) => Number(d.code) || 0)) + 1);
  const doc = row ? await db.update("finDocs", row.id, { ...fields, data: { ...row.data, ...data } }) : await db.insert("finDocs", { ...fields, code, data: { ...data, accountId: "" } });
  // no chart yet: the account is opened later, the first time the driver is used
  if (!(await db.list("finAccounts")).length) return doc;
  const acc = await driverAccount(db, doc);
  return driverOf(doc).accountId === acc.id ? doc : db.update("finDocs", doc.id, { data: { ...doc.data, accountId: acc.id } });
}

/** A driver with nothing booked on his account is removed; otherwise he is only stopped. */
export async function removeDriver(db: Db, doc: FinDoc): Promise<"removed" | "stopped"> {
  const accId = driverOf(doc).accountId;
  const used = !!accId && (await db.list("finEntries")).some((e) => e.lines.some((l) => l.account === accId));
  if (used) { await db.update("finDocs", doc.id, { status: "stopped" }); return "stopped"; }
  if (accId) await db.remove("finAccounts", accId);
  await db.remove("finDocs", doc.id);
  return "removed";
}
