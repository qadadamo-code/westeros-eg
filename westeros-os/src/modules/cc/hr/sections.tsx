/** أقسام الموارد البشرية: the same list feeds the drop-down under الموارد البشرية in the main menu and the section bar inside the page. */
import { Award, BarChart3, BookOpenCheck, Briefcase, CalendarDays, ClipboardCheck, Clock, FileSignature, FileText, Gavel, IdCard, Inbox, LayoutDashboard, LogOut, Network, Settings2, UserPlus, Users, Wallet } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useMay } from "../useAccess";

export interface HrPageDef { to: string; label: string; icon: JSX.Element; end?: boolean; area: string }
export interface HrSection { id: string; label: string; Icon: LucideIcon; pages: HrPageDef[] }
const sec = (id: string, label: string, Icon: LucideIcon, pages: HrPageDef[]): HrSection => ({ id, label, Icon, pages });

export const ALL_SECTIONS: HrSection[] = [
  sec("home", "الملخص والتقارير", LayoutDashboard, [
    { to: "/hr", end: true, label: "الملخص", icon: <LayoutDashboard />, area: "hr.summary" },
    { to: "/hr/reports", label: "التقارير", icon: <BarChart3 />, area: "hr.summary" },
  ]),
  sec("people", "الموظفين", Users, [
    { to: "/hr/employees", label: "الموظفين وملفاتهم", icon: <IdCard />, area: "hr.employees" },
    { to: "/hr/contracts", label: "العقود والمستندات", icon: <FileSignature />, area: "hr.contracts" },
    { to: "/hr/payslips", label: "قسائم الرواتب", icon: <Wallet />, area: "hr.payslips" },
  ]),
  sec("org", "الهيكل والوظائف", Network, [
    { to: "/hr/org", label: "الهيكل التنظيمي", icon: <Network />, area: "hr.org" },
    { to: "/hr/jobs", label: "الوظائف وصلاحياتها", icon: <Briefcase />, area: "hr.org" },
  ]),
  sec("hiring", "التوظيف والاستلام", UserPlus, [
    { to: "/hr/recruit", label: "التوظيف", icon: <UserPlus />, area: "hr.recruit" },
    { to: "/hr/onboarding", label: "استلام الموظف الجديد", icon: <ClipboardCheck />, area: "hr.onboard" },
  ]),
  sec("time", "الورديات والحضور", Clock, [
    { to: "/hr/schedule", label: "الورديات", icon: <CalendarDays />, area: "hr.schedule" },
    { to: "/hr/attendance", label: "الحضور والبصمة", icon: <Clock />, area: "hr.attendance" },
  ]),
  sec("requests", "الطلبات والموافقات", Inbox, [
    { to: "/hr/requests", label: "الطلبات والموافقات", icon: <Inbox />, area: "hr.requests" },
  ]),
  sec("growth", "التقييم والتدريب", Award, [
    { to: "/hr/evaluations", label: "التقييم والأداء", icon: <Award />, area: "hr.evaluations" },
    { to: "/hr/training", label: "التدريب", icon: <BookOpenCheck />, area: "hr.training" },
  ]),
  sec("discipline", "الإنذارات ونهاية الخدمة", Gavel, [
    { to: "/hr/discipline", label: "الإنذارات والجزاءات", icon: <Gavel />, area: "hr.discipline" },
    { to: "/hr/exit", label: "نهاية الخدمة", icon: <LogOut />, area: "hr.exit" },
  ]),
  sec("settings", "الإعدادات", Settings2, [
    { to: "/hr/settings", label: "إعدادات الموارد البشرية", icon: <Settings2 />, area: "hr.settings" },
    { to: "/hr/fields", label: "الحقول الإضافية", icon: <FileText />, area: "hr.settings" },
  ]),
];

export function useHrSections(): HrSection[] {
  const may = useMay();
  return ALL_SECTIONS.map((g) => ({ ...g, pages: g.pages.filter((p) => may(p.area, "view")) })).filter((g) => g.pages.length);
}
export function useHrSub() {
  return useHrSections().map((g) => ({ to: g.pages[0].to, label: g.label, Icon: g.Icon, paths: g.pages.map((p) => ({ to: p.to, end: !!p.end })) }));
}
