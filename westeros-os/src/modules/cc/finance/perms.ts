/** صلاحيات الحسابات: ticked per user type in المستخدمين. The account owner always has all of them. */
import { useSession } from "@/auth/session";
import { useLive } from "@/data/hooks";
import type { MfgUserType } from "@/data/productionTypes";
import { userTypeOf } from "../lib";

export const FIN_PERMS = [
  { id: "chart.view", label: "عرض الشجرة والأرصدة" },
  { id: "chart.edit", label: "إضافة وتعديل حساب" },
  { id: "chart.restructure", label: "حذف ودمج ونقل حساب" },
  { id: "settings", label: "ربط الحسابات والإعدادات المالية" },
  { id: "journal.enter", label: "إدخال قيد يدوي" },
  { id: "journal.approve", label: "اعتماد وعكس قيد" },
  { id: "vouchers", label: "سندات القبض والصرف والمصروفات" },
  { id: "reports", label: "التقارير المالية" },
  { id: "profit", label: "عرض الأرباح وحقوق الملكية" },
  { id: "budget", label: "الموازنة التقديرية" },
  { id: "close.month", label: "إقفال وفتح شهر" },
  { id: "close.year", label: "إقفال سنة" },
  { id: "branches.all", label: "كل الفروع (بدونها يشوف فروعه فقط في المؤشرات والتقارير والقيود)" },
] as const;
export type FinPerm = (typeof FIN_PERMS)[number]["id"];

const ALL = FIN_PERMS.map((p) => p.id) as FinPerm[];
const BY_ROLE: Record<MfgUserType["role"], FinPerm[]> = {
  admin: ALL,
  manager: ["chart.view", "journal.approve", "reports", "close.month", "branches.all"],
  chef: [],
  kitchen: [],
};
/** What a type may do in الحسابات: its ticked list, else what its level allowed. */
export const finPermsOf = (t: MfgUserType): FinPerm[] => (t.finance as FinPerm[] | undefined) ?? BY_ROLE[t.role];

export function useFinPerms() {
  const { staff } = useSession();
  const lists = useLive("mfgSettings").data[0]?.lists;
  const owner = !staff || staff.role === "owner";
  const type = !owner && lists ? userTypeOf(staff, lists) : null;
  const mine = owner ? ALL : type ? finPermsOf(type) : (staff.role === "admin" || staff.role === "accountant" ? ALL : []);
  const set = new Set<string>(mine);
  return { has: (p: FinPerm) => set.has(p), owner };
}

/** The signed-in user as the journal sees them. */
export function useActor() {
  const { staff } = useSession();
  const perms = useFinPerms();
  return { id: staff?.id ?? null, name: staff?.name ?? "", canApprove: perms.has("journal.approve") };
}
