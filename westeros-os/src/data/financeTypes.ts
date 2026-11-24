/**
 * الحسابات (Cost Control version): chart of accounts, journal, cost centres and the finance settings
 * (supabase: fin_accounts · fin_entries · fin_cost_centres · fin_settings · fin_docs; src/modules/cc/finance).
 * These tables are separate from the backup system's accounting tables (gl_accounts, ledger_entries …), which stay untouched.
 * Money is Units (0.00001 EGP), days are "YYYY-MM-DD".
 */
import type { Units } from "@/lib/money";

interface Row {
  id: string;
  createdAt: string;
  updatedAt: string;
  restaurantId: string;
}
interface Loc {
  ar: string;
  en: string;
}

/** The six roots of the tree: 1 أصول · 2 التزامات · 3 حقوق ملكية · 4 إيرادات · 5 تكلفة المبيعات · 6 مصروفات */
export type FinAccountType = "asset" | "liability" | "equity" | "revenue" | "cogs" | "expense";
/** نوع الحساب الخاص: what the account stands for in the rest of the system */
export type FinAccountKind = "general" | "cash" | "bank" | "wallet" | "inventory" | "supplier" | "customer" | "employee" | "tax" | "fixed_asset";
export type FinCashflow = "operating" | "investing" | "financing";

export interface FinAccount extends Row {
  /** unique per restaurant; its length follows its level (1, 2, 4, 6, 8 digits) */
  code: string;
  name: Loc;
  /** code of the parent; null for the six roots */
  parentCode: string | null;
  type: FinAccountType;
  /** نهائي: takes journal lines. A parent (تجميعي) only sums its children. */
  postable: boolean;
  kind: FinAccountKind;
  cashflow: FinCashflow | null;
  /** null = every branch */
  branchId: string | null;
  /** a line on this account must name a cost centre */
  requireCentre: boolean;
  /** false = only the system posts here (stock accounts …) */
  allowManual: boolean;
  /** the key of the posting rule that relies on this account (FIN_KEYS); such an account is never deleted */
  system: string | null;
  /** what the account was opened for: a warehouse, a branch's till, a supplier … */
  linkType: string | null;
  linkId: string | null;
  /** تنبيه when the balance (in the account's own direction) goes under / over these */
  alertMin: Units | null;
  alertMax: Units | null;
  active: boolean;
  note: string;
  /** عملة الحساب: null = the system's own currency (FinSettingsData.currency) */
  currency?: string | null;
}

/** What moved in the currency of an account kept in another currency; the line's debit or credit holds its value in the system's currency. */
export interface FinFx {
  currency: string;
  amount: Units;
  /** 1 unit of `currency` in the system's currency, as used on this line */
  rate: number;
}

export interface FinLine {
  /** account code */
  account: string;
  debit: Units;
  credit: Units;
  memo?: string;
  centreId?: string | null;
  branchId?: string | null;
  fx?: FinFx;
}

export type FinEntryKind = "manual" | "auto" | "opening" | "adjust" | "closing" | "reversal" | "receipt" | "payment" | "transfer" | "expense";
export type FinEntryStatus = "draft" | "pending" | "posted" | "rejected";

export interface FinEntry extends Row {
  /** serial inside the year, given when posted; 0 while a draft */
  no: number;
  year: number;
  date: string;
  kind: FinEntryKind;
  status: FinEntryStatus;
  memo: string;
  lines: FinLine[];
  branchId: string | null;
  /** what produced an automatic entry (batch, stock move, supply request …); one entry per source */
  sourceType: string | null;
  sourceId: string | null;
  /** the entry this one cancels / the entry that cancelled this one */
  reverses: string | null;
  reversedBy: string | null;
  attachments: { name: string; url: string }[];
  createdBy: string | null;
  createdByName: string;
  approvedBy: string | null;
  postedAt: string | null;
  reason: string;
  /** voucher number, payee, payment method … */
  meta: Record<string, unknown>;
}

export interface FinCentre extends Row {
  code: string;
  name: Loc;
  parentId: string | null;
  branchId: string | null;
  active: boolean;
}

export type FinCosting = "last" | "average" | "fifo" | "standard";
export type FinPeriodStatus = "open" | "closed" | "locked";

/** ربط خاص: overrides the general link of a posting key for one item, warehouse, raw category or warehouse type. The most specific wins. */
export interface FinLinkRule {
  key: string;
  scope: "item" | "location" | "category" | "storeType";
  id: string;
  /** account code */
  account: string;
}

