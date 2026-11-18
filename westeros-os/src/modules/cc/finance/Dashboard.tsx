/** مؤشرات الحسابات: أرقام الفترة مقارنة بما قبلها، التنبيهات، وحركة آخر ستة شهور. */
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Banknote, BellRing, ChevronLeft, CircleDollarSign, HandCoins, ListTree, Package, Percent, Scale, TrendingUp, Truck, Users, Utensils } from "lucide-react";
import { useLive } from "@/data/hooks";
import { cn } from "@/lib/cn";
import { BarChart, Button, Card, EmptyState, StatTile, type Tone } from "@/ui";
import { listsOf } from "../lib";
import { finAlerts } from "./alerts";
import { cairoDay } from "./journal";
import { useFinPerms } from "./perms";
import { previousPeriod } from "./Reports";
import { CHANNELS } from "./sales";
import { incomeStatement, kpis, netByCode } from "./statements";
import { inTransit, postedMoves, stockRecon } from "./sync";
import { addMonths, monthEnd } from "./treasury";
import { BranchSelect, fmt, periodLabel, periodOf, PeriodPicker, today, type Period } from "./ui";
import { useFinance } from "./useFinance";

const pc = (bp: number | null) => (bp == null ? "—" : `${(bp / 100).toFixed(1)}%`);
const delta = (now: number, was: number) => (was ? `${now >= was ? "▲" : "▼"} ${Math.abs(((now - was) / Math.abs(was)) * 100).toFixed(1)}% عن الفترة السابقة` : "");
const points = (now: number | null, was: number | null) => (now == null || was == null ? "" : `${now >= was ? "▲" : "▼"} ${(Math.abs(now - was) / 100).toFixed(1)} نقطة عن الفترة السابقة`);
const TONE: Record<string, string> = { danger: "border-danger/40 bg-danger/10", warning: "border-brass/40 bg-brass/10", info: "border-line bg-surface-2" };

