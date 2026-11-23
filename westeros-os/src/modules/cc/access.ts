/**
 * الصلاحيات التفصيلية (Mohammed, 2026-11-21): for every screen and every tab inside it, a role allows or not
 * مشاهدة، إضافة، تعديل، حذف، استيراد، تصدير — only the actions the tab has.
 *
 * AREAS is the one list: a tab added here shows in the role dialog and is checked on its screen. A screen of the
 * system that has no entry here (a list defined later) gets one area with all six actions, so it is never left
 * without permissions.
 */
import type { MfgLists, MfgUserType } from "@/data/types";
import { SCREENS, screensOf, userTypeOf } from "./lib";

export type Act = "view" | "add" | "edit" | "delete" | "import" | "export";
export const ACTS: { id: Act; label: string }[] = [
  { id: "view", label: "مشاهدة" },
  { id: "add", label: "إضافة" },
  { id: "edit", label: "تعديل" },
  { id: "delete", label: "حذف" },
  { id: "import", label: "استيراد" },
  { id: "export", label: "تصدير" },
];
const ALL: Act[] = ["view", "add", "edit", "delete", "import", "export"];

export interface Area {
  id: string;
  screen: string;
  label: string;
  acts: Act[];
  /** what an action means on this tab, when it is not plain (shown under the row) */
  note?: string;
  /** the screen the tab sat on before it moved (2026-11-22: قائمة المنتجات والخامات was split over المخازن and التصنيع) */
  was?: string;
  /** a ملخص tab added on 2026-11-22: a role saved before then sees it on every screen it opens */
  summary?: boolean;
}

