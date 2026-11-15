import { lazy, Suspense, useMemo } from "react";
import { Link, Route, Routes } from "react-router-dom";
import { AlarmClock, BookOpenCheck, CalendarCheck, ChefHat, ClipboardList, Factory, LayoutDashboard, PlusCircle, Scale, Settings2, Wallet } from "lucide-react";
import { useSession } from "@/auth/session";
import { useT } from "@/i18n/i18n";
import { formatMoney } from "@/lib/money";
import { BarList, RouteTabs } from "@/modules/marketing/ui";
import { PageHeader } from "@/shell/PageHeader";
import { Badge, Card, CardHeader, EmptyState, LinkButton, Skeleton, StatTile, Table, type Column } from "@/ui";
import { cairoDay } from "./calc";
import { ExpiryBadge, expiryTone, fmtDateTime, outQtyText } from "./ui";
import { CATEGORY_LABEL, useProduction, type Prod } from "./useProduction";

const NewBatchPage = lazy(() => import("./NewBatchPage"));
const BatchesPage = lazy(() => import("./BatchesPage"));
const ProductsPage = lazy(() => import("./ProductsPage"));
const SettingsPage = lazy(() => import("./SettingsPage"));
const PlanPage = lazy(() => import("./PlanPage"));
const VariancePage = lazy(() => import("./VariancePage"));

