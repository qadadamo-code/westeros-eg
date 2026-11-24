/**
 * إقفال اليوم (Saqr 2026-11-25): كل اللي بيحتاجه آخر الليل في صفحة وحدة.
 * الورديات مقفولة؟ الجرد طلع فيه عجز أو زيادة؟ اترحلت للحسابات؟ الكاش اللي لازم يتورّد للبنك، وملخص اليوم على الواتساب.
 */
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, ArrowLeftRight, Banknote, CalendarCheck, CheckCircle2, CircleDollarSign, ClipboardList, MessageCircle, RefreshCw, Scale, Undo2 } from "lucide-react";
import { useViewBranchState } from "@/auth/viewBranch";
import { useDb, useLive } from "@/data/hooks";
import { cn } from "@/lib/cn";
import type { ZReportU } from "@/modules/pos/sale";
import { Badge, Button, Card, EmptyState, Input } from "@/ui";
import { cairoDay } from "./journal";
import { useActor } from "./perms";
import { METHOD_LABEL, POS_FROM } from "./posSync";
import { SALES_DAY, salesOf } from "./sales";
import { Tiles } from "./Summaries";
import { BranchSelect, fmt, GroupTitle, Toolbar } from "./ui";
import { runShiftSync, useShiftSyncState } from "./useStockSync";
import { useFinance } from "./useFinance";

/** يوم الشغل: before 5 AM in Cairo the night still belongs to yesterday */
export function businessDay(now = new Date()): string {
  const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Cairo", hour: "2-digit", hour12: false }).format(now));
  return cairoDay(new Date(now.getTime() - (hour < 5 ? 6 * 3_600_000 : 0)).toISOString());
}
const time = (iso: string | null) => (iso ? new Intl.DateTimeFormat("ar-EG-u-nu-latn", { timeZone: "Africa/Cairo", hour: "2-digit", minute: "2-digit" }).format(new Date(iso)) : "—");