export interface FinSettingsData {
  /** first month of the financial year (1 = January) */
  yearStartMonth: number;
  /** automatic entries are made for movements from this day on; null = not started */
  startDate: string | null;
  /** "YYYY-MM" → status; a month not listed is open */
  periods: Record<string, FinPeriodStatus>;
  /** FIN_KEYS key → account code (ربط الحسابات) */
  links: Record<string, string>;
  costing: FinCosting;
  /** manual entries above this wait for approval; null = never */
  approvalLimit: Units | null;
  /** توزيع مصروفات المطبخ المركزي على الفروع */
  kitchenAllocation: "none" | "by_supply" | "by_sales" | "fixed";
  kitchenShares: Record<string, number>;
  /** ربط حسب نوع المخزن أو فئة الصنف أو صنف أو مخزن بعينه */
  rules: FinLinkRule[];
  /** each warehouse gets its own stock account under the stock account of the item's kind */
  stockByWarehouse: boolean;
  /** التكلفة المعيارية: item id → cost of one base unit (costing = "standard") */
  standardCosts: Record<string, Units>;
  /** بضاعة بالطريق older than this many days is flagged */
  transitDays: number;
  /** العملة الأساسية: the currency every amount of the system is kept in ("EGP") */
  currency: string;
  /** the other currencies accounts may be kept in, each with its last exchange rate (1 unit = rate in the system's currency) */
  currencies: { code: string; rate: number }[];
  /** فئات العملة الأساسية (العملات الورقية والمعدنية المتداولة): 0.5، 1، 5 … ؛ used to count cash */
  denominations?: number[];
  /** update the other currencies' rates once a day from a free public source; undefined = on */
  ratesAuto?: boolean;
  /** when the rates were last updated automatically (ISO) */
  ratesAt?: string | null;
  /** خدمة التوصيل: the delivery methods and how their fees are collected and shared (ثوابت النظام > خدمة التوصيل) */
  delivery?: { methods: DeliveryMethod[] };
  /** طرق الدفع (Mohammed 2026-11-24): في البيع (الكاشير) وفي الشراء والمصاريف، كل طريقة مربوطة بحساب خزينة أو بنك */
  payMethods?: { sales?: PayMethodDef[]; buying?: PayMethodDef[] };
}

/** طريقة دفع: اسمها، نوعها في الكاشير (للبيع)، والخزينة أو البنك اللي فلوسها بتروح له، ومفعلة ولا لأ */
export interface PayMethodDef {
  id: string;
  name: string;
  /** how the till treats it (البيع بس): cash counts change, the others are taken as they are */
  base?: "cash" | "card" | "wallet" | "instapay";
  accountId: string;
  active: boolean;
  /** البيع: الفروع (ids) اللي الطريقة مش ظاهرة في كاشيرها (Saqr 2026-11-24); empty = every branch */
  offBranches?: string[];
}

/** طريقة توصيل: who delivers, how the fee is collected, and whose share of the fee is it. */
export interface DeliveryMethod {
  id: string;
  name: string;
  /** شركة خارجية · توصيل تابع للمطعم */
  type: "external" | "own";
  /** the delivery company's name (external) */
  company: string;
  /** خارج الفاتورة (not recorded) · يومي من الكاشير · رسوم شهرية ثابتة; both of the last two put the fee on the invoice */
  collection: "outside" | "daily" | "monthly";
  /** طريقة حساب رسوم التوصيل عند الكاشير: حسب منطقة عنوان الزبون (مناطق التوصيل وأسعارها)، مبلغ ثابت، أو يكتبه الكاشير */
  feeBasis?: "area" | "distance" | "fixed" | "manual";
  /** حسب المسافة: the fee up to each distance (km, straight line from the branch to the customer), smallest first; the first is the minimum */
  distanceTiers?: { upToKm: number; fee: Units }[];
  /** for every km (or part of one) beyond the last range; 0 = no delivery beyond it */
  extraPerKm?: Units;
  /** the fee of every order (feeBasis = fixed) */
  fixedFee?: Units;
  /** the fixed monthly fee paid to the company (collection = monthly) */
  monthlyFee: Units;
  /** لصالح مين: the delivery company, the driver of the order, named employees, or the restaurant itself */
  beneficiary: "company" | "driver" | "employees" | "restaurant";
  /** names of the employees (beneficiary = employees) */
  employeeIds: string[];
  /** نسبة التحصيل: the beneficiary's share of the fee, 0 to 100; the rest goes to the revenue account */
  sharePct: number;
  active: boolean;
}

/** One row per restaurant. */
export interface FinSettings extends Row {
  data: Partial<FinSettingsData>;
}

/** Everything else the finance section keeps (entry templates, recurring entries, budgets, fixed assets …), one row each. */
export interface FinDoc extends Row {
  kind: string;
  code: string;
  name: string;
  branchId: string | null;
  status: string;
  date: string | null;
  data: Record<string, unknown>;
}
