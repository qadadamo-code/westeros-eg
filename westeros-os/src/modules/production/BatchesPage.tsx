/** سجل التشغيلات: every batch with its number, chef, cost and expiry — search by batch number, open, reprint, void. */
import { useArea } from "@/modules/cc/useAccess";
import { SourceEntry } from "@/modules/cc/finance/SourceEntry";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Ban, ClipboardList, Printer, Search } from "lucide-react";
import { useSession } from "@/auth/session";
import { useDb } from "@/data/hooks";
import type { MfgBatch, MfgInputRole } from "@/data/types";
import { useT } from "@/i18n/i18n";
import { formatMoney, UNITS_PER_MAJOR } from "@/lib/money";
import { BASE_NAME } from "@/modules/inventory/units";
import { Badge, Button, Card, Dialog, EmptyState, Input, Select, Table, Textarea, useToast, type Column } from "@/ui";
import { ExportButton } from "@/modules/cc/ui";
import { LabelDialog } from "./LabelDialog";
import { voidBatch } from "./ops";
import { ExpiryBadge, fmtDateTime, fmtG, fmtKg, fmtPct, outQtyText } from "./ui";
import { categoryName, METHOD_LABEL, useProduction, type Prod } from "./useProduction";

export default function BatchesPage() {
  const { L, lang, loc } = useT();
  const prod = useProduction();
  const [q, setQ] = useState("");
  const [chef, setChef] = useState("");
  const [cat, setCat] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  // فئة الصنف المصنع: the batch's own category and the category of every product it made (one chicken run can make products of two categories)
  const catsOf = (b: MfgBatch) => new Set([b.category, ...b.outputs.map((o) => prod.productById.get(o.productId)?.category ?? "")].filter(Boolean));
  const usedCats = useMemo(() => {
    const used = new Set(prod.batches.flatMap((b) => [...catsOf(b)]));
    return prod.categories.filter((c) => used.has(c.id));
  }, [prod.batches, prod.categories, prod.productById]); // eslint-disable-line react-hooks/exhaustive-deps
  const exportRows = () => rows.map((b) => [
    b.number,
    b.outputs.map((o) => o.name.ar).join("، "),
    [...catsOf(b)].map((c) => categoryName(prod.categories, c).ar).join("، "),
    b.chefName,
    fmtDateTime(b.madeAt, "ar"),
    b.outputs.map((o) => outQtyText(o, "ar")).join(" + "),
    Math.round((b.totalCost / UNITS_PER_MAJOR) * 100) / 100,
    b.outputs[0] ? fmtDateTime(b.outputs.reduce((a, o) => (o.expiresAt < a ? o.expiresAt : a), b.outputs[0].expiresAt), "ar") : "",
    b.status === "void" ? "ملغاة" : "سارية",
  ]);
  const chefs = useMemo(() => [...new Map(prod.batches.map((b) => [b.chefId, b.chefName])).entries()], [prod.batches]);
  const rows = useMemo(() => {
    const n = q.trim().toLowerCase();
    return prod.batches.filter(
      (b) => (!chef || b.chefId === chef) && (!cat || catsOf(b).has(cat)) && (!n || b.number.toLowerCase().includes(n) || b.chefName.toLowerCase().includes(n) || b.outputs.some((o) => o.name.ar.includes(n) || o.name.en.toLowerCase().includes(n))),
    );
  }, [prod.batches, q, chef, cat]);
  // a scanned sticker opens its batch: the link carries the batch number as ?b=
  const [params, setParams] = useSearchParams();
  const scanned = params.get("b");
  useEffect(() => {
    if (!scanned || prod.loading) return;
    const hit = prod.batches.find((b) => b.number === scanned);
    if (hit) setOpenId(hit.id);
    else setQ(scanned);
    setParams({}, { replace: true });
  }, [scanned, prod.loading, prod.batches, setParams]);
  const open = prod.batches.find((b) => b.id === openId) ?? null;
  const columns: Column<MfgBatch>[] = [
    { key: "n", header: L("رقم الباتش", "Batch no."), cell: (b) => <span className="num font-semibold" dir="ltr">{b.number}</span> },
    { key: "p", header: L("المنتج", "Product"), cell: (b) => <span className="font-semibold">{b.outputs.map((o) => loc(o.name)).join("، ")}</span> },
    { key: "chef", header: L("الشيف", "Chef"), cell: (b) => b.chefName },
    { key: "d", header: L("الإنتاج", "Made"), hideOnMobile: true, cell: (b) => <span className="num text-[13px] text-muted">{fmtDateTime(b.madeAt, lang)}</span> },
    { key: "q", header: L("الكمية", "Quantity"), hideOnMobile: true, cell: (b) => <span className="num text-[13px]">{b.outputs.map((o) => outQtyText(o, lang)).join(" + ")}</span> },
    { key: "c", header: L("التكلفة", "Cost"), align: "end", cell: (b) => <span className="num font-semibold">{formatMoney(b.totalCost, { lang })}</span> },
    { key: "e", header: L("الصلاحية", "Expiry"), hideOnMobile: true, cell: (b) => (b.status === "void" ? <Badge tone="neutral" size="sm">{L("ملغاة", "Void")}</Badge> : b.outputs[0] ? <ExpiryBadge expiresAt={b.outputs.reduce((a, o) => (o.expiresAt < a ? o.expiresAt : a), b.outputs[0].expiresAt)} /> : null) },
  ];
  return (
    <div className="grid gap-4">
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_200px_200px_auto]">
        <Input icon={<Search />} placeholder={L("ابحث برقم الباتش أو المنتج أو الشيف", "Search by batch number, product or chef")} value={q} onChange={(e) => setQ(e.target.value)} />
        <Select value={chef} onChange={(e) => setChef(e.target.value)} options={[{ value: "", label: L("كل الشيفات", "All chefs") }, ...chefs.map(([id, name]) => ({ value: id, label: name }))]} />
        <Select value={cat} onChange={(e) => setCat(e.target.value)} options={[{ value: "", label: L("كل فئات الأصناف", "All categories") }, ...usedCats.map((c) => ({ value: c.id, label: loc(c.name) }))]} aria-label={L("فئة الصنف المصنع", "Product category")} />
        <ExportButton file="سجل التشغيلات" head={["رقم الباتش", "المنتج", "فئة الصنف", "الشيف", "تاريخ الإنتاج", "الكمية", "التكلفة (جنيه)", "الصلاحية", "الحالة"]} rows={exportRows} />
      </div>
      <Card className="overflow-hidden">
        <Table columns={columns} rows={rows} rowKey={(b) => b.id} onRowClick={(b) => setOpenId(b.id)} loading={prod.loading} empty={<EmptyState compact icon={<ClipboardList />} title={prod.batches.length ? L("لا توجد نتيجة", "Nothing matches") : L("لا توجد تشغيلات بعد", "No batches yet")} />} />
      </Card>
      <BatchDialog batch={open} prod={prod} onClose={() => setOpenId(null)} />
    </div>
  );
}

