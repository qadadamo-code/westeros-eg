/**
 * أقسام الحسابات: the accounting departments, each with its own summary and pages.
 * The same list feeds the drop-down under الحسابات in the main menu and the section bar inside the page.
 */
import { CreditCard, FileSpreadsheet, Split, Armchair, ClipboardList, ScanSearch, Store, Banknote, BookOpen, Briefcase, ContactRound, FileBarChart, Flag, Gauge, HandCoins, Landmark, LayoutDashboard, ListTree, Lock, Percent, PiggyBank, ReceiptText, ShoppingCart, SlidersHorizontal, Target, Truck, Users, Wallet } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useMay } from "../useAccess";
import { useFinPerms } from "./perms";
import { useCentralBranch } from "@/shell/nav";

export interface FinPage { to: string; label: string; icon: JSX.Element; end?: boolean; area: string }
export interface FinSection { id: string; label: string; short?: string; Icon: LucideIcon; icon: JSX.Element; pages: FinPage[] }

const sec = (id: string, label: string, Icon: LucideIcon, pages: FinPage[], short?: string): FinSection => ({ id, label, short, Icon, icon: <Icon />, pages });

/** every department and page, before permissions */
export function allSections(o: { reports: boolean; budget: boolean }): FinSection[] {
  return [
    sec("home", "المؤشرات والملخص", Gauge, [{ to: "/finance", end: true, label: "المؤشرات والملخص", icon: <Gauge />, area: "finance.dashboard" }], "المؤشرات"),
    sec("general", "الحسابات العامة", Landmark, [
      { to: "/finance/general", label: "ملخص", icon: <LayoutDashboard />, area: "finance.chart" },
      { to: "/finance/chart", label: "شجرة الحسابات", icon: <ListTree />, area: "finance.chart" },
      { to: "/finance/journal", label: "القيود المحاسبية", icon: <BookOpen />, area: "finance.journal" },
      { to: "/finance/treasury", label: "الخزينة والبنوك", icon: <Banknote />, area: "finance.treasury" },
      { to: "/finance/vouchers", label: "سندات القبض والصرف", icon: <ReceiptText />, area: "finance.treasury" },
      { to: "/finance/centres", label: "مراكز التكلفة", icon: <Target />, area: "finance.centres" },
      { to: "/finance/opening", label: "الأرصدة الافتتاحية", icon: <Flag />, area: "finance.opening" },
      { to: "/finance/assets", label: "الأصول", icon: <Armchair />, area: "finance.assets" },
      ...(o.reports ? [{ to: "/finance/reports", label: "التقارير المالية", icon: <FileBarChart />, area: "finance.reports" }, { to: "/finance/tax", label: "الضرائب", icon: <Percent />, area: "finance.tax" }] : []),
      ...(o.budget ? [{ to: "/finance/budget", label: "الموازنة", icon: <PiggyBank />, area: "finance.budget" }] : []),
      { to: "/finance/close", label: "الإقفال", icon: <Lock />, area: "finance.close" },
      { to: "/finance/settings", label: "الإعدادات وربط الحسابات", icon: <SlidersHorizontal />, area: "finance.settings" },
    ], "العامة"),
    sec("buying", "المشتريات والمصاريف", ShoppingCart, [
      { to: "/finance/buying", label: "ملخص", icon: <LayoutDashboard />, area: "finance.purchases" },
      { to: "/finance/purchases", label: "المشتريات والموردون والمرتجعات", icon: <Truck />, area: "finance.purchases" },
      { to: "/finance/expenses", label: "المصروفات", icon: <Wallet />, area: "finance.treasury" },
      { to: "/finance/buying-pay", label: "طرق الدفع", icon: <CreditCard />, area: "finance.purchases" },
    ], "المشتريات"),
    sec("selling", "المبيعات", ReceiptText, [
      { to: "/finance/selling", label: "ملخص", icon: <LayoutDashboard />, area: "finance.sales" },
      { to: "/finance/channels", label: "قنوات البيع", icon: <Split />, area: "finance.sales" },
      { to: "/finance/sales-pay", label: "طرق الدفع", icon: <CreditCard />, area: "finance.sales" },
      { to: "/finance/sales-invoice", label: "فاتورة مبيعات", icon: <FileSpreadsheet />, area: "finance.sales" },
      { to: "/finance/sales", label: "المبيعات اليومية والتسويات", icon: <ReceiptText />, area: "finance.sales" },
      { to: "/pos", label: "الكاشير: صالة وتيك أواي وتوصيل", icon: <Store />, area: "pos" },
      { to: "/orders", label: "الطلبات", icon: <ClipboardList />, area: "orders" },
      { to: "/finance/pos-audit", label: "تدقيق البيع والورديات", icon: <ScanSearch />, area: "finance.sales" },
      { to: "/finance/customers", label: "الزبائن", icon: <ContactRound />, area: "finance.sales" },
    ]),
    sec("staff", "الموظفين", Users, [
      { to: "/finance/staff", label: "ملخص", icon: <LayoutDashboard />, area: "finance.payroll" },
      { to: "/finance/payroll", label: "الرواتب والسلف", icon: <HandCoins />, area: "finance.payroll" },
      { to: "/finance/staff-moves", label: "العهد والحوافز والخصومات والمدخرات", icon: <Briefcase />, area: "finance.payroll" },
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
  return allSections(o).map((g) => ({ ...g, pages: g.pages.filter((p) => may(p.area, "view") && till(p)) })).filter((g) => g.pages.length);
}


/** الحسابات in the main menu: one drop-down item per department, opening its first page */
export function useFinanceSub() {
  return useFinSections().map((g) => ({ to: g.pages[0].to, label: g.label, Icon: g.Icon, paths: g.pages.map((p) => ({ to: p.to, end: !!p.end })) }));
}
