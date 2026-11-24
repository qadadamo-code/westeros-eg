/**
 * تكلفة الأكل وهندسة المنيو (Saqr 2026-11-25).
 * النظرية: كل صنف انباع بالكاشير × تكلفة وصفته (أصناف البيع). الفعلية: تكلفة المبيعات بالحسابات (من الجرد والصرف).
 * الفرق بينهم هو الهدر أو الصرف الزيادة أو السرقة. وتحتها كل صنف: قديش انباع، قديش بيكلف، وقديش بيربح.
 */
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, ChefHat, CircleDollarSign, Flame, Scale, Utensils } from "lucide-react";
import { useLive } from "@/data/hooks";
import type { MenuItem } from "@/data/types";
import { cn } from "@/lib/cn";
import { useProduction } from "@/modules/production/useProduction";
import { sameItem } from "../menu/menuBranch";
import { Badge, Card, EmptyState, Segmented, Table, type Column } from "@/ui";
import { ExportButton } from "../ui";
import { itemSales, MENU_CLASS, type ItemSales, type MenuClass } from "./analysis";
import { cairoDay } from "./journal";
import { kpis } from "./statements";
import { Tiles, useFilter } from "./Summaries";
import { fmt, GroupTitle } from "./ui";
import { useFinance } from "./useFinance";

const pc = (bp: number | null) => (bp == null ? "—" : `${(bp / 100).toFixed(1)}%`);
const CLASS_TONE: Record<MenuClass, "ok" | "warn" | "primary" | "danger"> = { star: "ok", plowhorse: "warn", puzzle: "primary", dog: "danger" };

