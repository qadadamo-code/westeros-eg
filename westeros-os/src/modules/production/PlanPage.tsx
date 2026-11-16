/** خطة اليوم: what to make today, from each product's daily minimum, its consumption and what is on the shelf. */
import { useMemo, useState } from "react";
import { CalendarCheck, CheckCircle2, CircleHelp, Flame, PlusCircle, Search } from "lucide-react";
import { useSession } from "@/auth/session";
import { useDb, useLive } from "@/data/hooks";
import type { MfgProduct } from "@/data/types";
import { useT } from "@/i18n/i18n";
import { Badge, Button, Card, Dialog, EmptyState, Input, LinkButton, Skeleton, StatTile, Table, useToast, type Column } from "@/ui";
import { buildPlan, SAFETY, type PlanRow } from "./plan";
import { Num } from "./ui";
import { categoryName, useProduction } from "./useProduction";

const SINCE = 35 * 86_400_000;

export default function PlanPage() {
  const { L, loc } = useT();
  const { can } = useSession();
  const prod = useProduction();
  const levels = useLive("stockLevels").data;
  const since = useMemo(() => new Date(Date.now() - SINCE).toISOString(), []);
  const movesLive = useLive("stockMoves", { gte: { at: since } });
  const [q, setQ] = useState("");
  const [edit, setEdit] = useState<PlanRow | null>(null);
  const rows = useMemo(() => {
    const onHand = new Map<string, number>();
    for (const l of levels) if (!prod.branchId || l.branchId === prod.branchId) onHand.set(l.itemId, (onHand.get(l.itemId) ?? 0) + l.qty);
    const moves = movesLive.data.filter((m) => !prod.branchId || m.branchId === prod.branchId);
    return buildPlan({ products: prod.products, items: prod.itemById, onHand, moves, batches: prod.batches, now: new Date().toISOString() });
  }, [levels, movesLive.data, prod.products, prod.itemById, prod.batches, prod.branchId]);
  const shown = useMemo(() => {
    const n = q.trim().toLowerCase();
    return n ? rows.filter((r) => r.product.name.ar.includes(n) || r.product.name.en.toLowerCase().includes(n)) : rows;
  }, [rows, q]);
  const make = rows.filter((r) => r.status === "make");
  const unknown = rows.filter((r) => r.status === "unknown");
  const u = (r: PlanRow) => (r.unit === "kg" ? L("كجم", "kg") : L("قطعة", "pc"));
  const qty = (n: number, r: PlanRow) => <span className="num whitespace-nowrap">{Math.round(n * 100) / 100} <span className="text-[11.5px] text-muted">{u(r)}</span></span>;
  const manage = can("production.manage");
  const columns: Column<PlanRow>[] = [
    { key: "p", header: L("المنتج", "Product"), cell: (r) => (
      <span className="grid">
        <span className="font-semibold">{loc(r.product.name)}</span>
        <span className="text-[12px] text-muted">{loc(categoryName(prod.categories, r.product.category))}</span>
      </span>
    ) },
    { key: "h", header: L("الموجود", "On hand"), align: "end", cell: (r) => (
      <span className="grid justify-items-end">
        {qty(r.onHand, r)}
        {r.expiring > 0 ? <span className="text-[11.5px] font-semibold text-danger">{L("ينتهي اليوم", "expires today")} {Math.round(r.expiring * 100) / 100}</span> : null}
      </span>
    ) },
    { key: "f", header: L("استهلاك متوقع", "Expected use"), align: "end", hideOnMobile: true, cell: (r) => (r.forecast === null ? <span className="text-faint">—</span> : (
      <span className="grid justify-items-end">
        {qty(r.forecast, r)}
        <span className="text-[11.5px] text-muted">{r.basis === "weekday" ? L(`متوسط نفس اليوم في ${r.samples} أسابيع`, `same weekday, ${r.samples} wk`) : L(`متوسط ${r.samples} يوم`, `${r.samples}-day average`)}</span>
      </span>
    )) },
    { key: "par", header: L("الحد اليومي", "Daily minimum"), align: "end", hideOnMobile: true, cell: (r) => (
      manage ? <button type="button" className="rounded-lg px-2 py-1 hover:bg-surface-3" onClick={(e) => { e.stopPropagation(); setEdit(r); }}>{r.par ? qty(r.par, r) : <span className="text-[13px] font-semibold text-primary underline-offset-2 hover:underline">{L("حدّد", "Set")}</span>}</button> : r.par ? qty(r.par, r) : <span className="text-faint">—</span>
    ) },
    { key: "s", header: L("المطلوب تصنيعه", "To make"), align: "end", cell: (r) => (
      r.status === "make" ? <span className="num text-[16px] font-extrabold whitespace-nowrap">{r.suggest} <span className="text-[12px] font-semibold text-muted">{u(r)}</span></span>
        : r.status === "ok" ? <Badge tone="ok" size="sm">{L("كافي", "Enough")}</Badge>
        : manage ? <button type="button" onClick={() => setEdit(r)} className="rounded-full bg-surface-3 px-2.5 py-1 text-[12px] font-semibold text-ink-2 hover:bg-line">{L("حدّد الحد اليومي", "Set a minimum")}</button>
        : <Badge tone="neutral" size="sm">{L("بدون حد يومي", "No minimum")}</Badge>
    ) },
    { key: "a", header: "", align: "end", cell: (r) => (
      <span className="flex items-center justify-end gap-2">
        {r.madeToday > 0 ? <Badge tone="info" size="sm">{L("اتعمل اليوم", "Made today")} {Math.round(r.madeToday * 100) / 100}</Badge> : null}
        {r.status === "make" && can("production.run") ? <LinkButton size="sm" variant="secondary" to={`/production/new?product=${r.product.id}`} icon={<PlusCircle />}>{L("ابدأ", "Start")}</LinkButton> : null}
      </span>
    ) },
  ];
  if (prod.loading || movesLive.loading) return <Skeleton className="h-96" rounded="rounded-[20px]" />;
  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile index={0} tone={make.length ? "brass" : "ok"} icon={<Flame />} label={L("منتجات مطلوب تصنيعها", "Products to make")} value={<span className="num">{make.length}</span>} sub={make.length ? L("مرتبة بالأكثر احتياجاً", "Most needed first") : L("المخزون يكفي اليوم", "Stock covers today")} />
        <StatTile index={1} tone="ok" icon={<CheckCircle2 />} label={L("منتجات كافية", "Covered")} value={<span className="num">{rows.filter((r) => r.status === "ok").length}</span>} />
        <StatTile index={2} tone="danger" icon={<CalendarCheck />} label={L("كميات تنتهي اليوم", "Expiring today")} value={<span className="num">{rows.filter((r) => r.expiring > 0).length}</span>} sub={L("لا تحسب ضمن المتاح للغد", "Not counted as available")} />
        <StatTile index={3} tone="info" icon={<CircleHelp />} label={L("بدون حد يومي", "No daily minimum")} value={<span className="num">{unknown.length}</span>} sub={unknown.length ? L("النظام لا يقترح لها كمية", "No suggestion yet") : undefined} />
      </div>
      <p className="rounded-xl border border-line bg-surface-2 px-4 py-2.5 text-[13.5px] text-muted">
        {L(
          `المطلوب تصنيعه = الأكبر من الحد اليومي أو استهلاك نفس اليوم في آخر 4 أسابيع بزيادة ${Math.round(SAFETY * 100)}٪ احتياطي، ناقص الموجود الصالح. الاستهلاك يبدأ يتحسب تلقائياً مع أول مبيعات وتشغيلات.`,
          `To make = the larger of the daily minimum and the same weekday's use over the last 4 weeks plus ${Math.round(SAFETY * 100)}% safety, minus good stock on hand. Use is picked up automatically from sales and batches.`,
        )}
      </p>
      <Input icon={<Search />} placeholder={L("ابحث عن منتج", "Search products")} value={q} onChange={(e) => setQ(e.target.value)} />
      <Card className="overflow-hidden">
        <Table columns={columns} rows={shown} rowKey={(r) => r.product.id} empty={<EmptyState compact icon={<CalendarCheck />} title={L("لا توجد منتجات", "No products")} />} />
      </Card>
      {edit ? <ParDialog key={edit.product.id} row={edit} onClose={() => setEdit(null)} /> : null}
    </div>
  );
}