const LISTED: Area[] = [
  { id: "summary", screen: "cc-summary", label: "الملخص", acts: ["view"] },

  { id: "stores.warehouses", screen: "cc-stores", label: "المخازن", acts: ["view", "add", "edit", "delete", "export"] },
  { id: "stores.branches", screen: "cc-stores", label: "الفروع", acts: ["view", "add", "edit", "delete"] },
  { id: "stores.moves", screen: "cc-stores", label: "الحركات المخزنية", acts: ["view", "add", "export"] },
  { id: "stores.count", screen: "cc-stores", label: "جرد المخزن", acts: ["view", "add"] },
  { id: "stores.supply", screen: "cc-stores", label: "طلب توريد", acts: ["view", "add"], note: "التنفيذ والاستلام بيتحددوا من صلاحيات طلبات التوريد تحت. تغيير الفرع بعد الإرسال للإدارة بس." },
  { id: "stores.purchase", screen: "cc-stores", label: "طلب شراء", acts: ["view", "add", "edit", "delete"], note: "التعديل والحذف قبل ما مسؤول المشتريات يبدأ في الطلب." },
  // the ids stay "catalog.*" so the permissions roles already have keep working after the move
  { id: "catalog.raws", screen: "cc-stores", was: "cc-catalog", label: "مواد الخام", acts: ALL },
  { id: "stores.summary", screen: "cc-stores", label: "ملخص المخازن والفروع", acts: ["view"], summary: true },

  { id: "constants", screen: "cc-constants", label: "ثوابت النظام", acts: ["view", "edit"] },

  { id: "mfg.make", screen: "cc-mfg", label: "تصنيع صنف", acts: ["view", "add"] },
  { id: "mfg.recipes", screen: "cc-mfg", label: "الوصفات", acts: ["view", "add", "edit", "delete"] },
  { id: "mfg.log", screen: "cc-mfg", label: "سجل التشغيلات", acts: ["view", "delete", "export"], note: "الحذف: إلغاء التشغيلة." },
  { id: "catalog.products", screen: "cc-mfg", was: "cc-catalog", label: "المنتجات المصنعة", acts: ALL },
  { id: "catalog.sale", screen: "cc-mfg", was: "cc-catalog", label: "أصناف البيع", acts: ALL },
  { id: "mfg.summary", screen: "cc-mfg", label: "ملخص التصنيع", acts: ["view"], summary: true },

  { id: "users.list", screen: "cc-users", label: "المستخدمين", acts: ALL },
  { id: "users.roles", screen: "cc-users", label: "الأدوار", acts: ["view", "add", "edit", "delete"] },
  { id: "users.summary", screen: "cc-users", label: "ملخص المستخدمين", acts: ["view"], summary: true },

  { id: "finance.dashboard", screen: "cc-finance", label: "المؤشرات", acts: ["view"] },
  { id: "finance.chart", screen: "cc-finance", label: "شجرة الحسابات", acts: ["view", "export"] },
  { id: "finance.journal", screen: "cc-finance", label: "القيود اليومية", acts: ["view", "export"] },
  { id: "finance.opening", screen: "cc-finance", label: "الأرصدة الافتتاحية", acts: ["view", "export"] },
  { id: "finance.centres", screen: "cc-finance", label: "مراكز التكلفة", acts: ["view", "export"] },
  { id: "finance.treasury", screen: "cc-finance", label: "الخزينة والبنوك", acts: ["view", "export"] },
  { id: "finance.sales", screen: "cc-finance", label: "المبيعات", acts: ["view", "export"] },
  { id: "finance.purchases", screen: "cc-finance", label: "المشتريات والموردون", acts: ["view", "export"] },
  { id: "finance.payroll", screen: "cc-finance", label: "الرواتب", acts: ["view", "export"] },
  { id: "finance.assets", screen: "cc-finance", label: "الأصول الثابتة", acts: ["view", "export"] },
  { id: "finance.reports", screen: "cc-finance", label: "التقارير المالية", acts: ["view", "export"] },
  { id: "finance.tax", screen: "cc-finance", label: "الضرائب", acts: ["view", "export"] },
  { id: "finance.budget", screen: "cc-finance", label: "الموازنة", acts: ["view", "export"] },
  { id: "finance.close", screen: "cc-finance", label: "الإقفال", acts: ["view"] },
  { id: "finance.settings", screen: "cc-finance", label: "الإعدادات وربط الحسابات", acts: ["view"] },

  { id: "hr.summary", screen: "cc-hr", label: "ملخص الموارد البشرية والتقارير", acts: ["view", "export"] },
  { id: "hr.employees", screen: "cc-hr", label: "الموظفين وملفاتهم", acts: ["view", "add", "edit", "delete", "export"], note: "ملف الموظف: البيانات والمستندات والعهدة والملاحظات. الراتب يحتاج صلاحية رؤية الرواتب تحت." },
  { id: "hr.org", screen: "cc-hr", label: "الهيكل التنظيمي والوظائف", acts: ["view", "add", "edit", "delete", "export"] },
  { id: "hr.recruit", screen: "cc-hr", label: "التوظيف", acts: ["view", "add", "edit", "delete", "export"] },
  { id: "hr.onboard", screen: "cc-hr", label: "استلام الموظف الجديد", acts: ["view", "add", "edit", "delete"] },
  { id: "hr.contracts", screen: "cc-hr", label: "العقود والمستندات", acts: ["view", "add", "edit", "delete", "export"] },
  { id: "hr.schedule", screen: "cc-hr", label: "الورديات", acts: ["view", "edit"] },
  { id: "hr.attendance", screen: "cc-hr", label: "الحضور والبصمة", acts: ["view", "edit", "export"] },
  { id: "hr.requests", screen: "cc-hr", label: "الطلبات والموافقات", acts: ["view", "add", "delete", "export"], note: "الموافقة على الطلبات بتتحدد من صلاحية الموافقة تحت ومن سلسلة كل نوع طلب." },
  { id: "hr.evaluations", screen: "cc-hr", label: "التقييم والأداء", acts: ["view", "add", "edit", "delete", "export"] },
  { id: "hr.training", screen: "cc-hr", label: "التدريب", acts: ["view", "add", "edit", "delete", "export"] },
  { id: "hr.discipline", screen: "cc-hr", label: "الإنذارات والجزاءات", acts: ["view", "add", "edit", "delete", "export"] },
  { id: "hr.exit", screen: "cc-hr", label: "نهاية الخدمة", acts: ["view", "add", "edit", "delete", "export"] },
  { id: "hr.payslips", screen: "cc-hr", label: "قسائم الرواتب", acts: ["view", "add", "delete"], note: "الإضافة: نشر قسائم كشف رواتب للموظفين على صفحتهم." },
  { id: "hr.settings", screen: "cc-hr", label: "إعدادات الموارد البشرية", acts: ["view", "edit"] },
  { id: "menu", screen: "cc-menu", label: "المنيو", acts: ["view", "add", "edit", "delete"], note: "الفئات والأصناف ومجموعات الخيارات وأسعارها، والاستيراد من Bonbell." },

  { id: "pos", screen: "cc-pos", label: "الكاشير", acts: ["view"], note: "البيع والدفع والوردية. الخصومات والإلغاء بعد الإرسال بموافقة مدير." },
  { id: "orders", screen: "cc-orders", label: "الطلبات", acts: ["view"] },
  { id: "kitchen", screen: "cc-kitchen", label: "شاشة المطبخ", acts: ["view"] },

  { id: "delivery", screen: "cc-delivery", label: "خدمة التوصيل", acts: ["view", "edit"], note: "التعديل: إضافة وتعديل وحذف طرق التوصيل والمندوبين." },
];

