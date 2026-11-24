/**
 * أقسام الحسابات: the accounting departments, each with its own summary and pages.
 * The same list feeds the drop-down under الحسابات in the main menu and the section bar inside the page.
 */
import { Bike, CalendarCheck, ChefHat, TrendingUp, CreditCard, FileSpreadsheet, Split, Armchair, ClipboardList, ScanSearch, Store, Banknote, BookOpen, Briefcase, ContactRound, FileBarChart, Flag, Gauge, HandCoins, Landmark, LayoutDashboard, ListTree, Lock, Percent, PiggyBank, ReceiptText, ShoppingCart, SlidersHorizontal, Target, Truck, Users, Wallet } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useMay } from "../useAccess";
import { useFinPerms } from "./perms";
import { useCentralBranch } from "@/shell/nav";
import { useSyncExternalStore } from "react";
import { loadRaw, saveRaw } from "@/lib/storage";

/* ───── الوضع المبسّط (Saqr 2026-11-25): المالك والمدير يشوفوا الشاشات اليومية بس، والمحاسب يفتح الوضع الكامل ───── */
const SIMPLE_KEY = "fin.simple";
const simpleSubs = new Set<() => void>();
const readSimple = () => loadRaw(SIMPLE_KEY) !== "0";
export function setFinSimple(v: boolean) { saveRaw(SIMPLE_KEY, v ? "1" : "0"); simpleSubs.forEach((f) => f()); }
export function useFinSimple(): boolean {
  return useSyncExternalStore((cb) => (simpleSubs.add(cb), () => void simpleSubs.delete(cb)), readSimple, () => true);
}

export interface FinPage {
  to: string; label: string; icon: JSX.Element; end?: boolean; area: string;
  /** shown in الوضع المبسّط too */
  simple?: boolean;
  /** opened from a button on another page: no pill of its own */
  hidden?: boolean;
}
export interface FinSection { id: string; label: string; short?: string; Icon: LucideIcon; icon: JSX.Element; pages: FinPage[] }

const sec = (id: string, label: string, Icon: LucideIcon, pages: FinPage[], short?: string): FinSection => ({ id, label, short, Icon, icon: <Icon />, pages });