function ParDialog({ row, onClose }: { row: PlanRow; onClose: () => void }) {
  const { L, loc } = useT();
  const db = useDb();
  const { toast } = useToast();
  const [par, setPar] = useState(row.par);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      await setDailyMinimum(db, row.product, par);
      toast({ tone: "success", title: L("تم حفظ الحد اليومي", "Daily minimum saved") });
      onClose();
    } catch (e) {
      toast({ tone: "error", title: L("تعذر الحفظ", "Could not save"), description: String((e as Error).message ?? e) });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open onClose={onClose} size="sm" title={loc(row.product.name)} description={L("الكمية اللي لازم تكون جاهزة أول اليوم", "How much should be ready at the start of the day")}
      footer={<div className="flex justify-end gap-2"><Button variant="ghost" onClick={onClose}>{L("إلغاء", "Cancel")}</Button><Button loading={busy} onClick={save}>{L("حفظ", "Save")}</Button></div>}>
      <Num autoFocus big label={L("الحد اليومي", "Daily minimum")} suffix={row.unit === "kg" ? L("كجم", "kg") : L("قطعة", "pc")} value={par} onChange={setPar} hint={L("اتركه صفر لو عايز النظام يمشي على الاستهلاك فقط", "Leave zero to follow consumption only")} />
    </Dialog>
  );
}

/** the daily minimum is the par level of the product's stock item (base units: grams or pieces) */
export async function setDailyMinimum(db: ReturnType<typeof useDb>, product: Pick<MfgProduct, "stockItemId" | "unit">, qty: number) {
  const item = await db.get("stockItems", product.stockItemId);
  if (!item) throw new Error("stock item not found");
  const par = Math.max(0, Math.round(qty * (product.unit === "kg" ? 1000 : 1) * 1000) / 1000);
  await db.update("stockItems", item.id, { levels: { ...item.levels, par } });
}