/** every area of the screens the system has now, in the order of the screens */
export function areas(): Area[] {
  return SCREENS.flatMap((s) => {
    const listed = LISTED.filter((a) => a.screen === s.id);
    return listed.length ? listed : [{ id: s.id, screen: s.id, label: s.label, acts: ALL }];
  });
}
export const areaById = (id: string) => areas().find((a) => a.id === id);

/** `area:act` */
export const accessKey = (area: string, act: Act) => `${area}:${act}`;

/**
 * What a role allows: its ticked list; a role saved before the detailed permissions (no list) keeps every action
 * on every tab of the screens it opened.
 */
export function accessOf(t: MfgUserType): Set<string> {
  if (t.access) {
    const set = new Set(t.access);
    // a list saved before the ملخص tabs: each one shows on the screens the role already sees
    if (!t.accessVer)
      for (const a of areas()) if (a.summary && areas().some((b) => b.screen === a.screen && set.has(accessKey(b.id, "view")))) set.add(accessKey(a.id, "view"));
    return set;
  }
  const open = new Set(screensOf(t));
  return new Set(areas().filter((a) => open.has(a.screen) || (a.was && open.has(a.was))).flatMap((a) => a.acts.map((x) => accessKey(a.id, x))));
}

/** the screens a role opens: those where it may see at least one tab */
export const screensOfRole = (t: MfgUserType): string[] => screensFromAccess(accessOf(t));

/** the screens a list of permissions opens: those with مشاهدة on at least one of their tabs */
export function screensFromAccess(keys: Iterable<string>): string[] {
  const set = new Set(keys);
  return SCREENS.map((s) => s.id).filter((s) => areas().some((a) => a.screen === s && set.has(accessKey(a.id, "view"))));
}

/** may this member do `act` on `area`? The owner may do everything; nothing is allowed without مشاهدة. */
export function memberMay(member: { id: string; role: string } | null | undefined, lists: MfgLists | null | undefined, area: string, act: Act): boolean {
  if (!member) return false;
  if (member.role === "owner") return true;
  const a = areaById(area);
  if (!a) return true; // an area the system does not know: not restricted here
  const t = lists ? userTypeOf(member, lists) : null;
  if (!t) return true; // no roles defined yet: the database level decides
  const set = accessOf(t);
  if (!set.has(accessKey(area, "view"))) return false;
  // an action the tab does not list (e.g. what الحسابات decides with its own permissions) follows مشاهدة
  return !a.acts.includes(act) || set.has(accessKey(area, act));
}
