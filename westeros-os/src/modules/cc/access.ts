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
}

const LISTED: Area[] = [
  { id: "summary", screen: "cc-summary", label: "الملخص", acts: ["view"] },

  { id: "stores.warehouses", screen: "cc-stores", label: "المخازن", acts: ["view", "add", "edit", "delete", "export"] },
  { id: "stores.branches", screen: "cc-stores", label: "الفروع", acts: ["view", "add", "edit", "delete"] },
  { id: "stores.moves", screen: "cc-stores", label: "الحركات المخزنية", acts: ["view", "add", "export"] },
  { id: "stores.count", screen: "cc-stores", label: "جرد المخزن", acts: ["view", "add"] },
  { id: "stores.supply", screen: "cc-stores", label: "طلب توريد", acts: ["view", "add"], note: "التنفيذ والاستلام بيتحددوا من صلاحيات طلبات التوريد تحت. تغيير الفرع بعد الإرسال للإدارة بس." },
  { id: "stores.purchase", screen: "cc-stores", label: "طلب شراء", acts: ["view", "add", "edit", "delete"], note: "التعديل والحذف قبل ما مسؤول المشتريات يبدأ في الطلب." },

  { id: "catalog.raws", screen: "cc-catalog", label: "مواد الخام", acts: ALL },
  { id: "catalog.products", screen: "cc-catalog", label: "المنتجات المصنعة", acts: ALL },
  { id: "catalog.sale", screen: "cc-catalog", label: "أصناف البيع", acts: ALL },

  { id: "constants", screen: "cc-constants", label: "ثوابت النظام", acts: ["view", "edit"] },

  { id: "mfg.make", screen: "cc-mfg", label: "تصنيع صنف", acts: ["view", "add"] },
  { id: "mfg.recipes", screen: "cc-mfg", label: "الوصفات", acts: ["view", "add", "edit", "delete"] },
  { id: "mfg.log", screen: "cc-mfg", label: "سجل التشغيلات", acts: ["view", "delete", "export"], note: "الحذف: إلغاء التشغيلة." },

  { id: "users.list", screen: "cc-users", label: "المستخدمين", acts: ALL },
  { id: "users.roles", screen: "cc-users", label: "الأدوار", acts: ["view", "add", "edit", "delete"] },

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
  if (t.access) return new Set(t.access);
  const open = new Set(screensOf(t));
  return new Set(areas().filter((a) => open.has(a.screen)).flatMap((a) => a.acts.map((x) => accessKey(a.id, x))));
}

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