const ROLE: Record<MfgInputRole, { ar: string; en: string }> = { main: { ar: "خامة رئيسية", en: "Main" }, fat: { ar: "دهن", en: "Fat" }, ingredient: { ar: "مكون", en: "Ingredient" }, packaging: { ar: "باكيج", en: "Packaging" } };

function Fact({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-surface-2 px-3 py-2">
      <div className="text-[12px] text-muted">{label}</div>
      <div className="mt-0.5 text-[14.5px] font-bold tabular-nums">{value}</div>
    </div>
  );
}

function BatchDialog({ batch, prod, onClose }: { batch: MfgBatch | null; prod: Prod; onClose: () => void }) {
  const { L, lang, loc } = useT();
  const db = useDb();
  const { can, staff } = useSession();
  // إلغاء التشغيلة = حذف in سجل التشغيلات (المستخدمين ← الأدوار)
  const area = useArea();
  const { toast } = useToast();
  const [label, setLabel] = useState(false);
  const [voiding, setVoiding] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  if (!batch) return null;
  const b = batch;
  const doVoid = async () => {
    setBusy(true);
    try {
      await voidBatch(db, b.id, { reason: reason.trim(), by: staff?.id ?? null });
      toast({ tone: "success", title: L("أُلغيت التشغيلة ورجعت المكونات للمخزن", "Batch voided; ingredients are back in stock") });
      setVoiding(false);
      setReason("");
    } catch (e) {
      toast({ tone: "error", title: L("تعذر الإلغاء", "Could not void"), description: String((e as Error).message ?? e) });
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <Dialog
        open={!label}
        onClose={onClose}
        size="xl"
        title={<span className="flex flex-wrap items-center gap-2"><span className="num" dir="ltr">{b.number}</span>{b.status === "void" ? <Badge tone="danger">{L("ملغاة", "Void")}</Badge> : <Badge tone="ok">{loc(METHOD_LABEL[b.method])}</Badge>}</span>}
        description={`${b.outputs.map((o) => loc(o.name)).join("، ")} · ${loc(categoryName(prod.categories, b.category))}`}
        footer={
          <div className="flex flex-wrap items-center justify-between gap-2">
            {b.status === "done" && can("production.manage") && area.delete ? <Button variant="danger-soft" icon={<Ban />} onClick={() => setVoiding(true)}>{L("إلغاء التشغيلة", "Void batch")}</Button> : <span />}
            <div className="flex gap-2">
              <SourceEntry refId={b.id} />
              <Button variant="ghost" onClick={onClose}>{L("إغلاق", "Close")}</Button>
              {b.status === "done" ? <Button icon={<Printer />} onClick={() => setLabel(true)}>{L("طباعة الستيكر", "Print sticker")}</Button> : null}
            </div>
          </div>
        }
      >
        <div className="grid gap-4">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Fact label={L("الشيف", "Chef")} value={`${b.chefName} (${b.chefCode})`} />
            <Fact label={L("تاريخ الإنتاج", "Made at")} value={fmtDateTime(b.madeAt, lang)} />
            <Fact label={L("تكلفة التشغيلة", "Batch cost")} value={formatMoney(b.totalCost, { lang })} />
            <Fact label={L("ستيكرات مطبوعة", "Stickers printed")} value={b.labelsPrinted} />
            {b.meals != null ? <Fact label={L("عدد الوجبات", "Meals")} value={b.meals} /> : null}
            {b.mainWeightKg != null ? <Fact label={L("وزن الخامة الرئيسية", "Main raw weight")} value={fmtKg(b.mainWeightKg, lang)} /> : null}
            {b.grossWeightKg != null ? <Fact label={L("الوزن الإجمالي", "Gross weight")} value={fmtG(b.grossWeightKg * 1000, lang)} /> : null}
            {b.netWeightKg != null ? <Fact label={L("الوزن الصافي", "Net weight")} value={fmtKg(b.netWeightKg, lang)} /> : null}
            {b.expectedCount != null ? <Fact label={L("العدد المتوقع", "Expected count")} value={b.expectedCount} /> : null}
            {b.waste != null ? <Fact label={L("الهدر", "Waste")} value={b.method === "portion" ? `${b.waste} ${L("قطعة", "pcs")}` : fmtG(b.waste, lang)} /> : null}
            {b.debrisKg != null ? <Fact label={L("الدوبريه", "Trimmings")} value={`${fmtKg(b.debrisKg, lang)} · ${fmtPct(b.debrisBp)}`} /> : null}
            {b.fatWeightKg != null ? <Fact label={L("الدهن المضاف / المقترح", "Fat added / suggested")} value={`${fmtKg(b.fatWeightKg, lang)} / ${fmtKg(b.suggestedFatKg, lang)}`} /> : null}
            {b.scaleDiffG != null ? <Fact label={L("هدر الميزان", "Scale difference")} value={fmtG(b.scaleDiffG, lang)} /> : null}
          </div>
          {b.status === "void" ? <p className="rounded-xl bg-danger-soft px-3 py-2 text-[13.5px]">{L("سبب الإلغاء", "Void reason")}: {b.voidReason || "—"}{b.voidedAt ? ` · ${fmtDateTime(b.voidedAt, lang)}` : ""}{b.voidedBy ? ` · ${prod.staff.find((m) => m.id === b.voidedBy)?.name ?? ""}` : ""}</p> : null}
          {b.note ? <p className="rounded-xl bg-surface-2 px-3 py-2 text-[13.5px]">{L("ملاحظة", "Note")}: {b.note}</p> : null}
          <div>
            <h4 className="mb-1.5 font-sans text-[14px] font-bold">{L("المنتجات الناتجة", "Products made")}</h4>
            <div className="overflow-hidden rounded-xl border border-line">
              <Table
                dense
                rows={b.outputs}
                rowKey={(o) => o.productId}
                columns={[
                  { key: "n", header: L("المنتج", "Product"), cell: (o) => <span className="font-semibold">{loc(o.name)}</span> },
                  { key: "q", header: L("الكمية", "Quantity"), cell: (o) => <span className="num">{outQtyText(o, lang)}</span> },
                  { key: "u", header: L("سعر الوحدة", "Unit cost"), align: "end", cell: (o) => <span className="num">{formatMoney(o.unitCost, { lang })} / {o.unit === "kg" ? L("كجم", "kg") : L("قطعة", "pc")}</span> },
                  { key: "t", header: L("الإجمالي", "Total"), align: "end", cell: (o) => <span className="num font-semibold">{formatMoney(o.totalCost, { lang })}</span> },
                  { key: "e", header: L("الانتهاء", "Expiry"), hideOnMobile: true, cell: (o) => <ExpiryBadge expiresAt={o.expiresAt} /> },
                ]}
              />
            </div>
          </div>
          <div>
            <h4 className="mb-1.5 font-sans text-[14px] font-bold">{L("ما خرج من المخزن", "Taken from stock")}</h4>
            <div className="overflow-hidden rounded-xl border border-line">
              <Table
                dense
                rows={b.inputs.map((l, i) => ({ ...l, i }))}
                rowKey={(l) => String(l.i)}
                columns={[
                  { key: "n", header: L("الصنف", "Item"), cell: (l) => <span className="font-semibold">{loc(l.name)}</span> },
                  { key: "r", header: L("النوع", "Role"), hideOnMobile: true, cell: (l) => <span className="text-muted">{ROLE[l.role][lang]}{l.outputIndex != null && b.outputs[l.outputIndex] ? ` · ${loc(b.outputs[l.outputIndex].name)}` : ""}</span> },
                  { key: "q", header: L("الكمية", "Quantity"), align: "end", cell: (l) => <span className="num">{Math.round(l.qty * 1000) / 1000} {BASE_NAME[prod.itemById.get(l.itemId)?.baseUnit ?? "g"][lang]}</span> },
                  { key: "c", header: L("التكلفة", "Cost"), align: "end", cell: (l) => <span className="num font-semibold">{l.unitCost > 0 ? formatMoney(l.cost, { lang }) : L("بدون سعر", "No price")}</span> },
                ]}
              />
            </div>
          </div>
        </div>
      </Dialog>
      {label ? <LabelDialog batch={b} onClose={() => setLabel(false)} /> : null}
      <Dialog
        open={voiding}
        onClose={() => setVoiding(false)}
        size="sm"
        title={L("إلغاء التشغيلة", "Void batch")}
        description={L("المنتج يخرج من المخزن والمكونات ترجع بتكلفتها. رقم الباتش لا يُعاد استخدامه.", "The product leaves stock and the ingredients return at cost. The batch number is never reused.")}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setVoiding(false)}>{L("رجوع", "Back")}</Button>
            <Button variant="danger" loading={busy} disabled={reason.trim().length < 3} onClick={doVoid}>{L("تأكيد الإلغاء", "Confirm void")}</Button>
          </div>
        }
      >
        <Textarea label={L("سبب الإلغاء", "Reason")} rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
      </Dialog>
    </>
  );
}
