/** تنبيهات الحسابات: what needs a look today. Pure: the screens hand in what they already loaded. */
import type { FinAccount, FinEntry, FinSettingsData } from "@/data/financeTypes";
import type { Units } from "@/lib/money";
import { monthOf, periodStatus } from "./journal";
import { netByCode } from "./statements";
import { isDebit } from "./tree";
import { fmt } from "./ui";

export interface FinAlert { id: string; tone: "danger" | "warning" | "info"; text: string; to: string }
const NATURE_KINDS: FinAccount["kind"][] = ["cash", "bank", "wallet", "inventory"];
const monthLabel = (m: string) => m.split("-").reverse().join("/");

export function finAlerts(a: { accounts: FinAccount[]; entries: FinEntry[]; settings: FinSettingsData; today: string; stockDiff?: Units; pendingMoves?: number; lateTransit?: number }): FinAlert[] {
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
