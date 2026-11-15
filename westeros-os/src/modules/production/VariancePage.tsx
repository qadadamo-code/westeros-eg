/** المعياري والفعلي: recipe standard against what each batch really used, by product, chef and ingredient. */
import { useMemo, useState } from "react";
import { ChefHat, Coins, Scale, Scissors, TrendingUp } from "lucide-react";
import { Link } from "react-router-dom";
import { useT } from "@/i18n/i18n";
import { formatMoney } from "@/lib/money";
import { Section } from "@/modules/marketing/ui";
import { Badge, Card, EmptyState, Segmented, Skeleton, StatTile, Table, type Column } from "@/ui";
import { fmtKg } from "./ui";
import { useProduction } from "./useProduction";
import { varianceReport, type BatchVariance, type ChefGroup, type ItemGroup, type VarianceReport } from "./variance";

const bp = (diff: number, std: number) => (std > 0 ? Math.round((diff * 10_000) / std) : 0);
const pctText = (b: number) => `${b > 0 ? "+" : ""}${Math.round(b / 10) / 10}%`;
const tone = (b: number): "danger" | "warn" | "ok" => (b > 500 ? "danger" : b > 200 ? "warn" : "ok");

export default function VariancePage() {
  const { L, lang, loc } = useT();
  const prod = useProduction();
  const [days, setDays] = useState("30");
  const rep = useMemo(() => {
    const to = new Date().toISOString();
    const from = new Date(Date.now() - Number(days) * 86_400_000).toISOString();
    return varianceReport(prod.batches, prod.productById, from, to, { unitCost: prod.unitCost, name: (id) => prod.itemById.get(id)?.name });
  }, [prod.batches, prod.productById, prod.unitCost, prod.itemById, days]);
  const money = (u: number, signed = false) => formatMoney(u, { lang, whole: Math.abs(u) >= 10_000_000, signed });
  const t = rep.totals;
  const netBp = bp(t.net, t.standardCost);
  const debrisBp = t.mainKg > 0 ? Math.round((t.debrisKg * 10_000) / t.mainKg) : 0;
  const itemUnit = (id: string) => prod.itemById.get(id)?.baseUnit ?? "g";
  const qty = (n: number, id: string) => {
    const unit = itemUnit(id);
    const big = unit !== "pc" && Math.abs(n) >= 1000;
    return <span className="num whitespace-nowrap">{Math.round((big ? n / 1000 : n) * 100) / 100} <span className="text-[11.5px] text-muted">{unit === "pc" ? L("قطعة", "pc") : unit === "ml" ? (big ? L("لتر", "L") : L("مل", "ml")) : big ? L("كجم", "kg") : L("جم", "g")}</span></span>;
  };
  const diffCell = (v: number) => <span className={`num font-semibold whitespace-nowrap ${v > 0 ? "text-danger" : v < 0 ? "text-ok" : "text-muted"}`}>{money(v, true)}</span>;

  type P = VarianceReport["byProduct"][number];
  const productCols: Column<P>[] = [
    { key: "n", header: L("المنتج", "Product"), cell: (r) => <span className="font-semibold">{loc(r.name2)}</span> },
    { key: "b", header: L("تشغيلات", "Batches"), align: "end", hideOnMobile: true, cell: (r) => <span className="num">{r.batches}</span> },
    { key: "s", header: L("تكلفة الوصفة", "Recipe cost"), align: "end", hideOnMobile: true, cell: (r) => <span className="num whitespace-nowrap">{money(r.standardCost)}</span> },
    { key: "a", header: L("الفعلي", "Actual"), align: "end", hideOnMobile: true, cell: (r) => <span className="num whitespace-nowrap">{money(r.actualCost)}</span> },
    { key: "d", header: L("الفرق", "Difference"), align: "end", cell: (r) => diffCell(r.diffValue) },
    { key: "p", header: "%", align: "end", cell: (r) => <Badge size="sm" tone={tone(bp(r.diffValue, r.standardCost))}><bdi dir="ltr">{pctText(bp(r.diffValue, r.standardCost))}</bdi></Badge> },
  ];
  const chefCols: Column<ChefGroup>[] = [
    { key: "n", header: L("الشيف", "Chef"), cell: (r) => <span className="font-semibold whitespace-nowrap">{r.name}</span> },
    { key: "b", header: L("تشغيلات", "Batches"), align: "end", cell: (r) => <span className="num">{r.batches}</span> },
    { key: "d", header: L("فرق عن الوصفة", "Against recipe"), align: "end", cell: (r) => (r.standardCost ? <span className="grid justify-items-end">{diffCell(r.diffValue)}<span className="num text-[11.5px] text-muted" dir="ltr">{pctText(bp(r.diffValue, r.standardCost))}</span></span> : <span className="text-faint">—</span>) },
    { key: "deb", header: L("الدوبريه", "Trimmings"), align: "end", cell: (r) => (r.mainKg ? <span className="grid justify-items-end"><span className="num whitespace-nowrap">{fmtKg(r.debrisKg, lang)} · {Math.round((r.debrisKg * 1000) / r.mainKg) / 10}%</span><span className="num text-[11.5px] text-muted">{money(r.debrisValue)}</span></span> : <span className="text-faint">—</span>) },
  ];
  const itemCols: Column<ItemGroup>[] = [
    { key: "n", header: L("الخامة", "Ingredient"), cell: (r) => <span className="font-semibold">{loc(r.name)}</span> },
    { key: "s", header: L("حسب الوصفة", "By recipe"), align: "end", hideOnMobile: true, cell: (r) => qty(r.standard, r.itemId) },
    { key: "a", header: L("المصروف فعلاً", "Actually used"), align: "end", hideOnMobile: true, cell: (r) => qty(r.actual, r.itemId) },
    { key: "q", header: L("فرق الكمية", "Quantity"), align: "end", cell: (r) => <span className={r.diff > 0 ? "text-danger" : "text-ok"}>{qty(r.diff, r.itemId)}</span> },
    { key: "d", header: L("قيمة الفرق", "Value"), align: "end", cell: (r) => diffCell(r.diffValue) },
  ];
  const batchCols: Column<BatchVariance>[] = [
    { key: "n", header: L("الباتش", "Batch"), cell: (r) => <span className="num text-[13px] whitespace-nowrap" dir="ltr">{r.batch.number}</span> },
    { key: "p", header: L("المنتج", "Product"), cell: (r) => <span className="font-semibold">{r.batch.outputs.map((o) => loc(o.name)).join("، ")}</span> },
    { key: "c", header: L("الشيف", "Chef"), hideOnMobile: true, cell: (r) => <span className="whitespace-nowrap">{r.batch.chefName}</span> },
    { key: "w", header: L("أكبر فرق", "Biggest line"), hideOnMobile: true, cell: (r) => (r.lines[0] ? <span className="text-[13px] text-muted">{loc(r.lines[0].name)} {qty(r.lines[0].diff, r.lines[0].itemId)}</span> : <span className="text-faint">—</span>) },
    { key: "d", header: L("الفرق", "Difference"), align: "end", cell: (r) => diffCell(r.diffValue) },
    { key: "pc", header: "%", align: "end", cell: (r) => <Badge size="sm" tone={tone(bp(r.diffValue, r.standardCost))}><bdi dir="ltr">{pctText(bp(r.diffValue, r.standardCost))}</bdi></Badge> },
  ];

  if (prod.loading) return <Skeleton className="h-96" rounded="rounded-[20px]" />;
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented size="sm" label={L("الفترة", "Period")} value={days} onChange={setDays} options={[{ value: "1", label: L("اليوم", "Today") }, { value: "7", label: L("٧ أيام", "7 days") }, { value: "30", label: L("٣٠ يوم", "30 days") }, { value: "90", label: L("٩٠ يوم", "90 days") }]} />
        <Link to="/inventory/reports" className="text-[13px] font-semibold text-primary hover:underline">{L("فروق الخامات مقابل المبيعات في تقارير المخزن", "Raw materials against sales: inventory reports")}</Link>
      </div>
      {!t.batches ? (
        <Card><EmptyState icon={<Scale />} title={L("لا توجد تشغيلات في الفترة دي", "No batches in this period")} body={L("أول ما الشيف يسجل تشغيلات، هتظهر هنا مقارنة المصروف الفعلي بالوصفة لكل منتج وكل شيف.", "Once batches are recorded, the comparison of what was used against the recipe shows here.")} /></Card>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile index={0} tone={t.net > 0 ? "danger" : "ok"} icon={<TrendingUp />} label={L("صافي الفرق عن الوصفات", "Net against recipes")} value={<span className="num">{money(t.net, true)}</span>} sub={t.standardCost ? <><bdi dir="ltr">{pctText(netBp)}</bdi> {L("من تكلفة الوصفة", "of recipe cost")}</> : undefined} />
            <StatTile index={1} tone="brass" icon={<Coins />} label={L("صرف زيادة عن الوصفة", "Used over recipe")} value={<span className="num">{money(t.over)}</span>} sub={L(`وفر ${money(t.under)}`, `saved ${money(t.under)}`)} />
            <StatTile index={2} tone="warn" icon={<Scissors />} label={L("قيمة الدوبريه", "Trimmings value")} value={<span className="num">{money(t.debrisValue)}</span>} sub={t.mainKg ? `${fmtKg(t.debrisKg, lang)} · ${Math.round(debrisBp / 10) / 10}%` : L("لا توجد تشغيلات دجاج أو لحم", "No chicken or meat batches")} />
            <StatTile index={3} tone="info" icon={<Scale />} label={L("تشغيلات تمت مقارنتها", "Batches compared")} value={<span className="num">{t.compared} / {t.batches}</span>} sub={t.noStandard ? L(`${t.noStandard} بدون وصفة محفوظة`, `${t.noStandard} without a saved recipe`) : L("كلها لها وصفة", "All have a recipe")} />
          </div>
          <p className="rounded-xl border border-line bg-surface-2 px-4 py-2.5 text-[13.5px] text-muted">
            {L(
              "المقارنة بين كميات الوصفة الحالية للمنتج والكميات اللي الشيف سجلها في التشغيلة، بأسعار نفس التشغيلة. الأحمر صرف زيادة والأخضر وفر. المنتج اللي وصفته لسه فاضية بيدخل المقارنة من بعد أول تشغيلة تتحفظ كوصفة.",
              "Each batch's recorded quantities against the product's current recipe, at the batch's own prices. Red is overuse, green is saving. A product joins the comparison once its recipe is saved.",
            )}
          </p>
          <div className="grid items-start gap-4 2xl:grid-cols-2">
            <Section icon={<ChefHat />} title={L("حسب الشيف", "By chef")} bodyClass="px-0 pb-0"><Table dense columns={chefCols} rows={rep.byChef} rowKey={(r) => r.key} /></Section>
            <Section icon={<Scale />} title={L("حسب المنتج", "By product")} bodyClass="px-0 pb-0"><Table dense columns={productCols} rows={rep.byProduct} rowKey={(r) => r.key} empty={<p className="p-5 text-[14px] text-muted">{L("لا توجد منتجات لها وصفة في الفترة دي.", "No products with a recipe in this period.")}</p>} /></Section>
          </div>
          <Section icon={<Coins />} title={L("الخامات الأكثر فرقاً", "Ingredients with the biggest difference")} bodyClass="px-0 pb-0"><Table dense columns={itemCols} rows={rep.byItem.slice(0, 15)} rowKey={(r) => r.itemId} empty={<p className="p-5 text-[14px] text-muted">{L("كل التشغيلات مطابقة للوصفات.", "Every batch matches its recipe.")}</p>} /></Section>
          <Section icon={<TrendingUp />} title={L("التشغيلات", "Batches")} subtitle={L("مرتبة من الأكثر صرفاً", "Highest overuse first")} bodyClass="px-0 pb-0"><Table dense columns={batchCols} rows={rep.rows.slice(0, 30)} rowKey={(r) => r.batch.id} empty={<p className="p-5 text-[14px] text-muted">{L("لا توجد تشغيلات لها وصفة للمقارنة.", "No batches with a recipe to compare.")}</p>} /></Section>
        </>
      )}
    </div>
  );
}
