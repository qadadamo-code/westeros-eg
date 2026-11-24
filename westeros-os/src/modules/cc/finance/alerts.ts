/** تنبيهات الحسابات: what needs a look today. Pure: the screens hand in what they already loaded. */
import type { FinAccount, FinDoc, FinEntry, FinSettingsData } from "@/data/financeTypes";
import type { Units } from "@/lib/money";
import { depreciationDue } from "./assets";
import { priceChanges } from "./analysis";
import { monthOf, periodStatus } from "./journal";
import { PAYROLL, payrollOf } from "./payroll";
import { supplierBook } from "./purchases";
import { netByCode } from "./statements";
import { isDebit } from "./tree";
import { vatRows } from "./vat";
import { fmt } from "./ui";

export interface FinAlert { id: string; tone: "danger" | "warning" | "info"; text: string; to: string }
const NATURE_KINDS: FinAccount["kind"][] = ["cash", "bank", "wallet", "inventory"];
const monthLabel = (m: string) => m.split("-").reverse().join("/");

export function finAlerts(a: { accounts: FinAccount[]; entries: FinEntry[]; settings: FinSettingsData; today: string; stockDiff?: Units; pendingMoves?: number; lateTransit?: number; docs?: FinDoc[] }): FinAlert[] {
  const out: FinAlert[] = [];
  if (!a.accounts.length) return out;
  if (!a.settings.startDate) out.push({ id: "start", tone: "info", text: "لم يحدد تاريخ بداية القيود التلقائية، فحركات المخازن والتصنيع لا تسجل قيودها بعد.", to: "/finance/settings" });
  const pending = a.entries.filter((e) => e.status === "pending").length;
  if (pending) out.push({ id: "pending", tone: "warning", text: `${pending} قيد ينتظر الاعتماد`, to: "/finance/journal" });
  const drafts = a.entries.filter((e) => e.status === "draft").length;
  if (drafts) out.push({ id: "drafts", tone: "info", text: `${drafts} قيد مسودة لم يرحل`, to: "/finance/journal" });
  if (a.pendingMoves) out.push({ id: "moves", tone: "warning", text: `${a.pendingMoves} حركة مخزنية لم يسجل قيدها بعد`, to: "/finance/reports/stock" });
  if (a.stockDiff) out.push({ id: "stock", tone: "danger", text: `فرق ${fmt(Math.abs(a.stockDiff))} ج.م بين قيمة المخازن ورصيد حسابات المخزون`, to: "/finance/reports/stock" });
  if (a.lateTransit) out.push({ id: "transit", tone: "warning", text: `${a.lateTransit} تحويل خرج من مخزنه ولم يستلم منذ أكثر من ${a.settings.transitDays} يوم`, to: "/finance/reports/stock" });
  const open = [...new Set(a.entries.filter((e) => e.status === "posted" && monthOf(e.date) < monthOf(a.today)).map((e) => monthOf(e.date)))].filter((m) => periodStatus(a.settings, `${m}-01`) === "open").sort();
  if (open.length) out.push({ id: "close", tone: "warning", text: open.length === 1 ? `شهر ${monthLabel(open[0])} لم يقفل` : `${open.length} شهور لم تقفل، أقدمها ${monthLabel(open[0])}`, to: "/finance/close" });
  if (a.docs?.length) {
    const book = supplierBook(a.docs, a.entries, a.today);
    const late = book.filter((b) => b.overdue > 0), overdue = late.reduce((s, b) => s + b.overdue, 0), soon = book.reduce((s, b) => s + b.soon, 0);
    if (overdue) out.push({ id: "ap-late", tone: "danger", text: `${fmt(overdue)} ج.م مستحقة للموردين فات ميعادها (${late.length === 1 ? late[0].doc.name : `${late.length} موردين`})`, to: "/finance/purchases" });
    if (soon) out.push({ id: "ap-soon", tone: "warning", text: `${fmt(soon)} ج.م للموردين تستحق خلال 7 أيام`, to: "/finance/purchases" });
    const unpaid = a.docs.filter((d) => d.kind === PAYROLL && d.status === "posted");
    if (unpaid.length) out.push({ id: "payroll", tone: "warning", text: `رواتب مستحقة لم تصرف: ${fmt(unpaid.reduce((s, d) => s + payrollOf(d).net, 0))} ج.م`, to: "/finance/payroll" });
    // أسعار الموردين: a rise of 5% or more on an invoice of the last 30 days (Saqr 2026-11-25)
    const since = new Date(Date.parse(`${a.today}T00:00:00Z`) - 30 * 86_400_000).toISOString().slice(0, 10);
    const up = priceChanges(a.docs).filter((c) => c.changeBp >= 500 && c.date >= since);
    if (up.length) out.push({ id: "prices", tone: "warning", text: `${up.length} خامة سعرها طلع 5% أو أكتر بآخر فاتورة شراء`, to: "/finance/prices" });
    const dep = depreciationDue(a.docs, monthOf(a.today)).filter((d) => d.month < monthOf(a.today));
    if (dep.length) out.push({ id: "depr", tone: "warning", text: `إهلاك ${new Set(dep.map((d) => d.month)).size} شهر لم يسجل بعد`, to: "/finance/assets" });
  }
  const vat = vatRows(a.accounts, a.entries, a.settings).filter((r) => !r.settled && r.month < monthOf(a.today));
  if (vat.length) out.push({ id: "vat", tone: vat.some((r) => r.payable > 0) ? "danger" : "info", text: vat.length === 1 ? `ضريبة القيمة المضافة عن ${monthLabel(vat[0].month)} لم تتسوى${vat[0].payable ? ` (${fmt(vat[0].payable)} ج.م)` : ""}` : `ضريبة القيمة المضافة عن ${vat.length} شهور لم تتسوى`, to: "/finance/tax" });
  const net = netByCode(a.accounts, a.entries, { to: a.today });
  for (const acc of a.accounts) {
    if (!acc.postable || !acc.active) continue;
    const bal = (isDebit(acc.type) ? 1 : -1) * (net.get(acc.code) ?? 0);
    const to = `/finance/reports/ledger?account=${acc.id}`;
    if (bal < 0 && NATURE_KINDS.includes(acc.kind)) out.push({ id: `neg:${acc.id}`, tone: "danger", text: `رصيد "${acc.name.ar}" بالسالب (${fmt(bal)})`, to });
    else if (acc.alertMin != null && bal < acc.alertMin) out.push({ id: `min:${acc.id}`, tone: "warning", text: `رصيد "${acc.name.ar}" ${fmt(bal)} أقل من الحد ${fmt(acc.alertMin)}`, to });
    if (acc.alertMax != null && bal > acc.alertMax) out.push({ id: `max:${acc.id}`, tone: "warning", text: `رصيد "${acc.name.ar}" ${fmt(bal)} تجاوز الحد ${fmt(acc.alertMax)}`, to });
  }
  return out;
}
