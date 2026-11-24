/**
 * أسعار الموردين (Saqr 2026-11-25): كل خامة اتغير سعرها بآخر فاتورة شراء عن اللي قبلها،
 * مع الأصناف اللي بتدخل فيها، عشان تعرف وين التكلفة طلعت وتراجع سعر البيع.
 */
import { useMemo, useState } from "react";
import { TrendingDown, TrendingUp } from "lucide-react";
import { useLive } from "@/data/hooks";
import { cn } from "@/lib/cn";
import { Card, EmptyState, Segmented } from "@/ui";
import { ExportButton } from "../ui";
import { priceChanges } from "./analysis";
import { PURCHASE, SUPPLIER } from "./purchases";
import { Tiles } from "./Summaries";
import { addDays, fmt, GroupTitle, today } from "./ui";

/** a rise of 5% or more in the last 30 days is a warning */
export const PRICE_ALERT_BP = 500;
const pct = (bp: number) => `${bp > 0 ? "+" : ""}${(bp / 100).toFixed(1)}%`;

export function usePriceChanges() {
  const docs = useLive("finDocs", { where: { kind: [PURCHASE, SUPPLIER] } }).data;
  return useMemo(() => ({ changes: priceChanges(docs), suppliers: new Map(docs.filter((d) => d.kind === SUPPLIER).map((d) => [d.id, d.name])) }), [docs]);
}

export default function SupplierPrices() {
  const { changes, suppliers } = usePriceChanges();
  const items = useLive("stockItems").data;
  const recipes = useLive("recipes").data;
  const menu = useLive("menuItems").data;
  const [show, setShow] = useState<"up" | "all">("up");
  const since = addDays(today(), -30);
  const itemName = (id: string) => items.find((i) => i.id === id)?.name.ar ?? "—";
  /** أصناف البيع اللي وصفتها فيها الخامة (اسم واحد لكل صنف حتى لو بأكتر من فرع) */
  const usedIn = (id: string) => [...new Set(recipes.filter((r) => r.ownerType === "menu_item" && r.lines.some((l) => l.itemId === id)).map((r) => menu.find((m) => m.id === r.ownerId)?.name.ar).filter(Boolean))] as string[];
  const rows = changes.filter((c) => show === "all" || c.changeBp > 0);
  const recentUp = changes.filter((c) => c.changeBp >= PRICE_ALERT_BP && c.date >= since);

  return (
    <div className="grid gap-5">
      <Tiles title="آخر 30 يوم" tiles={[
        { label: "خامات سعرها طلع 5% أو أكتر", value: String(recentUp.length), sub: recentUp.slice(0, 3).map((c) => itemName(c.itemId)).join("، "), icon: <TrendingUp />, tone: recentUp.length ? "danger" : "ok" },
        { label: "خامات سعرها نزل", value: String(changes.filter((c) => c.changeBp < 0 && c.date >= since).length), icon: <TrendingDown />, tone: "ok" },
      ]} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented label="العرض" value={show} onChange={(v) => setShow(v as typeof show)} options={[{ value: "up", label: "اللي طلعت" }, { value: "all", label: "كل التغييرات" }]} />
        <ExportButton size="sm" file="أسعار الموردين" head={["الخامة", "المورد", "السعر القديم", "تاريخه", "السعر الجديد", "تاريخه", "التغير %", "بتدخل في"]}
          rows={() => rows.map((c) => [itemName(c.itemId), suppliers.get(c.supplierId) ?? "", c.prev / 100000, c.prevDate, c.price / 100000, c.date, c.changeBp / 100, usedIn(c.itemId).join("، ")])} />
      </div>
      {rows.length ? (
        <section className="grid gap-2.5">
          <GroupTitle>آخر سعر شراء مقابل اللي قبله</GroupTitle>
          <Card className="divide-y divide-line overflow-hidden">
            {rows.map((c) => { const used = usedIn(c.itemId); return (
              <div key={c.itemId} className="grid gap-1 px-4 py-3 text-[14px]">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="flex-1 font-semibold">{itemName(c.itemId)}</span>
                  <span className={cn("num rounded-full px-2 py-0.5 text-[13px] font-bold", c.changeBp > 0 ? "bg-danger/10 text-danger" : "bg-ok/10 text-ok")} dir="ltr">{pct(c.changeBp)}</span>
                </div>
                <div className="text-[13px] text-muted"><span className="num" dir="ltr">{fmt(c.prev)}</span> ({c.prevDate.split("-").reverse().join("/")}) ← <span className="num font-semibold text-ink" dir="ltr">{fmt(c.price)}</span> ({c.date.split("-").reverse().join("/")}) · {suppliers.get(c.supplierId) ?? "—"}</div>
                {used.length ? <div className="text-[12.5px] text-muted">بتدخل في: {used.slice(0, 6).join("، ")}{used.length > 6 ? ` و${used.length - 6} كمان` : ""}</div> : null}
              </div>
            ); })}
          </Card>
        </section>
      ) : <Card><EmptyState compact icon={<TrendingUp />} title={show === "up" ? "ولا خامة سعرها طلع" : "ما فيه تغيير بالأسعار"} body="بيتحسب من فواتير الشراء: لازم الخامة تنشرى مرتين على الأقل بسعرين مختلفين." /></Card>}
    </div>
  );
}
