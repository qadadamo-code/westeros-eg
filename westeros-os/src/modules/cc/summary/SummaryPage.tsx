/**
 * 1- الملخص: the general picture of every menu: production (daily, weekly, monthly), each chef's day, the product
 * store, stock value and what runs low, requests, cost per category, and a door to each menu's own ملخص.
 */
import { AreaGate, useMay } from "../useAccess";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AlarmClock, AlertTriangle, BarChart3, ChefHat, ChevronLeft, Factory, Landmark, Package, PieChart, ShoppingCart, Truck, Users, Wallet, Warehouse } from "lucide-react";
import { useLive } from "@/data/hooks";
import { PageHeader } from "@/shell/PageHeader";
import { BarList } from "@/modules/marketing/ui";
import { categoryName } from "@/modules/production/useProduction";
import { BarChart, Card, CardHeader, Segmented, StatTile } from "@/ui";
import { num, requestOpen, toLine } from "../lib";
import { useCc } from "../useCc";
import { FINANCE_ON } from "../finance/flag";
import { screenAllowed } from "@/modules/screens";
import { batchSeries, dayOf, Donut, DonutCard, money, SPAN_OPTIONS, useStockFigures, type Span } from "./kit";

export default function SummaryPage() {
  return <AreaGate id="summary"><SummaryPageBody /></AreaGate>;
}

const SCREEN_OF: Record<string, string> = { "stores.summary": "cc-stores", "mfg.summary": "cc-mfg", "users.summary": "cc-users", "finance.dashboard": "cc-finance" };