export default function Dashboard() {
  const fin = useFinance();
  const perms = useFinPerms();
  const profit = perms.has("profit");
  const moves = useLive("stockMoves").data;
  const itemRows = useLive("stockItems").data;
  const locRows = useLive("storageLocations").data;
  const docs = useLive("finDocs").data;
  const lists = listsOf(useLive("mfgSettings").data[0]);
  const [period, setPeriod] = useState<Period>(periodOf("month", fin.settings.yearStartMonth));
  const [branch, setBranch] = useState("");
  const f = useMemo(() => ({ from: period.from, to: period.to, branchId: branch || null }), [period, branch]);
  const now = useMemo(() => kpis(fin.accounts, fin.entries, fin.settings, f), [fin.accounts, fin.entries, fin.settings, f]);
  const was = useMemo(() => kpis(fin.accounts, fin.entries, fin.settings, { ...f, ...previousPeriod(f) }), [fin.accounts, fin.entries, fin.settings, f]);
  const compare = !!(f.from && f.to);

  const alerts = useMemo(() => {
    const start = fin.settings.startDate;
    const day = today();
    let stockDiff = 0, pendingMoves = 0, lateTransit = 0;
    if (start) {
      const items = new Map(itemRows.map((i) => [i.id, i])), locations = new Map(locRows.map((l) => [l.id, l]));
      const done = postedMoves(fin.entries);
      pendingMoves = moves.filter((m) => !done.has(m.id) && cairoDay(m.at) >= start).length;
      stockDiff = pendingMoves ? 0 : stockRecon({ accounts: fin.accounts, entries: fin.entries, settings: fin.settings, moves, items, locations, lists, to: day }).reduce((s, r) => s + r.diff, 0);
      lateTransit = inTransit(moves).filter((t) => cairoDay(t.at) >= start && (Date.now() - Date.parse(t.at)) / 86_400_000 > fin.settings.transitDays).length;
    }
    return finAlerts({ accounts: fin.accounts, entries: fin.entries, settings: fin.settings, today: day, stockDiff, pendingMoves, lateTransit, docs });
  }, [fin.accounts, fin.entries, fin.settings, moves, itemRows, locRows, lists, docs]);

  const months = useMemo(() => {
    const cur = today().slice(0, 7);
    return Array.from({ length: 6 }, (_, i) => addMonths(cur, i - 5)).map((m) => {
      const r = incomeStatement(fin.accounts, fin.entries, [{ from: `${m}-01`, to: monthEnd(m), branchId: branch || null }], 1);
      return { month: m, label: m.split("-").reverse().join("/"), sales: r.revenue[0], net: r.net[0], expenses: r.expenses[0] + r.cogs[0] };
    });
  }, [fin.accounts, fin.entries, branch]);
  /** sales of the period by channel, net of tax, with the delivery fees */
  const channels = useMemo(() => {
    const net = netByCode(fin.accounts, fin.entries, f);
    const rows = [...CHANNELS.map((c) => ({ label: c.label, key: c.key as string })), { label: "رسوم التوصيل", key: "sales.fees" }].map((c) => ({ label: c.label, value: -(net.get(fin.settings.links[c.key] ?? "") ?? 0) })).filter((r) => r.value);
    const total = rows.reduce((s, r) => s + r.value, 0);
    return { rows, total, top: Math.max(0, ...rows.map((r) => r.value)) };
  }, [fin.accounts, fin.entries, fin.settings.links, f]);
  const byBranch = useMemo(() => (fin.branches.length > 1 && !branch ? fin.branches.map((b) => ({ b, k: kpis(fin.accounts, fin.entries, fin.settings, { ...f, branchId: b.id }) })) : []), [fin.branches, fin.accounts, fin.entries, fin.settings, f, branch]);

  if (!fin.loading && !fin.accounts.length) return <Card><EmptyState icon={<ListTree />} title="ابدأ بشجرة الحسابات" body="حمّل الشجرة الجاهزة لمطعم أو استوردها من إكسل، وبعدها تظهر المؤشرات هنا." action={<Link to="/finance/chart"><Button>افتح شجرة الحسابات</Button></Link>} /></Card>;

  const tiles: { label: string; value: string; sub?: string; icon: JSX.Element; tone?: Tone; show: boolean }[] = [
    { label: "المبيعات", value: fmt(now.sales), sub: compare ? delta(now.sales, was.sales) : "", icon: <TrendingUp />, show: true },
    { label: "مجمل الربح", value: fmt(now.gross), sub: `${pc(now.grossBp)} من المبيعات`, icon: <CircleDollarSign />, tone: "ok", show: profit },
    { label: "صافي الربح", value: fmt(now.net), sub: [`${pc(now.netBp)} من المبيعات`, compare ? delta(now.net, was.net) : ""].filter(Boolean).join(" · "), icon: <Scale />, tone: now.net < 0 ? "danger" : "ok", show: profit },
    { label: "تكلفة الطعام", value: pc(now.foodCostBp), sub: compare ? points(now.foodCostBp, was.foodCostBp) || fmt(now.cogs) : fmt(now.cogs), icon: <Utensils />, tone: "brass", show: true },
    { label: "الرواتب والأجور", value: pc(now.payrollBp), sub: fmt(now.payroll), icon: <Users />, tone: "info", show: profit },
    { label: "الإيجار", value: pc(now.rentBp), sub: fmt(now.rent), icon: <Percent />, tone: "info", show: profit },
    { label: "الهالك وعجز الجرد", value: pc(now.wasteBp), sub: fmt(now.waste), icon: <Package />, tone: "danger", show: true },
    { label: "النقدية والبنوك", value: fmt(now.cash), sub: "الرصيد في نهاية الفترة", icon: <Banknote />, show: true },
    { label: "مستحق للموردين", value: fmt(now.payables), sub: "الرصيد في نهاية الفترة", icon: <Truck />, tone: "warn", show: true },
    { label: "قيمة المخزون", value: fmt(now.stock), sub: "الرصيد في نهاية الفترة", icon: <Package />, tone: "brass", show: true },
    { label: "نقطة التعادل في الشهر", value: now.breakEven == null ? "—" : fmt(now.breakEven), sub: "المبيعات اللي تغطي المصروفات", icon: <HandCoins />, tone: "neutral", show: profit },
  ];
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-end gap-2">
        <PeriodPicker value={period} onChange={setPeriod} startMonth={fin.settings.yearStartMonth} />
        <BranchSelect fin={fin} value={branch} onChange={setBranch} />
        <span className="pb-2.5 text-[13px] text-muted">{periodLabel(period)}</span>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tiles.filter((t) => t.show).map((t, i) => <StatTile key={t.label} index={i} label={t.label} value={<span className="num" dir="ltr">{t.value}</span>} sub={t.sub} icon={t.icon} tone={t.tone} />)}
      </div>
      <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
        <Card className="grid content-start gap-3 p-4">
          <h2 className="text-[16px] font-bold">المبيعات آخر ستة شهور</h2>
          <BarChart ariaLabel="المبيعات آخر ستة شهور" highlight={today().slice(0, 7)} data={months.map((m) => ({ key: m.month, label: m.label, value: m.sales / 100000, tip: `${m.label}: ${fmt(m.sales)}` }))} />
          {profit ? (
            <div className="overflow-x-auto thin-scrollbar">
              <table className="w-full text-[13.5px]">
                <thead><tr className="text-[12.5px] text-muted">{["الشهر", "المبيعات", "التكلفة والمصروفات", "صافي الربح"].map((h, i) => <th key={h} className={cn("border-b border-line px-2 py-2 font-semibold", i ? "text-end" : "text-start")}>{h}</th>)}</tr></thead>
                <tbody>{months.map((m) => <tr key={m.month} className="border-t border-line/60"><td className="num px-2 py-1.5" dir="ltr">{m.label}</td><td className="num px-2 py-1.5 text-end" dir="ltr">{fmt(m.sales, "—")}</td><td className="num px-2 py-1.5 text-end" dir="ltr">{fmt(m.expenses, "—")}</td><td className={cn("num px-2 py-1.5 text-end font-semibold", m.net < 0 && "text-danger")} dir="ltr">{fmt(m.net, "—")}</td></tr>)}</tbody>
              </table>
            </div>
          ) : null}
        </Card>
        <Card className="grid content-start gap-2 p-4">
          <h2 className="flex items-center gap-2 text-[16px] font-bold"><BellRing className="size-4" />التنبيهات{alerts.length ? <span className="num rounded-full bg-danger/15 px-2 text-[12.5px] text-danger">{alerts.length}</span> : null}</h2>
          {alerts.length ? alerts.map((a) => (
            <Link key={a.id} to={a.to} className={cn("flex items-center gap-2 rounded-xl border px-3 py-2.5 text-[14px] transition-colors hover:brightness-110", TONE[a.tone])}>
              <span className="min-w-0 flex-1">{a.text}</span><ChevronLeft className="size-4 shrink-0 text-muted" />
            </Link>
          )) : <p className="py-6 text-center text-[14px] text-muted">لا توجد تنبيهات. كل شيء في مكانه.</p>}
        </Card>
      </div>
      {channels.rows.length ? (
        <Card className="grid gap-3 p-4">
          <h2 className="text-[16px] font-bold">المبيعات حسب القناة</h2>
          <div className="grid gap-2.5">
            {channels.rows.map((r) => (
              <div key={r.label} className="grid grid-cols-[110px_1fr_auto] items-center gap-3 text-[14px]">
                <span>{r.label}</span>
                <div className="h-2.5 overflow-hidden rounded-full bg-surface-2"><div className="h-full rounded-full bg-primary" style={{ width: `${channels.top ? Math.max(2, (r.value / channels.top) * 100) : 0}%` }} /></div>
                <span className="num text-end" dir="ltr"><b>{fmt(r.value)}</b> <span className="text-[12.5px] text-muted">{channels.total ? `${((r.value / channels.total) * 100).toFixed(0)}%` : ""}</span></span>
              </div>
            ))}
          </div>
        </Card>
      ) : null}
      {byBranch.length ? (
        <Card className="overflow-hidden">
          <h2 className="px-4 pt-4 text-[16px] font-bold">مقارنة الفروع</h2>
          <div className="overflow-x-auto thin-scrollbar">
            <table className="w-full text-[14px]">
              <thead><tr className="text-[12.5px] text-muted">{["الفرع", "المبيعات", "تكلفة الطعام", ...(profit ? ["مجمل الربح", "صافي الربح", "هامش الصافي"] : []), "الهالك"].map((h, i) => <th key={h} className={cn("border-b border-line px-3 py-2.5 font-semibold", i ? "text-end" : "text-start")}>{h}</th>)}</tr></thead>
              <tbody>
                {byBranch.map(({ b, k }) => (
                  <tr key={b.id} className="border-t border-line/60">
                    <td className="px-3 py-2 font-semibold">{b.name.ar}</td>
                    <td className="num px-3 py-2 text-end" dir="ltr">{fmt(k.sales, "—")}</td>
                    <td className="num px-3 py-2 text-end" dir="ltr">{pc(k.foodCostBp)}</td>
                    {profit ? <><td className="num px-3 py-2 text-end" dir="ltr">{fmt(k.gross, "—")}</td><td className={cn("num px-3 py-2 text-end font-semibold", k.net < 0 && "text-danger")} dir="ltr">{fmt(k.net, "—")}</td><td className="num px-3 py-2 text-end" dir="ltr">{pc(k.netBp)}</td></> : null}
                    <td className="num px-3 py-2 text-end" dir="ltr">{pc(k.wasteBp)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}
    </div>
  );
}
