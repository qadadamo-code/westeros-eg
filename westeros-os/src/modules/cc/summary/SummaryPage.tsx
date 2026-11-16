/** 1- الملخص: charts of production (daily, weekly, monthly), of each chef's day, of the product store, and general figures. */
import { useMemo, useState } from "react";
import { AlarmClock, BarChart3, ChefHat, Factory, Package, ShoppingCart, Truck, Wallet } from "lucide-react";
import { useLive } from "@/data/hooks";
import type { MfgBatch } from "@/data/types";
import { formatMoney } from "@/lib/money";
import { PageHeader } from "@/shell/PageHeader";
import { BarList } from "@/modules/marketing/ui";
import { BarChart, Card, CardHeader, Segmented, StatTile, type BarDatum } from "@/ui";
import { num, toLine } from "../lib";
import { useCc } from "../useCc";

type Span = "day" | "week" | "month";
const dayOf = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
const money = (u: number) => formatMoney(u, { lang: "ar", whole: true });

/** Production per period: number of batches, with the production cost in the tip. */
function series(batches: MfgBatch[], span: Span, now: Date): BarDatum[] {
  const out: BarDatum[] = [];
  const add = (key: string, label: string, from: string, to: string) => {
    const b = batches.filter((x) => x.day >= from && x.day <= to);
    out.push({ key, label, value: b.length, tip: `${b.length} تشغيلة · ${money(b.reduce((a, x) => a + x.totalCost, 0))}` });
  };
  if (span === "day")
    for (let i = 13; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
      add(dayOf(d), `${d.getDate()}/${d.getMonth() + 1}`, dayOf(d), dayOf(d));
    }
  else if (span === "week")
    for (let i = 7; i >= 0; i--) {
      const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i * 7);
      const start = new Date(end.getFullYear(), end.getMonth(), end.getDate() - 6);
      add(dayOf(start), `${start.getDate()}/${start.getMonth() + 1}`, dayOf(start), dayOf(end));
    }
  else
    for (let i = 5; i >= 0; i--) {
      const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 0);
      add(dayOf(start), `${start.getMonth() + 1}/${start.getFullYear()}`, dayOf(start), dayOf(end));
    }
  return out;
}

export default function SummaryPage() {
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
  const data = useMemo(() => series(s.done, span, s.now), [s.done, s.now, span]);
  const stock = useMemo(
    () => prod.products.filter((p) => p.active).map((p) => ({ p, item: cc.itemById.get(p.stockItemId), qty: cc.onHand(p.stockItemId) })).filter((x) => x.item).sort((a, b) => b.qty - a.qty),
    [prod.products, cc],
  );
  const open = (k: "purchase" | "supply") => requests.filter((r) => r.kind === k && r.status === "in_progress").length;
  return (
    <div className="grid gap-5">
      <PageHeader icon={<BarChart3 />} title="الملخص" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile index={0} icon={<Factory />} label="تشغيلات اليوم" value={<span className="num">{s.todays.length}</span>} sub={money(s.todays.reduce((a, b) => a + b.totalCost, 0))} />
        <StatTile index={1} tone="brass" icon={<Wallet />} label="تكلفة انتاج الشهر" value={<span className="num">{money(s.monthCost)}</span>} />
        <StatTile index={2} tone="info" icon={<ShoppingCart />} label="طلبات شراء قيد التنفيذ" value={<span className="num">{open("purchase")}</span>} sub={<span><Truck className="inline size-3.5" /> طلبات توريد قيد التنفيذ: {open("supply")}</span>} />
        <StatTile index={3} tone={s.expiring ? "danger" : "ok"} icon={<AlarmClock />} label="تشغيلات تنتهي صلاحيتها خلال يوم" value={<span className="num">{s.expiring}</span>} />
      </div>
      <Card>
        <CardHeader icon={<Factory />} title="انجاز الانتاج" subtitle="عدد التشغيلات، وتكلفتها عند الوقوف على العمود"
          action={<Segmented<Span> label="الفترة" size="sm" value={span} onChange={setSpan} options={[{ value: "day", label: "يومي" }, { value: "week", label: "اسبوعي" }, { value: "month", label: "شهري" }]} />} />
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
      </div>
    </div>
  );
}
