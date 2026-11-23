/**
 * صلاحيات الأدوار: every permission a role can tick in المستخدمين > الأدوار. First the tabs matrix (access.ts: مشاهدة،
 * إضافة، تعديل، حذف، استيراد، تصدير for every tab, ids "acc:area:act"; the screens a role opens follow from it), then
 * the other permissions grouped under headings, each with a line that explains it. Prices, restore and الحسابات keep
 * their own fields on the role (`seePrices`, `restore`, `finance`); the newer ones live in `perms`.
 * The account owner always has every permission.
 */
import type { MfgLists, MfgUserType } from "@/data/types";
import { FIN_PERMS, finPermsOf } from "./finance/perms";
import { accessKey, accessOf, areas, screensFromAccess } from "./access";
import { canRestore, seesPrices, userTypeOf } from "./lib";

/** الصلاحيات الأخرى (stored in `perms`) */
export const SUPPLY_PERMS = [
  {
    id: "supply.branch",
    label: "اختيار الفرع في طلب التوريد",
    help: "يقدر يختار الفرع اللي هيتورد له. من غير الصلاحية دي الطلب بيتسجل على فرع الموظف (مكان العمل) وما يتغيرش. تغيير فرع طلب بعد إرساله للإدارة بس.",
  },
  {
    id: "supply.handle",
    label: "إشعارات وتنفيذ طلبات التوريد",
    help: "لأمين المخزن: يوصله إشعار ورسالة عند فتح السيستم بطلبات التوريد للمنتجات المتخزنة في المخازن اللي هو أمينها. يحدد حالة الطلب (قيد التنفيذ أو مؤجل لموعد تاني) والكمية اللي اتبعتت، ويطبع ملصق الخامات.",
  },
] as const;
/** طلب شراء */
export const PURCHASE_PERMS = [
  {
    id: "purchase.handle",
    label: "مسؤول المشتريات",
    help: "يوصله إشعار ورسالة عند فتح السيستم بأي طلب شراء جديد. يحدد حالة الطلب (قيد التنفيذ أو مؤجل) ولما الخامات تتشترى يدخلها المخزن.",
  },
] as const;
export type SupplyPerm = (typeof SUPPLY_PERMS)[number]["id"] | (typeof PURCHASE_PERMS)[number]["id"];

/** what each screen lets its users do: the line under the screen's tick */
export const SCREEN_HELP: Record<string, string> = {
  "cc-summary": "يشوف الملخص العام: الانتاج والمخزون والطلبات.",
  "cc-stores": "يفتح المخازن والفروع: أرصدة المخازن، الفروع، مواد الخام، الحركات المخزنية، الجرد، طلبات التوريد والشراء، وملخصها.",
  "cc-constants": "يفتح ثوابت النظام ويعدل القوائم اللي السيستم بيختار منها.",
  "cc-mfg": "يفتح التصنيع: تصنيع صنف، الوصفات، سجل التشغيلات، المنتجات المصنعة، أصناف البيع، وملخصه.",
  "cc-users": "يفتح المستخدمين والأدوار: يضيف ويعدل الموظفين وصلاحياتهم.",
  "cc-finance": "يفتح الحسابات. اللي يقدر يعمله جوه بيتحدد من صلاحيات الحسابات تحت.",
  "cc-delivery": "يفتح خدمة التوصيل: طرق التوصيل ونسبة تحصيل الرسوم، ومندوبو التوصيل وحساباتهم.",
};

const FIN_HELP: Record<string, string> = {
  "chart.view": "يشوف شجرة الحسابات وأرصدتها.",
  "chart.edit": "يضيف حساب جديد ويعدل اسمه وبياناته.",
  "chart.restructure": "يحذف أو يدمج أو ينقل حساب في الشجرة.",
  settings: "يربط الحسابات بالعمليات ويعدل الإعدادات المالية.",
  "journal.enter": "يكتب قيد يومية يدوي.",
  "journal.approve": "يعتمد القيود أو يعكسها.",
  vouchers: "يعمل سندات قبض وصرف ويسجل المصروفات.",
  reports: "يفتح التقارير المالية.",
  profit: "يشوف الأرباح وحقوق الملكية.",
  budget: "يعمل ويعدل الموازنة التقديرية.",
  "close.month": "يقفل الشهر أو يفتحه.",
  "close.year": "يقفل السنة المالية.",
  "branches.all": "يشوف كل الفروع. من غيرها يشوف فروعه بس في المؤشرات والتقارير والقيود.",
};