/** every department and page, before permissions */
export function allSections(o: { reports: boolean; budget: boolean }): FinSection[] {
  return [
    sec("home", "المؤشرات والملخص", Gauge, [{ to: "/finance", end: true, label: "المؤشرات والملخص", icon: <Gauge />, area: "finance.dashboard", simple: true }], "المؤشرات"),
    sec("general", "الحسابات العامة", Landmark, [
      { to: "/finance/general", label: "ملخص", icon: <LayoutDashboard />, area: "finance.chart" },
      { to: "/finance/chart", label: "شجرة الحسابات", icon: <ListTree />, area: "finance.chart" },
      { to: "/finance/journal", label: "القيود المحاسبية", icon: <BookOpen />, area: "finance.journal" },
      { to: "/finance/treasury", label: "الخزينة والبنوك", icon: <Banknote />, area: "finance.treasury" },
      { to: "/finance/vouchers", label: "سندات القبض والصرف", icon: <ReceiptText />, area: "finance.treasury" },
      { to: "/finance/centres", label: "مراكز التكلفة", icon: <Target />, area: "finance.centres" },
      { to: "/finance/opening", label: "الأرصدة الافتتاحية", icon: <Flag />, area: "finance.opening" },
      { to: "/finance/assets", label: "الأصول", icon: <Armchair />, area: "finance.assets" },
      ...(o.reports ? [{ to: "/finance/reports", label: "التقارير المالية", icon: <FileBarChart />, area: "finance.reports", simple: true }, { to: "/finance/tax", label: "الضرائب", icon: <Percent />, area: "finance.tax" }] : []),
      ...(o.budget ? [{ to: "/finance/budget", label: "الموازنة", icon: <PiggyBank />, area: "finance.budget" }] : []),
      { to: "/finance/close", label: "الإقفال", icon: <Lock />, area: "finance.close" },
      { to: "/finance/pay-methods", label: "طرق الدفع", icon: <CreditCard />, area: "finance.sales" },
      { to: "/finance/settings", label: "الإعدادات وربط الحسابات", icon: <SlidersHorizontal />, area: "finance.settings" },
    ], "العامة"),
    sec("buying", "المشتريات والمصاريف", ShoppingCart, [
      { to: "/finance/buying", label: "ملخص", icon: <LayoutDashboard />, area: "finance.purchases" },
      { to: "/finance/purchases", label: "المشتريات والموردون والمرتجعات", icon: <Truck />, area: "finance.purchases", simple: true },
      { to: "/finance/expenses", label: "المصروفات", icon: <Wallet />, area: "finance.treasury", simple: true },
      { to: "/finance/prices", label: "أسعار الموردين", icon: <TrendingUp />, area: "finance.purchases", simple: true },
    ], "المشتريات"),
    sec("selling", "المبيعات", ReceiptText, [
      { to: "/finance/selling", label: "ملخص", icon: <LayoutDashboard />, area: "finance.sales" },
      { to: "/finance/day", label: "إقفال اليوم", icon: <CalendarCheck />, area: "finance.sales", simple: true },
      { to: "/finance/sales", label: "المبيعات اليومية والتسويات", icon: <ReceiptText />, area: "finance.sales", simple: true },
      { to: "/finance/sales-invoice", label: "فاتورة مبيعات", icon: <FileSpreadsheet />, area: "finance.sales", hidden: true },
      { to: "/finance/delivery-recon", label: "مطابقة التوصيل والعمولات", icon: <Bike />, area: "finance.sales", simple: true },
      { to: "/finance/menu-analysis", label: "تكلفة الأكل وهندسة المنيو", icon: <ChefHat />, area: "finance.sales", simple: true },
      { to: "/finance/channels", label: "قنوات البيع", icon: <Split />, area: "finance.sales" },
      { to: "/pos", label: "الكاشير: صالة وتيك أواي وتوصيل", icon: <Store />, area: "pos" },
      { to: "/orders", label: "الطلبات", icon: <ClipboardList />, area: "orders" },
      { to: "/finance/pos-audit", label: "تدقيق البيع والورديات", icon: <ScanSearch />, area: "finance.sales" },
      { to: "/finance/customers", label: "الزبائن", icon: <ContactRound />, area: "finance.sales" },
    ]),
    sec("staff", "الموظفين", Users, [
      { to: "/finance/staff", label: "ملخص", icon: <LayoutDashboard />, area: "finance.payroll" },
      { to: "/finance/payroll", label: "الرواتب والسلف", icon: <HandCoins />, area: "finance.payroll", simple: true },
      { to: "/finance/staff-moves", label: "العهد والحوافز والخصومات والمدخرات", icon: <Briefcase />, area: "finance.payroll", simple: true },
    ]),
  ];
}

/** the departments and pages this employee may see (المستخدمين ← الأدوار) */
export function useFinSections(): FinSection[] {
  const perms = useFinPerms();
  const may = useMay();
  const central = useCentralBranch();
  const o = { reports: perms.has("reports"), budget: perms.has("budget") || perms.has("profit") };
  // a central-kitchen branch has no till: الكاشير والطلبات are hidden while it's the chosen branch (Saqr 2026-11-24)
  const till = (p: FinPage) => !central || (p.area !== "pos" && p.area !== "orders");
  const simple = useFinSimple();
  // الوضع المبسّط: only the daily pages; a hidden page stays reachable from its button
  const fits = (p: FinPage) => !simple || p.simple || p.hidden;
  return allSections(o).map((g) => ({ ...g, pages: g.pages.filter((p) => may(p.area, "view") && till(p) && fits(p)) })).filter((g) => g.pages.some((p) => !p.hidden));
}


/** الحسابات in the main menu: one drop-down item per department, opening its first page */
export function useFinanceSub() {
  return useFinSections().map((g) => ({ to: g.pages.find((p) => !p.hidden)!.to, label: g.label, Icon: g.Icon, paths: g.pages.map((p) => ({ to: p.to, end: !!p.end })) }));
}