function Step({ ok, warn, title, children }: { ok: boolean; warn?: boolean; title: string; children: React.ReactNode }) {
  return (
    <div className={cn("flex items-start gap-3 rounded-2xl border p-4", ok ? "border-ok/40 bg-ok/5" : warn ? "border-danger/40 bg-danger/5" : "border-brass/40 bg-brass/5")}>
      {ok ? <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-ok" /> : <AlertTriangle className={cn("mt-0.5 size-5 shrink-0", warn ? "text-danger" : "text-brass")} />}
      <div className="grid min-w-0 flex-1 gap-1"><div className="font-semibold">{title}</div><div className="text-[13.5px] text-muted">{children}</div></div>
    </div>
  );
}

export default function DayClose() {
  const fin = useFinance();
  const db = useDb();
  const actor = useActor();
  const sync = useShiftSyncState();
  const [day, setDay] = useState(businessDay);
  const [branch, setBranch] = useViewBranchState();
  const [busy, setBusy] = useState(false);
  const shifts = useLive("shifts").data;
  const docs = useLive("finDocs", { where: { kind: SALES_DAY } }).data;
  const members = useLive("memberships").data;
  const openChecks = useLive("checks", { where: { status: ["open", "bill_requested"] } }).data;
  const who = (id: string | null) => (id ? members.find((m) => m.id === id)?.name ?? "—" : "—");

  const d = useMemo(() => {
    const mine = shifts.filter((s) => cairoDay(s.openedAt) === day && (!branch || s.branchId === branch)).sort((a, b) => a.openedAt.localeCompare(b.openedAt));
    const posted = new Map(docs.filter((x) => x.status === "posted").map((x) => [salesOf(x).shiftId, x]));
    const z = (s: (typeof mine)[number]) => (s.zReport as unknown as ZReportU | null) ?? null;
    const closed = mine.filter((s) => s.status === "closed" && z(s));
    const sum = (g: (r: ZReportU) => number) => closed.reduce((a, s) => a + g(z(s)!), 0);
    const byMethod = new Map<string, number>();
    for (const s of closed) for (const [m, v] of Object.entries(z(s)!.byMethod ?? {})) byMethod.set(m, (byMethod.get(m) ?? 0) + (v as number));
    const waiting = closed.filter((s) => !posted.has(s.id) && cairoDay(s.openedAt) >= POS_FROM);
    return {
      mine, closed, posted, z, byMethod, waiting,
      open: mine.filter((s) => s.status === "open"),
      sales: sum((r) => r.sales.total) - sum((r) => r.returns.total),
      orders: sum((r) => r.sales.count),
      discount: sum((r) => r.sales.discount),
      returns: sum((r) => r.returns.total),
      diff: sum((r) => r.cash.difference ?? 0),
      counted: sum((r) => r.cash.counted ?? r.cash.expected),
      floats: sum((r) => r.cash.opening),
    };
  }, [shifts, docs, day, branch]);
  const unpaid = openChecks.filter((c) => (!branch || c.branchId === branch) && cairoDay(c.openedAt) <= day);
  const deposit = Math.max(0, d.counted - d.floats);

  const whatsapp = () => {
    const lines = [
      `ملخص يوم ${day.split("-").reverse().join("/")}${branch ? ` · ${fin.branchName(branch)}` : ""}`,
      `المبيعات: ${fmt(d.sales)} ج.م (${d.orders} فاتورة)`,
      ...[...d.byMethod].filter(([, v]) => v).map(([m, v]) => `${METHOD_LABEL[m as keyof typeof METHOD_LABEL] ?? m}: ${fmt(v)}`),
      d.discount ? `الخصومات: ${fmt(d.discount)}` : "",
      d.returns ? `المرتجعات: ${fmt(d.returns)}` : "",
      d.diff ? `${d.diff < 0 ? "عجز" : "زيادة"} الدرج: ${fmt(Math.abs(d.diff))}` : "الدرج مظبوط",
      `الكاش للتوريد: ${fmt(deposit)}`,
      unpaid.length ? `طلبات لسه مفتوحة: ${unpaid.length}` : "",
    ].filter(Boolean);
    window.open(`https://wa.me/?text=${encodeURIComponent(lines.join("\n"))}`, "_blank", "noopener");
  };

  return (
    <div className="grid gap-5">
      <Toolbar actions={<Button variant="secondary" icon={<MessageCircle />} onClick={whatsapp} disabled={!d.mine.length}>ابعت الملخص واتساب</Button>}>
        <Input label="اليوم" type="date" className="w-44" dir="ltr" value={day} max={businessDay()} onChange={(e) => setDay(e.target.value || businessDay())} />
        <BranchSelect fin={fin} value={branch} onChange={setBranch} />
      </Toolbar>

      <Tiles title="اليوم" tiles={[
        { label: "صافي المبيعات", value: fmt(d.sales), sub: `${d.orders} فاتورة`, icon: <CircleDollarSign /> },
        { label: d.diff < 0 ? "عجز الدرج" : "زيادة الدرج", value: fmt(d.diff), icon: <Scale />, tone: d.diff < 0 ? "danger" : d.diff > 0 ? "ok" : undefined },
        { label: "الكاش للتوريد", value: fmt(deposit), sub: "المعدود بالدرج ناقص الفكة", icon: <Banknote />, tone: "brass" },
        { label: "المرتجعات والخصومات", value: fmt(d.returns + d.discount), icon: <Undo2 />, tone: "warn" },
      ]} />

      {!d.mine.length ? (
        <Card><EmptyState compact icon={<CalendarCheck />} title="ما فيه ورديات بهاليوم" body="الوردية بتتفتح من الكاشير. اختار يوم تاني أو فرع تاني." /></Card>
      ) : (
        <section className="grid gap-2.5">
          <GroupTitle>خطوات الإقفال</GroupTitle>
          <Step ok={!d.open.length && !unpaid.length} title={d.open.length ? `${d.open.length} وردية لسه مفتوحة` : unpaid.length ? `${unpaid.length} طلب لسه مفتوح ما اندفعش` : "كل الورديات مقفولة"}>
            {d.open.length ? <>اقفلها من <Link to="/pos/shift" className="font-semibold text-brass hover:underline">الكاشير ← الوردية</Link>.</> : unpaid.length ? <>شوفهم من <Link to="/orders" className="font-semibold text-brass hover:underline">الطلبات</Link> وادفعهم أو الغيهم.</> : `${d.closed.length} وردية مقفولة.`}
          </Step>
          <Step ok={!d.diff} warn={d.diff < 0} title={d.diff ? `${d.diff < 0 ? "عجز" : "زيادة"} ${fmt(Math.abs(d.diff))} بجرد الدرج` : "جرد الدرج مظبوط"}>
            {d.diff ? "الفرق بيتسجل لحاله على حساب فروق الخزينة لما الوردية تترحل." : "المعدود طلع زي المتوقع."}
          </Step>
          <Step ok={!d.waiting.length} title={d.waiting.length ? `${d.waiting.length} وردية مستنية الترحيل للحسابات` : "اترحلت للحسابات"}>
            {d.waiting.length ? (
              <span className="flex flex-wrap items-center gap-2">بتترحل لحالها من جهاز مدير أو محاسب، أو اضغط هون:
                <Button size="sm" variant="secondary" icon={<RefreshCw />} loading={busy} onClick={async () => { setBusy(true); try { await runShiftSync(db, actor); } finally { setBusy(false); } }}>رحّل هلأ</Button>
              </span>
            ) : "كل وردية صار لها قيد مبيعات."}
            {sync.problems.map((p) => <span key={p} className="block text-danger">{p}</span>)}
          </Step>
          <Step ok={deposit === 0} title={deposit ? `ورّد ${fmt(deposit)} ج.م للبنك أو الخزينة الرئيسية` : "ما فيه كاش للتوريد"}>
            {deposit ? <span className="flex flex-wrap items-center gap-2">سجّل التوريد كتحويل من خزينة الفرع:<Link to="/finance/vouchers"><Button size="sm" variant="secondary" icon={<ArrowLeftRight />}>سند تحويل</Button></Link></span> : "الدرج فيه الفكة بس."}
          </Step>
        </section>
      )}

      {d.byMethod.size ? (
        <section className="grid gap-2.5">
          <GroupTitle>المحصّل حسب طريقة الدفع</GroupTitle>
          <Card className="grid gap-2 p-4">
            {[...d.byMethod].filter(([, v]) => v).map(([m, v]) => (
              <div key={m} className="flex items-center justify-between text-[14.5px]"><span>{METHOD_LABEL[m as keyof typeof METHOD_LABEL] ?? m}</span><span className="num font-semibold" dir="ltr">{fmt(v)}</span></div>
            ))}
          </Card>
        </section>
      ) : null}

      {d.mine.length ? (
        <section className="grid gap-2.5">
          <GroupTitle>ورديات اليوم</GroupTitle>
          <Card className="divide-y divide-line overflow-hidden">
            {d.mine.map((s) => { const r = d.z(s); return (
              <div key={s.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-[14px]">
                <ClipboardList className="size-4 text-muted" />
                <div className="min-w-0 flex-1"><div className="font-semibold">{s.device}{s.zNumber ? <span className="num ms-2 text-[12.5px] text-muted" dir="ltr">Z{s.zNumber}</span> : null}</div><div className="text-[12.5px] text-muted">{who(s.openedBy)} · <span className="num">{time(s.openedAt)} ← {time(s.closedAt)}</span></div></div>
                {r ? <span className="num font-semibold" dir="ltr">{fmt(r.sales.total - r.returns.total)}</span> : null}
                {s.status === "open" ? <Badge size="sm" tone="primary">مفتوحة</Badge> : d.posted.has(s.id) ? <Badge size="sm" tone="ok">اترحلت</Badge> : <Badge size="sm" tone="warn">مستنية</Badge>}
              </div>
            ); })}
          </Card>
        </section>
      ) : null}
    </div>
  );
}
