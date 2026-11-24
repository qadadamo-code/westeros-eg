/** المخازن والفروع ← الملخص: stock value, movements, requests and what runs low. */
import { useMemo, useState } from "react";
import { AlertTriangle, ArrowLeftRight, Boxes, Building2, PieChart, ShoppingCart, Truck, Wallet, Warehouse } from "lucide-react";
import { useLive } from "@/data/hooks";
import { BarChart, Card, CardHeader, Segmented, StatTile } from "@/ui";
import { num, REQUEST_STATUS, requestOpen, toLine } from "../lib";
import { useCc } from "../useCc";
import { DonutCard, ListCard, money, periods, SPAN_OPTIONS, useStockFigures, type Span } from "../summary/kit";
import { KIND_LABEL } from "./Moves";

export default function StoresSummary() {
  const cc = useCc();
  const f = useStockFigures(cc);
  const requests = useLive("stockRequests").data.filter((r) => cc.inView(r.branchId ?? cc.locations.find((l) => l.id === (r.branchLocationId ?? r.toLocationId))?.branchId));
  const movesAll = useLive("stockMoves", { orderBy: [{ field: "at", dir: "desc" }], limit: 3000 }).data;
  const moves = useMemo(() => { const br = new Map(cc.locations.map((l) => [l.id, l.branchId])); return movesAll.filter((m) => cc.inView(br.get(m.locationId))); }, [movesAll, cc]);
  const [span, setSpan] = useState<Span>("day");
  const flow = useMemo(
    () =>
      periods(span).map((p) => {
        const inP = moves.filter((m) => { const d = m.at.slice(0, 10); return d >= p.from && d <= p.to; });
        const inV = inP.filter((m) => m.qty > 0).reduce((a, m) => a + Math.abs(m.value), 0);
        const outV = inP.filter((m) => m.qty < 0).reduce((a, m) => a + Math.abs(m.value), 0);
        return { key: p.key, label: p.label, value: inP.length, tip: `${inP.length} حركة · دخول ${money(inV)} · خروج ${money(outV)}` };
      }),
    [moves, span],
  );
  const monthAgo = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const kinds = useMemo(() => {
    const m = new Map<string, number>();
    for (const x of moves) if (x.at >= monthAgo) m.set(x.kind, (m.get(x.kind) ?? 0) + 1);
    return [...m.entries()].map(([k, v]) => ({ key: k, label: KIND_LABEL[k as keyof typeof KIND_LABEL] ?? k, value: v }));
  }, [moves, monthAgo]);
  const open = (k: "purchase" | "supply") => requests.filter((r) => r.kind === k && requestOpen(r));
  const status = (k: "purchase" | "supply") => {
    const m = new Map<string, number>();
    for (const r of requests) if (r.kind === k && (requestOpen(r) || r.at >= monthAgo)) m.set(r.status, (m.get(r.status) ?? 0) + 1);
    return [...m.entries()].map(([s, v]) => ({ key: s, label: REQUEST_STATUS[s as keyof typeof REQUEST_STATUS]?.ar ?? s, value: v }));
  };
  const late = requests.filter((r) => requestOpen(r) && r.dueDate && r.dueDate < new Date().toISOString().slice(0, 10)).length;
  return (
    <div className="grid gap-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile index={0} tone="brass" icon={<Wallet />} label="قيمة المخزون" value={<span className="num">{money(f.total)}</span>} sub={`خامات ${money(f.rawValue)} · مصنعات ${money(f.madeValue)}`} />
        <StatTile index={1} icon={<Warehouse />} label="المخازن" value={<span className="num">{cc.viewWarehouses.length}</span>} sub={<span><Building2 className="inline size-3.5" /> الفروع: {cc.branches.filter((b) => cc.inView(b.id)).length}</span>} />
        <StatTile index={2} tone={f.low.length ? "danger" : "ok"} icon={<AlertTriangle />} label="أصناف تحت الحد الأدنى" value={<span className="num">{f.low.length}</span>} sub={`خامات رصيدها صفر: ${f.empty}`} />
        <StatTile index={3} tone="info" icon={<Truck />} label="طلبات توريد مفتوحة" value={<span className="num">{open("supply").length}</span>} sub={<span><ShoppingCart className="inline size-3.5" /> طلبات شراء مفتوحة: {open("purchase").length}{late ? ` · متأخرة: ${late}` : ""}</span>} />
      </div>
      <Card>
        <CardHeader icon={<ArrowLeftRight />} title="الحركات المخزنية" subtitle="عدد الحركات، وقيمة الدخول والخروج عند الوقوف على العمود"
          action={<Segmented<Span> label="الفترة" size="sm" value={span} onChange={setSpan} options={SPAN_OPTIONS} />} />
        <div className="px-5 pb-5"><BarChart data={flow} ariaLabel="الحركات المخزنية" highlight={flow[flow.length - 1]?.key} /></div>
      </Card>
      <div className="grid items-start gap-5 lg:grid-cols-2">
        <DonutCard icon={<PieChart />} title="قيمة المخزون حسب المخزن" rows={f.byLoc} format={money} empty="لا يوجد رصيد في المخازن بعد." />
        <DonutCard icon={<Building2 />} title="قيمة المخزون حسب الفرع" rows={f.byBranch} format={money} empty="لا يوجد رصيد في المخازن بعد." />
        <ListCard icon={<Boxes />} title="أعلى الأصناف قيمة في المخزن" rows={f.topItems} format={(v) => money(v)} empty="لا يوجد رصيد في المخازن بعد." />
        <DonutCard icon={<ArrowLeftRight />} title="أنواع الحركات" subtitle="آخر 30 يوم" rows={kinds} empty="لا توجد حركات في آخر 30 يوم." />
        <DonutCard icon={<Truck />} title="حالات طلبات التوريد" subtitle="المفتوحة، واللي اتعملت في آخر 30 يوم" rows={status("supply")} empty="لا توجد طلبات توريد." />
        <DonutCard icon={<ShoppingCart />} title="حالات طلبات الشراء" subtitle="المفتوحة، واللي اتعملت في آخر 30 يوم" rows={status("purchase")} empty="لا توجد طلبات شراء." />
        <ListCard className="lg:col-span-2" icon={<AlertTriangle />} title="أصناف تحت الحد الأدنى" subtitle="الرصيد الحالي في كل المخازن مقارنة بحد إعادة الطلب"
          rows={f.low.slice(0, 15).map((i) => ({ key: i.id, label: i.name.ar, value: toLine(f.qtyByItem.get(i.id) ?? 0, i), tone: "var(--sf-danger)" }))}
          format={(v) => <span className="num">{num(v)}</span>} empty="مفيش أصناف تحت الحد الأدنى." />
      </div>
    </div>
  );
}