export default function MenuAnalysis() {
  const fin = useFinance();
  const prod = useProduction();
  const { f, bar } = useFilter(fin);
  const [tab, setTab] = useState<"cost" | "menu">("cost");
  const menu = useLive("menuItems").data;
  const recipes = useLive("recipes").data;
  // a day before and after the period, then cut by the Cairo day
  const from = f.from ? new Date(Date.parse(f.from) - 86_400_000).toISOString() : undefined;
  const to = f.to ? new Date(Date.parse(f.to) + 2 * 86_400_000).toISOString() : undefined;
  const receiptsLive = useLive("receipts", { ...(f.branchId ? { where: { branchId: f.branchId } } : {}), ...(from ? { gte: { issuedAt: from } } : {}), ...(to ? { lte: { issuedAt: to } } : {}) }).data;

  const data = useMemo(() => {
    const receipts = receiptsLive.filter((r) => { const d = cairoDay(r.issuedAt); return (!f.from || d >= f.from) && (!f.to || d <= f.to); });
    const recipeOf = new Map(recipes.filter((r) => r.ownerType === "menu_item" && !r.scopeItemId && r.lines.length).map((r) => [r.ownerId, r]));
    const byId = new Map(menu.map((m) => [m.id, m]));
    // كل فرع إله منيو: a branch copy without a recipe takes the recipe of the same item in another branch
    const recipeFor = (item: Pick<MenuItem, "id" | "sku" | "name"> | undefined) => {
      if (!item) return null;
      const own = recipeOf.get(item.id);
      if (own) return own;
      const twin = menu.find((m) => m.id !== item.id && recipeOf.has(m.id) && sameItem(m, item));
      return twin ? recipeOf.get(twin.id)! : null;
    };
    const unitCost = (itemId: string, name: string) => {
      const item = byId.get(itemId) ?? menu.find((m) => m.name.ar === name);
      const r = recipeFor(item);
      return r ? Math.round(r.lines.reduce((s, l) => s + l.qty * prod.unitCost(l.itemId), 0) / (r.yieldQty || 1)) : null;
    };
    return itemSales(receipts, unitCost);
  }, [receiptsLive, recipes, menu, prod, f]);

  const actual = useMemo(() => kpis(fin.accounts, fin.entries, fin.settings, f), [fin.accounts, fin.entries, fin.settings, f]);
  const theoBp = data.costed > 0 ? Math.round((data.cost / data.costed) * 10_000) : null;
  const gapBp = theoBp != null && actual.foodCostBp != null ? actual.foodCostBp - theoBp : null;
  const gapMoney = gapBp != null ? Math.round((gapBp / 10_000) * actual.sales) : null;
  const missing = data.rows.filter((r) => r.cost == null);

  const cols: Column<ItemSales>[] = [
    { key: "n", header: "الصنف", cell: (r) => <div className="font-semibold">{r.name}</div> },
    { key: "q", header: "الكمية", align: "end", cell: (r) => <span className="num">{r.qty}</span> },
    { key: "s", header: "المبيعات", align: "end", cell: (r) => <span className="num" dir="ltr">{fmt(r.sales)}</span> },
    { key: "c", header: "التكلفة", align: "end", hideOnMobile: true, cell: (r) => (r.cost == null ? <span className="text-faint">ماله وصفة</span> : <span className="num" dir="ltr">{fmt(r.cost)}</span>) },
    { key: "p", header: "نسبة التكلفة", align: "end", cell: (r) => <span className={cn("num font-semibold", (r.costBp ?? 0) > 3500 && "text-danger")} dir="ltr">{pc(r.costBp)}</span> },
    { key: "m", header: "ربح الوحدة", align: "end", hideOnMobile: true, cell: (r) => <span className="num" dir="ltr">{r.unitMargin == null ? "—" : fmt(r.unitMargin)}</span> },
    { key: "k", header: "التصنيف", cell: (r) => (r.cls ? <Badge size="sm" tone={CLASS_TONE[r.cls]}>{MENU_CLASS[r.cls].label}</Badge> : <span className="text-faint">—</span>) },
  ];

  return (
    <div className="grid gap-5">
      {bar}
      <Tiles title="تكلفة الأكل" tiles={[
        { label: "النظرية (من الوصفات)", value: pc(theoBp), sub: data.costed ? `${fmt(data.cost)} من مبيعات ${fmt(data.costed)}` : "ما فيه مبيعات أصناف إلها وصفة", icon: <ChefHat /> },
        { label: "الفعلية (من الحسابات)", value: pc(actual.foodCostBp), sub: actual.sales ? `${fmt(actual.cogs)} من مبيعات ${fmt(actual.sales)}` : "ما فيه مبيعات بالحسابات", icon: <Utensils />, tone: "brass" },
        { label: "الفرق (هدر أو صرف زيادة)", value: gapBp == null ? "—" : `${gapBp > 0 ? "+" : ""}${(gapBp / 100).toFixed(1)} نقطة`, sub: gapMoney == null ? "بيتحسب لما يكون فيه الاتنين" : `تقريباً ${fmt(Math.abs(gapMoney))} ج.م ${gapMoney > 0 ? "راحت زيادة" : "أقل من المتوقع"}`, icon: <Scale />, tone: gapBp != null && gapBp > 200 ? "danger" : "ok" },
        { label: "المبيعات بالكاشير", value: fmt(data.sales), sub: `${data.qty} صنف مباع`, icon: <CircleDollarSign /> },
      ]} />

      {missing.length ? (
        <Card className="flex flex-wrap items-center gap-2 border-brass/40 bg-brass/5 p-4 text-[14px]">
          <AlertTriangle className="size-4 text-brass" />
          <span className="flex-1"><b className="num">{missing.length}</b> صنف انباع وماله وصفة، فتكلفته مش محسوبة ({missing.slice(0, 4).map((r) => r.name).join("، ")}{missing.length > 4 ? "…" : ""}).</span>
          <Link to="/manufacturing/sale" className="font-semibold text-brass hover:underline">أضف الوصفات من أصناف البيع</Link>
        </Card>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented label="العرض" value={tab} onChange={(v) => setTab(v as typeof tab)} options={[{ value: "cost", label: "تكلفة كل صنف" }, { value: "menu", label: "هندسة المنيو" }]} />
        <ExportButton size="sm" file="تكلفة الأصناف" head={["الصنف", "الكمية", "المبيعات", "التكلفة", "نسبة التكلفة %", "ربح الوحدة", "التصنيف"]}
          rows={() => data.rows.map((r) => [r.name, r.qty, r.sales / 100000, r.cost == null ? "" : r.cost / 100000, r.costBp == null ? "" : r.costBp / 100, r.unitMargin == null ? "" : r.unitMargin / 100000, r.cls ? MENU_CLASS[r.cls].label : ""])} />
      </div>

      {!data.rows.length ? (
        <Card><EmptyState compact icon={<Flame />} title="ما فيه مبيعات بالكاشير بالفترة دي" body="التحليل بيعتمد على فواتير الكاشير. اختار فترة تانية." /></Card>
      ) : tab === "cost" ? (
        <Card className="overflow-hidden"><Table columns={cols} rows={data.rows} rowKey={(r) => r.key} dense /></Card>
      ) : (
        <section className="grid gap-3 sm:grid-cols-2">
          {(Object.keys(MENU_CLASS) as MenuClass[]).map((k) => { const list = data.rows.filter((r) => r.cls === k); return (
            <Card key={k} className="grid content-start gap-2 p-4">
              <div className="flex items-center gap-2"><Badge tone={CLASS_TONE[k]}>{MENU_CLASS[k].label}</Badge><span className="num text-[13px] text-muted">{list.length} صنف</span></div>
              <p className="text-[13px] text-muted">{MENU_CLASS[k].hint}</p>
              {list.length ? <ul className="grid gap-1 text-[14px]">{list.map((r) => <li key={r.key} className="flex items-center justify-between gap-2"><span className="truncate">{r.name}</span><span className="num shrink-0 text-[12.5px] text-muted" dir="ltr">{r.qty} · {pc(r.costBp)}</span></li>)}</ul> : <p className="text-[13px] text-faint">ولا صنف</p>}
            </Card>
          ); })}
          <GroupTitle>بينحسب من مبيعات الكاشير والوصفات: "بينباع كتير" يعني نصيبه أكتر من 70% من النصيب المتساوي، و"ربحه عالي" يعني ربح الوحدة أعلى من المتوسط.</GroupTitle>
        </section>
      )}
    </div>
  );
}