function SummaryPageBody() {
  const cc = useCc();
  const prod = cc.prod;
  const requests = useLive("stockRequests").data;
  const [span, setSpan] = useState<Span>("day");
  const s = useMemo(() => {
    const now = new Date();
    const today = dayOf(now);
    const done = prod.batches.filter((b) => b.status === "done");
    const todays = done.filter((b) => b.day === today);
    const byChef = new Map<string, { name: string; n: number; cost: number }>();
    for (const b of todays) {
      const c = byChef.get(b.chefId) ?? { name: b.chefName, n: 0, cost: 0 };
      c.n += 1;
      c.cost += b.totalCost;
      byChef.set(b.chefId, c);
    }
    const soon = Date.now() + 24 * 3_600_000;
    const expiring = done.filter((b) => b.outputs.some((o) => Date.parse(o.expiresAt) <= soon && Date.parse(o.expiresAt) > Date.now() - 7 * 86_400_000)).length;
    return { now, done, todays, byChef: [...byChef.entries()].sort((a, b) => b[1].n - a[1].n), expiring, monthCost: done.filter((b) => b.day.slice(0, 7) === today.slice(0, 7)).reduce((a, b) => a + b.totalCost, 0) };
  }, [prod.batches]);
  const data = useMemo(() => batchSeries(s.done, span, s.now), [s.done, s.now, span]);
  const f = useStockFigures(cc);
  const may = useMay();
  const members = useLive("memberships").data.filter((m) => m.active);
  const byCat = useMemo(() => {
    const month = dayOf(new Date()).slice(0, 7);
    const m = new Map<string, number>();
    for (const b of s.done) if (b.day.slice(0, 7) === month) m.set(b.category, (m.get(b.category) ?? 0) + b.totalCost);
    return [...m.entries()].map(([k, v]) => ({ key: k, label: categoryName(prod.categories, k).ar, value: v }));
  }, [s.done, prod.categories]);
  const doors = [
    { to: "/stores/summary", area: "stores.summary", icon: <Warehouse />, title: "ملخص المخازن والفروع", sub: "قيمة المخزون، الحركات، الطلبات، النواقص" },
    { to: "/manufacturing/summary", area: "mfg.summary", icon: <Factory />, title: "ملخص التصنيع", sub: "الانتاج، التكلفة، المنتجات، الشيفات، فرق الميزان" },
    { to: "/users/summary", area: "users.summary", icon: <Users />, title: "ملخص المستخدمين", sub: "الموظفين حسب الدور والفرع وآخر دخول" },
    ...(FINANCE_ON ? [{ to: "/finance", area: "finance.dashboard", icon: <Landmark />, title: "مؤشرات الحسابات", sub: "المبيعات، المصروفات، الأرباح، الخزينة" }] : []),
  ].filter((d) => may(d.area, "view") && screenAllowed(SCREEN_OF[d.area]));
  const stock = useMemo(
    () => prod.products.filter((p) => p.active).map((p) => ({ p, item: cc.itemById.get(p.stockItemId), qty: cc.onHand(p.stockItemId) })).filter((x) => x.item).sort((a, b) => b.qty - a.qty),
    [prod.products, cc],
  );
  const open = (k: "purchase" | "supply") => requests.filter((r) => r.kind === k && requestOpen(r)).length;
  return (
    <div className="grid gap-5">
      <PageHeader icon={<BarChart3 />} title="الملخص" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile index={0} icon={<Factory />} label="تشغيلات اليوم" value={<span className="num">{s.todays.length}</span>} sub={money(s.todays.reduce((a, b) => a + b.totalCost, 0))} />
        <StatTile index={1} tone="brass" icon={<Wallet />} label="تكلفة انتاج الشهر" value={<span className="num">{money(s.monthCost)}</span>} />
        <StatTile index={2} tone="info" icon={<ShoppingCart />} label="طلبات شراء قيد التنفيذ" value={<span className="num">{open("purchase")}</span>} sub={<span><Truck className="inline size-3.5" /> طلبات توريد قيد التنفيذ: {open("supply")}</span>} />
        <StatTile index={3} tone={s.expiring ? "danger" : "ok"} icon={<AlarmClock />} label="تشغيلات تنتهي صلاحيتها خلال يوم" value={<span className="num">{s.expiring}</span>} />
        <StatTile index={4} tone="brass" icon={<Warehouse />} label="قيمة المخزون" value={<span className="num">{money(f.total)}</span>} sub={`خامات ${money(f.rawValue)} · مصنعات ${money(f.madeValue)}`} />
        <StatTile index={5} tone={f.low.length ? "danger" : "ok"} icon={<AlertTriangle />} label="أصناف تحت الحد الأدنى" value={<span className="num">{f.low.length}</span>} sub={`خامات رصيدها صفر: ${f.empty}`} />
        <StatTile index={6} tone="info" icon={<ChefHat />} label="المنتجات المصنعة" value={<span className="num">{prod.products.filter((p) => p.active).length}</span>} sub={`مواد خام: ${cc.raws.filter((r) => r.active).length}`} />
        <StatTile index={7} icon={<Users />} label="الموظفين النشطين" value={<span className="num">{members.length}</span>} sub={`المخازن: ${cc.warehouses.length} · الفروع: ${cc.branches.length}`} />
      </div>
      <Card>
        <CardHeader icon={<Factory />} title="انجاز الانتاج" subtitle="عدد التشغيلات، وتكلفتها عند الوقوف على العمود"
          action={<Segmented<Span> label="الفترة" size="sm" value={span} onChange={setSpan} options={SPAN_OPTIONS} />} />
        <div className="px-5 pb-5"><BarChart data={data} ariaLabel="انجاز الانتاج" highlight={data[data.length - 1]?.key} /></div>
      </Card>
      <div className="grid items-start gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader icon={<ChefHat />} title="انجاز شيف الانتاج اليومي" subtitle="تشغيلات كل شيف اليوم" />
          <div className="px-5 pb-5">
            {s.byChef.length ? <BarList rows={s.byChef.map(([id, c]) => ({ key: id, label: c.name, value: c.n }))} format={(v) => <span className="num">{v} تشغيلة</span>} /> : <p className="text-[14px] text-muted">لا توجد تشغيلات اليوم.</p>}
          </div>
        </Card>
        <Card>
          <CardHeader icon={<Package />} title="كميات مخزن المنتجات" subtitle="الرصيد الحالي لكل منتج مصنع" />
          <div className="px-5 pb-5">
            {stock.length ? <BarList rows={stock.map(({ p, item, qty }) => ({ key: p.id, label: p.name.ar, value: toLine(qty, item!) }))} format={(v) => <span className="num">{num(v)}</span>} /> : <p className="text-[14px] text-muted">لا توجد منتجات مصنعة بعد.</p>}
          </div>
        </Card>
        <DonutCard icon={<PieChart />} title="تكلفة الانتاج حسب الفئة" subtitle="الشهر الحالي" rows={byCat} format={money} empty="لا توجد تشغيلات هذا الشهر." />
        <Card>
          <CardHeader icon={<Warehouse />} title="قيمة المخزون حسب المخزن" />
          <div className="px-5 pb-5"><Donut rows={f.byLoc} format={money} empty="لا يوجد رصيد في المخازن بعد." /></div>
        </Card>
      </div>
      {doors.length ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {doors.map((d) => (
            <Link key={d.to} to={d.to} className="group flex items-center gap-3 rounded-[20px] border border-line bg-surface px-4 py-3.5 hover:border-primary/50 hover:bg-surface-2">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary [&_svg]:size-5">{d.icon}</span>
              <span className="min-w-0 flex-1"><span className="block text-[15px] font-bold">{d.title}</span><span className="block truncate text-[12.5px] text-muted">{d.sub}</span></span>
              <ChevronLeft className="size-4 text-muted transition-transform group-hover:-translate-x-0.5" />
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}