export interface PermItem { id: string; label: string; help: string }
export interface PermGroup { id: string; title: string; note?: string; items: PermItem[] }

/** the headings and the permissions under each one, in the order the role dialog shows them (after the tabs matrix, see access.ts) */
export function permGroups(financeOn: boolean): PermGroup[] {
  return [
    { id: "supply", title: "المخازن والفروع: طلبات التوريد", items: SUPPLY_PERMS.map((p) => ({ id: p.id, label: p.label, help: p.help })) },
    { id: "purchase", title: "المخازن والفروع: طلبات الشراء", items: PURCHASE_PERMS.map((p) => ({ id: p.id, label: p.label, help: p.help })) },
    { id: "money", title: "الأسعار والتكاليف", items: [{ id: "prices", label: "رؤية الأسعار والتكاليف", help: "يشوف أسعار الشراء وتكلفة الوصفات والتشغيلات. من غيرها الأرقام دي بتظهر مخفية." }] },
    ...(financeOn ? [{ id: "finance", title: "الحسابات", note: "تشتغل لما شاشة الحسابات تكون متعلم عليها.", items: FIN_PERMS.map((p) => ({ id: `fin:${p.id}`, label: p.label, help: FIN_HELP[p.id] ?? "" })) }] : []),
    { id: "admin", title: "الإدارة", items: [{ id: "restore", label: "الاسترجاع من السجل", help: "يرجع عن إضافة أو تعديل أو حذف من السجل والاسترجاع. تحتاج شاشة المستخدمين." }] },
  ];
}

const LEVEL_PERMS: Record<MfgUserType["role"], SupplyPerm[]> = {
  admin: ["supply.branch", "supply.handle", "purchase.handle"],
  manager: ["supply.branch", "supply.handle", "purchase.handle"],
  chef: [],
  kitchen: [],
  cashier: [],
};
/** the permissions in `perms` a role has: its ticked list, else what its level allowed */
export const otherPermsOf = (t: MfgUserType): string[] => t.perms ?? LEVEL_PERMS[t.role];

/** الإدارة: the owner and the users-management level (المستخدمين) */
export const isManagement = (member: { role: string } | null | undefined) => member?.role === "owner" || member?.role === "admin";

/** every permission id a role has, in the ids `permGroups` uses */
export function permsOfRole(t: MfgUserType): Set<string> {
  return new Set([
    ...[...accessOf(t)].map((k) => `acc:${k}`),
    ...otherPermsOf(t),
    ...(seesPrices(t) ? ["prices"] : []),
    ...finPermsOf(t).map((p) => `fin:${p}`),
    ...(canRestore(t) ? ["restore"] : []),
  ]);
}

/** a set of permission ids written back onto the role's fields (the database level is worked out by the caller) */
export function rolePatch(ids: Set<string>): Pick<MfgUserType, "access" | "accessVer" | "screens" | "perms" | "seePrices" | "finance" | "restore"> {
  return {
    access: areas().flatMap((a) => a.acts.map((x) => accessKey(a.id, x))).filter((k) => ids.has(`acc:${k}`)),
    accessVer: 2,
    screens: screensFromAccess([...ids].filter((k) => k.startsWith("acc:")).map((k) => k.slice(4))),
    perms: [...SUPPLY_PERMS, ...PURCHASE_PERMS].map((p) => p.id).filter((p) => ids.has(p)),
    seePrices: ids.has("prices"),
    finance: FIN_PERMS.map((p) => p.id).filter((p) => ids.has(`fin:${p}`)),
    restore: ids.has("restore"),
  };
}

/** does this member have the permission? The owner has every one; a member without a role has none. */
export function memberCan(member: { id: string; role: string } | null | undefined, lists: MfgLists | null | undefined, perm: SupplyPerm): boolean {
  if (!member) return false;
  if (member.role === "owner") return true;
  if (!lists) return LEVEL_PERMS[member.role as MfgUserType["role"]]?.includes(perm) ?? false;
  const t = userTypeOf(member, lists);
  return !!t && otherPermsOf(t).includes(perm);
}
