/**
 * مطابقة شركات التوصيل والعمولات (Saqr 2026-11-25): لكل حساب تحت التحصيل (طلبات، الفيزا، المحافظ…) وكل شهر،
 * قديش دخل مبيعات، وقديش اتسوى (مستلم + عمولة + ضريبتها)، والباقي اللي لسه ما وصلش،
 * ونسبة العمولة النهائية المخصومة بعد ما يتقفل حساب الشهر.
 */
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, Bike, Lock, Percent, Receipt, Wallet } from "lucide-react";
import { useLive } from "@/data/hooks";
import { cn } from "@/lib/cn";
import { Badge, Card, EmptyState, Select } from "@/ui";
import { ExportButton } from "../ui";
import { deliveryRecon, type ReconMonth } from "./analysis";
import { periodStatus } from "./journal";
import { SETTLEMENT, waitingAccounts } from "./sales";
import { Tiles } from "./Summaries";
import { fmt, GroupTitle, Toolbar } from "./ui";
import { useFinance } from "./useFinance";

const pc = (bp: number | null) => (bp == null ? "—" : `${(bp / 100).toFixed(2)}%`);
const monthName = (m: string) => new Intl.DateTimeFormat("ar-EG-u-nu-latn", { month: "long", year: "numeric" }).format(new Date(`${m}-15T12:00:00Z`));

export default function DeliveryRecon() {
  const fin = useFinance();
  const docs = useLive("finDocs", { where: { kind: SETTLEMENT } }).data;
  const accounts = useMemo(() => waitingAccounts(fin.ix.ordered()), [fin.ix]);
  // طلبات أول شي لو موجود
  const first = accounts.find((a) => /طلبات|talabat/i.test(`${a.name.ar} ${a.name.en}`)) ?? accounts[0];
  const [accountId, setAccountId] = useState("");
  const id = accountId || first?.id || "";
  const rows = useMemo(() => (id ? deliveryRecon(id, fin.entries, docs) : []), [id, fin.entries, docs]);
  const closed = (m: string) => periodStatus(fin.settings, `${m}-01`) !== "open";
  // آخر شهر اتقفل حسابه واتسوى: هو اللي نسبته نهائية
  const last = rows.find((r) => closed(r.month) && r.settled > 0) ?? rows.find((r) => r.settled > 0) ?? null;
  const totals = rows.reduce((t, r) => ({ settled: t.settled + r.settled, fee: t.fee + r.commission + r.commissionVat, open: t.open + r.open }), { settled: 0, fee: 0, open: 0 });

  if (!accounts.length) return <Card><EmptyState icon={<Bike />} title="ما فيه حسابات تحت التحصيل" body="حسابات طلبات والفيزا والمحافظ بتنعمل من شجرة الحسابات، وبتتربط بقنوات البيع وطرق الدفع." /></Card>;

  return (
    <div className="grid gap-5">
      <Toolbar note="التسويات بتتسجل من المبيعات اليومية والتسويات ← تسوية"
        actions={<ExportButton size="sm" file="مطابقة التوصيل" head={["الشهر", "المبيعات", "المسوّى", "المستلم", "العمولة", "ضريبة العمولة", "نسبة العمولة النهائية %", "الباقي", "الحالة"]}
          rows={() => rows.map((r) => [r.month, r.sales / 100000, r.settled / 100000, r.received / 100000, r.commission / 100000, r.commissionVat / 100000, r.rateBp == null ? "" : r.rateBp / 100, r.open / 100000, closed(r.month) ? "مقفول" : "مفتوح"])} />}>
        <Select label="الحساب" className="w-64" value={id} onChange={(e) => setAccountId(e.target.value)} options={accounts.map((a) => ({ value: a.id, label: a.name.ar }))} />
      </Toolbar>

      <Tiles title={last ? `${monthName(last.month)}${closed(last.month) ? " · مقفول" : " · لسه مفتوح"}` : "النسبة النهائية"} tiles={[
        { label: "نسبة العمولة النهائية", value: pc(last?.rateBp ?? null), sub: last ? "العمولة وضريبتها ÷ المبيعات المسواة" : "بتطلع بعد أول تسوية", icon: <Percent />, tone: "brass" },
        { label: "العمولة المخصومة", value: fmt(last ? last.commission + last.commissionVat : 0), sub: last ? `منها ضريبة ${fmt(last.commissionVat)}` : "", icon: <Receipt /> },
        { label: "المستلم فعلاً", value: fmt(last?.received ?? 0), icon: <Wallet /> },
        { label: "لسه ما اتسواش (كل الشهور)", value: fmt(totals.open), sub: totals.settled ? `متوسط النسبة ${pc(Math.round((totals.fee / totals.settled) * 10_000))}` : "", icon: <AlertTriangle />, tone: totals.open > 0 ? "warn" : "ok" },
      ]} />

      <section className="grid gap-2.5">
        <GroupTitle>كل شهر</GroupTitle>
        {rows.length ? (
          <Card className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-[14px]">
              <thead><tr className="text-[12.5px] text-muted">{["الشهر", "المبيعات", "المسوّى", "المستلم", "العمولة + الضريبة", "النسبة النهائية", "الباقي", ""].map((h, i) => <th key={h || i} className={cn("border-b border-line px-3 py-2.5 font-semibold", i && i < 7 ? "text-end" : "text-start")}>{h}</th>)}</tr></thead>
              <tbody>{rows.map((r: ReconMonth) => (
                <tr key={r.month} className="border-t border-line/60">
                  <td className="px-3 py-2 font-semibold">{monthName(r.month)}</td>
                  <td className="num px-3 py-2 text-end" dir="ltr">{fmt(r.sales, "—")}</td>
                  <td className="num px-3 py-2 text-end" dir="ltr">{fmt(r.settled, "—")}</td>
                  <td className="num px-3 py-2 text-end" dir="ltr">{fmt(r.received, "—")}</td>
                  <td className="num px-3 py-2 text-end" dir="ltr">{fmt(r.commission + r.commissionVat, "—")}</td>
                  <td className="num px-3 py-2 text-end font-bold" dir="ltr">{pc(r.rateBp)}</td>
                  <td className={cn("num px-3 py-2 text-end font-semibold", r.open > 0 ? "text-warn" : r.open < 0 ? "text-danger" : "text-muted")} dir="ltr">{fmt(r.open, "0.00")}</td>
                  <td className="px-3 py-2">{closed(r.month) ? <Badge size="sm" tone="ok"><Lock className="size-3" /> مقفول</Badge> : <Badge size="sm" tone="neutral">مفتوح</Badge>}</td>
                </tr>
              ))}</tbody>
            </table>
          </Card>
        ) : <Card><EmptyState compact icon={<Bike />} title="ما فيه حركة على هالحساب" body="المبيعات بتدخله من ورديات الكاشير، والتسويات بتطلعها." /></Card>}
        <p className="text-[13px] text-muted">
          النسبة بتصير نهائية لما يتسجل كشف الشهر كله ويتقفل الشهر من <Link to="/finance/close" className="font-semibold text-brass hover:underline">الإقفال</Link>. الباقي الموجب يعني فلوس لسه عند الشركة، والسالب يعني اتسوى أكتر من المسجل.
        </p>
      </section>
    </div>
  );
}