export default function ProductionPage() {
  const { L } = useT();
  const { can } = useSession();
  const prod = useProduction();
  const expiring = useMemo(() => expiringOutputs(prod).length, [prod]);
  return (
    <div className="grid gap-5">
      <PageHeader
        icon={<Factory />}
        kicker={L("المطبخ المركزي", "Central kitchen")}
        title={L("التصنيع", "Production")}
        subtitle={L("كل تشغيلة باسم الشيف: تكلفة، دوبريه، باتش وستيكر صلاحية", "Every batch signed by its chef: cost, trimmings, batch number and expiry sticker")}
        actions={can("production.run") ? <LinkButton to="/production/new" icon={<PlusCircle />}>{L("تشغيلة جديدة", "New batch")}</LinkButton> : null}
      />
      <RouteTabs
        label={L("أقسام التصنيع", "Production sections")}
        items={[
          { to: "/production", end: true, label: L("المتابعة", "Overview"), icon: <LayoutDashboard />, count: expiring || null },
          { to: "/production/plan", label: L("خطة اليوم", "Today's plan"), icon: <CalendarCheck /> },
          ...(can("production.run") ? [{ to: "/production/new", label: L("تشغيلة جديدة", "New batch"), icon: <PlusCircle /> }] : []),
          { to: "/production/batches", label: L("سجل التشغيلات", "Batch log"), icon: <ClipboardList /> },
          { to: "/production/products", label: L("المنتجات والريسبي", "Products & recipes"), icon: <BookOpenCheck /> },
          ...(can("production.manage") ? [{ to: "/production/variance", label: L("المعياري والفعلي", "Standard vs actual"), icon: <Scale /> }] : []),
          ...(can("production.manage") ? [{ to: "/production/settings", label: L("الثوابت", "Constants"), icon: <Settings2 /> }] : []),
        ]}
      />
      <Suspense fallback={<Skeleton className="h-96" rounded="rounded-[20px]" />}>
        <Routes>
          <Route index element={<Overview prod={prod} />} />
          <Route path="plan" element={<PlanPage />} />
          <Route path="new" element={<NewBatchPage />} />
          <Route path="variance" element={<VariancePage />} />
          <Route path="batches" element={<BatchesPage />} />
          <Route path="products" element={<ProductsPage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Routes>
      </Suspense>
    </div>
  );
}

/** products of live batches that expire within a day or expired during the last week */
function expiringOutputs(prod: Prod) {
  const now = Date.now();
  return prod.batches
    .filter((b) => b.status === "done")
    .flatMap((b) => b.outputs.map((o) => ({ b, o })))
    .filter(({ o }) => {
      const t = Date.parse(o.expiresAt);
      return t <= now + 86_400_000 && t > now - 7 * 86_400_000;
    })
    .sort((a, b) => Date.parse(a.o.expiresAt) - Date.parse(b.o.expiresAt));
}

function Overview({ prod }: { prod: Prod }) {
  const { L, lang, loc } = useT();
  const { can } = useSession();
  const s = useMemo(() => {
    const live = prod.batches.filter((b) => b.status === "done");
    const today = cairoDay(new Date().toISOString());
    const month = today.slice(0, 7);
    const weekAgo = cairoDay(new Date(Date.now() - 6 * 86_400_000).toISOString());
    const sum = (xs: typeof live) => xs.reduce((a, b) => a + b.totalCost, 0);
    const todays = live.filter((b) => b.day === today);
    const week = live.filter((b) => b.day >= weekAgo);
    const monthly = live.filter((b) => b.day.startsWith(month));
    const byChef = new Map<string, { name: string; n: number; cost: number }>();
    for (const b of monthly) {
      const c = byChef.get(b.chefId) ?? { name: b.chefName, n: 0, cost: 0 };
      c.n++;
      c.cost += b.totalCost;
      byChef.set(b.chefId, c);
    }
    // ملخص الانتاج: the last batch of every product
    const last = new Map<string, { b: (typeof live)[number]; o: (typeof live)[number]["outputs"][number] }>();
    for (const b of live) for (const o of b.outputs) if (!last.has(o.productId)) last.set(o.productId, { b, o });
    const spark = Array.from({ length: 7 }, (_, i) => {
      const d = cairoDay(new Date(Date.now() - (6 - i) * 86_400_000).toISOString());
      return live.filter((b) => b.day === d).length;
    });
    return { todays, todayCost: sum(todays), week, weekCost: sum(week), monthly, monthCost: sum(monthly), byChef: [...byChef.entries()].sort((a, b) => b[1].n - a[1].n), last: [...last.values()], spark };
  }, [prod.batches]);
  const expiring = useMemo(() => expiringOutputs(prod), [prod]);
  type LastRow = (typeof s.last)[number];
  const columns: Column<LastRow>[] = [
    { key: "p", header: L("المنتج", "Product"), cell: (r) => <span className="font-semibold whitespace-nowrap">{loc(r.o.name)}</span> },
    { key: "c", header: L("القسم", "Category"), hideOnMobile: true, cell: (r) => <span className="text-muted">{loc(CATEGORY_LABEL[r.b.category])}</span> },
    { key: "n", header: L("آخر باتش", "Last batch"), cell: (r) => <span className="num text-[13px] whitespace-nowrap" dir="ltr">{r.b.number}</span> },
    { key: "d", header: L("التاريخ", "Date"), hideOnMobile: true, cell: (r) => <span className="num text-[13px] whitespace-nowrap text-muted">{fmtDateTime(r.b.madeAt, lang)}</span> },
    { key: "chef", header: L("الشيف", "Chef"), hideOnMobile: true, cell: (r) => <span className="whitespace-nowrap">{r.b.chefName}</span> },
    { key: "q", header: L("الكمية", "Quantity"), align: "end", cell: (r) => <span className="num whitespace-nowrap">{outQtyText(r.o, lang)}</span> },
    { key: "u", header: L("سعر الوحدة", "Unit cost"), align: "end", cell: (r) => <span className="num font-semibold whitespace-nowrap">{formatMoney(r.o.unitCost, { lang })} <span className="text-[11.5px] font-normal text-muted">/ {r.o.unit === "kg" ? L("كجم", "kg") : L("قطعة", "pc")}</span></span> },
  ];
  if (prod.loading) return <Skeleton className="h-96" rounded="rounded-[20px]" />;
  if (!prod.batches.length)
    return (
      <Card>
        <EmptyState
          icon={<Factory />}
          title={L("لا توجد تشغيلات بعد", "No batches yet")}
          body={L("سجل أول تشغيلة: اختر طريقة التصنيع، اكتب الكميات، والنظام يحسب التكلفة ويطبع ستيكر الباتش باسم الشيف.", "Record the first batch: choose the method, type the quantities, and the system costs it and prints the chef-signed sticker.")}
          action={can("production.run") ? <LinkButton to="/production/new" icon={<PlusCircle />}>{L("تشغيلة جديدة", "New batch")}</LinkButton> : undefined}
        />
      </Card>
    );
  return (
    <div className="grid gap-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile index={0} icon={<Factory />} label={L("تشغيلات اليوم", "Batches today")} value={<span className="num">{s.todays.length}</span>} sub={formatMoney(s.todayCost, { lang, whole: true })} spark={s.spark} />
        <StatTile index={1} tone="brass" icon={<Wallet />} label={L("تكلفة إنتاج آخر 7 أيام", "Production cost, 7 days")} value={<span className="num">{formatMoney(s.weekCost, { lang, whole: true })}</span>} sub={L(`${s.week.length} تشغيلة`, `${s.week.length} batches`)} />
        <StatTile index={2} tone="info" icon={<ChefHat />} label={L("تشغيلات الشهر", "Batches this month")} value={<span className="num">{s.monthly.length}</span>} sub={formatMoney(s.monthCost, { lang, whole: true })} />
        <StatTile index={3} tone={expiring.length ? "danger" : "ok"} icon={<AlarmClock />} label={L("صلاحية تنتهي خلال يوم", "Expiring within a day")} value={<span className="num">{expiring.length}</span>} sub={expiring.length ? L("راجع القائمة تحت", "See the list below") : L("كله سليم", "All good")} />
      </div>
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Card className="overflow-hidden">
          <CardHeader icon={<ClipboardList />} title={L("ملخص الإنتاج", "Production summary")} subtitle={L("آخر تشغيلة لكل منتج وسعر إنتاجه الحالي", "Each product's last batch and current production cost")} action={<Link to="/production/batches" className="text-[13px] font-semibold text-primary hover:underline">{L("كل السجل", "Full log")}</Link>} />
          <Table columns={columns} rows={s.last} rowKey={(r) => r.o.productId} dense />
        </Card>
        <div className="grid gap-5">
          <Card>
            <CardHeader icon={<AlarmClock />} title={L("تنبيهات الصلاحية", "Expiry alerts")} />
            {expiring.length ? (
              <ul className="grid gap-2 px-5 pb-5">
                {expiring.slice(0, 8).map(({ b, o }, i) => (
                  <li key={i} className="flex items-center gap-2 rounded-xl border border-line px-3 py-2">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14px] font-semibold">{loc(o.name)}</span>
                      <span className="num block text-[12px] text-muted" dir="ltr">{b.number}</span>
                    </span>
                    {expiryTone(o.expiresAt) === "danger" ? <Badge tone="danger" size="sm">{L("منتهي", "Expired")}</Badge> : <ExpiryBadge expiresAt={o.expiresAt} />}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-5 pb-5 text-[14px] text-muted">{L("لا يوجد منتج قارب على الانتهاء.", "Nothing is close to expiry.")}</p>
            )}
          </Card>
          <Card>
            <CardHeader icon={<ChefHat />} title={L("تشغيلات كل شيف هذا الشهر", "Batches per chef this month")} />
            <div className="px-5 pb-5">
              {s.byChef.length ? <BarList rows={s.byChef.map(([id, c]) => ({ key: id, label: c.name, value: c.n }))} format={(v) => <span className="num">{v}</span>} /> : <p className="text-[14px] text-muted">{L("لا توجد تشغيلات هذا الشهر.", "No batches this month.")}</p>}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
