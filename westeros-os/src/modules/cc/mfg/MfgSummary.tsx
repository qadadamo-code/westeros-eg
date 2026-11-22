/** التصنيع ← الملخص: production per period, cost per category, the most made products, the chefs, scale differences. */
import { useMemo, useState } from "react";
import { BookOpenCheck, ChefHat, Factory, Layers, PieChart, Scale, UtensilsCrossed, Wallet } from "lucide-react";
import { useLive } from "@/data/hooks";
import { BarChart, Card, CardHeader, Segmented, StatTile } from "@/ui";
import { categoryName, METHOD_LABEL } from "@/modules/production/useProduction";
import { num } from "../lib";
import { useCc } from "../useCc";
import { batchSeries, dayOf, DonutCard, ListCard, money, SPAN_OPTIONS, type Span } from "../summary/kit";

export default function MfgSummary() {
  const cc = useCc();
  const prod = cc.prod;
  const items = useLive("menuItems").data;
  const recipes = useLive("recipes").data;
  const [span, setSpan] = useState<Span>("day");
  const s = useMemo(() => {
    const today = dayOf(new Date());
    const month = today.slice(0, 7);
    const done = prod.batches.filter((b) => b.status === "done");
    const todays = done.filter((b) => b.day === today);
    const monthly = done.filter((b) => b.day.slice(0, 7) === month);
    const byCat = new Map<string, number>();
    const byMethod = new Map<string, number>();
    const byProduct = new Map<string, { label: string; n: number }>();
    const byChef = new Map<string, { label: string; n: number; cost: number }>();
    const diff = new Map<string, { label: string; g: number }>();
    for (const b of monthly) {
      byCat.set(b.category, (byCat.get(b.category) ?? 0) + b.totalCost);
      byMethod.set(b.method, (byMethod.get(b.method) ?? 0) + 1);
      const c = byChef.get(b.chefId) ?? { label: b.chefName, n: 0, cost: 0 };
      c.n += 1;
      c.cost += b.totalCost;
      byChef.set(b.chefId, c);
      for (const o of b.outputs) {
        const p = byProduct.get(o.productId) ?? { label: o.name.ar, n: 0 };
        p.n += 1;
        byProduct.set(o.productId, p);
        if (o.scaleDiffG) {
          const d = diff.get(o.productId) ?? { label: o.name.ar, g: 0 };
          d.g += Math.abs(o.scaleDiffG);
          diff.set(o.productId, d);
        }
      }
    }
    const active = prod.products.filter((p) => p.active);
    const saleActive = items.filter((i) => i.active !== false);
    const withLines = new Set(recipes.filter((r) => r.ownerType === "menu_item" && !r.scopeItemId && r.lines.length).map((r) => r.ownerId));
    return {
      done,
      todays,
      monthly,
      monthCost: monthly.reduce((a, b) => a + b.totalCost, 0),
      products: active.length,
      noRecipe: active.filter((p) => !p.recipeDefined).length,
      sale: saleActive.length,
      saleNoLines: saleActive.filter((i) => !withLines.has(i.id)).length,
      byCat: [...byCat.entries()].map(([k, v]) => ({ key: k, label: categoryName(prod.categories, k).ar, value: v })),
      byMethod: [...byMethod.entries()].map(([k, v]) => ({ key: k, label: METHOD_LABEL[k as keyof typeof METHOD_LABEL]?.ar ?? k, value: v })),
      byProduct: [...byProduct.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, 10).map(([k, v]) => ({ key: k, label: v.label, value: v.n })),
      byChef: [...byChef.entries()].sort((a, b) => b[1].n - a[1].n).map(([k, v]) => ({ key: k, label: v.label, value: v.n })),
      diff: [...diff.entries()].sort((a, b) => b[1].g - a[1].g).slice(0, 10).map(([k, v]) => ({ key: k, label: v.label, value: v.g / 1000, tone: "var(--sf-warn)" })),
    };
  }, [prod.batches, prod.products, prod.categories, items, recipes]);
  const data = useMemo(() => batchSeries(s.done, span), [s.done, span]);
  return (
    <div className="grid gap-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile index={0} icon={<Factory />} label="تشغيلات اليوم" value={<span className="num">{s.todays.length}</span>} sub={money(s.todays.reduce((a, b) => a + b.totalCost, 0))} />
        <StatTile index={1} tone="brass" icon={<Wallet />} label="تكلفة انتاج الشهر" value={<span className="num">{money(s.monthCost)}</span>} sub={`${s.monthly.length} تشغيلة`} />
        <StatTile index={2} tone="info" icon={<ChefHat />} label="المنتجات المصنعة" value={<span className="num">{s.products}</span>} sub={`بدون وصفة: ${s.noRecipe}`} />
        <StatTile index={3} tone={s.saleNoLines ? "warn" : "ok"} icon={<UtensilsCrossed />} label="أصناف البيع" value={<span className="num">{s.sale}</span>} sub={`بدون مكونات: ${s.saleNoLines}`} />
      </div>
      <Card>
        <CardHeader icon={<Factory />} title="انجاز الانتاج" subtitle="عدد التشغيلات، وتكلفتها عند الوقوف على العمود"
          action={<Segmented<Span> label="الفترة" size="sm" value={span} onChange={setSpan} options={SPAN_OPTIONS} />} />
        <div className="px-5 pb-5"><BarChart data={data} ariaLabel="انجاز الانتاج" highlight={data[data.length - 1]?.key} /></div>
      </Card>
      <div className="grid items-start gap-5 lg:grid-cols-2">
        <DonutCard icon={<PieChart />} title="تكلفة الانتاج حسب الفئة" subtitle="الشهر الحالي" rows={s.byCat} format={money} empty="لا توجد تشغيلات هذا الشهر." />
        <DonutCard icon={<Layers />} title="التشغيلات حسب طريقة التصنيع" subtitle="الشهر الحالي" rows={s.byMethod} empty="لا توجد تشغيلات هذا الشهر." />
        <ListCard icon={<BookOpenCheck />} title="أكثر المنتجات تصنيعاً" subtitle="عدد التشغيلات، الشهر الحالي" rows={s.byProduct} format={(v) => <span className="num">{v} تشغيلة</span>} empty="لا توجد تشغيلات هذا الشهر." />
        <ListCard icon={<ChefHat />} title="انجاز الشيفات" subtitle="عدد التشغيلات، الشهر الحالي" rows={s.byChef} format={(v) => <span className="num">{v} تشغيلة</span>} empty="لا توجد تشغيلات هذا الشهر." />
        <ListCard className="lg:col-span-2" icon={<Scale />} title="فرق الميزان والهدر" subtitle="مجموع الفرق لكل منتج بالكيلو، الشهر الحالي" rows={s.diff} format={(v) => <span className="num">{num(v)} كجم</span>} empty="لا يوجد فرق ميزان هذا الشهر." />
      </div>
    </div>
  );
}
