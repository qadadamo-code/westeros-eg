/** المنتجات والريسبي: manufactured products, how each is made, its recipe, portion, storage and shelf life. */
import { useMemo, useState } from "react";
import { BookOpenCheck, Plus, Search } from "lucide-react";
import { useSession } from "@/auth/session";
import { useDb } from "@/data/hooks";
import type { MfgCategory, MfgChickenMode, MfgMethod, MfgProduct, MfgRecipeLine, MfgStorageTemp } from "@/data/types";
import { useT } from "@/i18n/i18n";
import { formatMoney } from "@/lib/money";
import { Badge, Button, Card, Dialog, EmptyState, Input, Select, Switch, Table, Textarea, useToast, type Column } from "@/ui";
import { LinesEditor, Num } from "./ui";
import { CATEGORY_LABEL, CATEGORY_ORDER, METHOD_LABEL, useProduction, type Prod } from "./useProduction";

const METHODS: MfgMethod[] = ["weight", "portion", "chicken", "burger", "fat"];
const unitOf = (method: MfgMethod, mode: MfgChickenMode | null): "kg" | "pc" => (method === "weight" || method === "fat" || (method === "chicken" && (mode ?? "weight") === "weight") ? "kg" : "pc");
const clean = (l: MfgRecipeLine[]) => l.filter((x) => x.qty > 0);

type Draft = Pick<MfgProduct, "name" | "category" | "categoryCode" | "method" | "chickenMode" | "recipeType" | "portionGrams" | "storageMethod" | "storageTemp" | "shelfLifeDays" | "ingredientsText" | "lines" | "packaging" | "active">;

export default function ProductsPage() {
  const { L, lang, loc } = useT();
  const { can } = useSession();
  const prod = useProduction();
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("");
  const [edit, setEdit] = useState<MfgProduct | "new" | null>(null);
  const manage = can("production.manage");
  const rows = useMemo(() => {
    const n = q.trim().toLowerCase();
    return prod.products.filter((p) => (!cat || p.category === cat) && (!n || p.name.ar.includes(n) || p.name.en.toLowerCase().includes(n) || p.code.toLowerCase().includes(n)));
  }, [prod.products, q, cat]);
  const noRecipe = prod.products.filter((p) => p.active && p.method !== "fat" && !p.lines.length).length;
  const columns: Column<MfgProduct>[] = [
    { key: "c", header: L("الكود", "Code"), hideOnMobile: true, cell: (p) => <span className="num text-[13px] text-muted">{p.code}</span> },
    { key: "n", header: L("المنتج", "Product"), cell: (p) => <span className="font-semibold">{loc(p.name)}{p.active ? null : <Badge tone="neutral" size="sm" className="ms-2">{L("موقوف", "Inactive")}</Badge>}</span> },
    { key: "cat", header: L("القسم", "Category"), hideOnMobile: true, cell: (p) => <span className="text-muted">{loc(CATEGORY_LABEL[p.category])}</span> },
    { key: "m", header: L("طريقة التصنيع", "Method"), hideOnMobile: true, cell: (p) => loc(METHOD_LABEL[p.method]) },
    { key: "por", header: L("الحصة", "Portion"), align: "end", hideOnMobile: true, cell: (p) => (p.portionGrams ? <span className="num">{p.portionGrams} {L("جم", "g")}</span> : p.method === "portion" ? <Badge tone="warn" size="sm">{L("ناقصة", "Missing")}</Badge> : <span className="text-faint">—</span>) },
    { key: "r", header: L("الوصفة", "Recipe"), cell: (p) => (p.lines.length ? <Badge tone="ok" size="sm">{L(`${p.lines.length} مكون`, `${p.lines.length} items`)}</Badge> : p.method === "fat" ? <span className="text-faint">—</span> : <Badge tone="warn" size="sm">{L("فاضية", "Empty")}</Badge>) },
    { key: "s", header: L("الصلاحية", "Shelf life"), align: "end", hideOnMobile: true, cell: (p) => <span className="num">{p.shelfLifeDays} {L("يوم", "d")}</span> },
    { key: "cost", header: L("آخر سعر إنتاج", "Last cost"), align: "end", cell: (p) => { const u = prod.unitCost(p.stockItemId); return u > 0 ? <span className="num font-semibold">{formatMoney(p.unit === "kg" ? u * 1000 : u, { lang })} <span className="text-[11.5px] font-normal text-muted">/ {p.unit === "kg" ? L("كجم", "kg") : L("قطعة", "pc")}</span></span> : <span className="text-faint">—</span>; } },
  ];
  return (
    <div className="grid gap-4">
      {noRecipe ? (
        <p className="rounded-xl border border-line bg-brass-soft px-4 py-2.5 text-[13.5px] text-brass-text">
          {L(`${noRecipe} منتج بدون وصفة حتى الآن. اكتب الكميات هنا، أو اتركها والنظام يحفظها من أول تشغيلة يسجلها الشيف.`, `${noRecipe} products have no recipe yet. Enter the quantities here, or let the system save them from the first batch.`)}
        </p>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_220px_auto]">
        <Input icon={<Search />} placeholder={L("ابحث عن منتج", "Search products")} value={q} onChange={(e) => setQ(e.target.value)} />
        <Select value={cat} onChange={(e) => setCat(e.target.value)} options={[{ value: "", label: L("كل الأقسام", "All categories") }, ...CATEGORY_ORDER.map((c) => ({ value: c, label: loc(CATEGORY_LABEL[c]) }))]} />
        {manage ? <Button icon={<Plus />} onClick={() => setEdit("new")}>{L("منتج جديد", "New product")}</Button> : null}
      </div>
      <Card className="overflow-hidden">
        <Table columns={columns} rows={rows} rowKey={(p) => p.id} onRowClick={(p) => setEdit(p)} empty={<EmptyState compact icon={<BookOpenCheck />} title={L("لا توجد منتجات", "No products")} />} />
      </Card>
      {edit ? <ProductDialog key={edit === "new" ? "new" : edit.id} product={edit === "new" ? null : edit} prod={prod} readOnly={!manage} onClose={() => setEdit(null)} /> : null}
    </div>
  );
}

function ProductDialog({ product, prod, readOnly, onClose }: { product: MfgProduct | null; prod: Prod; readOnly: boolean; onClose: () => void }) {
  const { L, loc } = useT();
  const db = useDb();
  const { toast } = useToast();
  const [d, setD] = useState<Draft>(() =>
    product
      ? { name: product.name, category: product.category, categoryCode: product.categoryCode, method: product.method, chickenMode: product.chickenMode, recipeType: product.recipeType, portionGrams: product.portionGrams, storageMethod: product.storageMethod, storageTemp: product.storageTemp, shelfLifeDays: product.shelfLifeDays, ingredientsText: product.ingredientsText, lines: product.lines, packaging: product.packaging, active: product.active }
      : { name: { ar: "", en: "" }, category: "cold_sauce", categoryCode: codeOf(prod, "cold_sauce"), method: "weight", chickenMode: null, recipeType: "main", portionGrams: null, storageMethod: "", storageTemp: "chilled", shelfLifeDays: 3, ingredientsText: "", lines: [], packaging: [], active: true },
  );
  const [busy, setBusy] = useState(false);
  // الحد اليومي lives on the product's stock item (par level), in the product's unit here
  const [par, setPar] = useState(() => (product ? (prod.itemById.get(product.stockItemId)?.levels?.par ?? 0) / (product.unit === "kg" ? 1000 : 1) : 0));
  const set = (p: Partial<Draft>) => setD((x) => ({ ...x, ...p }));
  // the way a product is made decides how it is stocked (kilos or pieces); fixed once it has batches
  const locked = !!product && prod.batches.some((b) => b.outputs.some((o) => o.productId === product.id));
  const unit = unitOf(d.method, d.chickenMode);
  const per = d.method === "weight" || d.method === "portion" ? L("لوجبة واحدة", "for one meal") : d.method === "fat" ? L("لكل كيلو جاهز", "per kilo ready") : L("لكل كيلو صافي", "per net kilo");
  const save = async () => {
    if (!d.name.ar.trim()) return;
    setBusy(true);
    try {
      const name = { ar: d.name.ar.trim(), en: d.name.en.trim() || d.name.ar.trim() };
      const fields = { ...d, name, unit, chickenMode: d.method === "chicken" ? (d.chickenMode ?? "weight") : null, portionGrams: d.portionGrams || null, lines: clean(d.lines), packaging: clean(d.packaging) };
      const stock = { name, baseUnit: unit === "kg" ? ("g" as const) : ("pc" as const), countUnit: unit === "kg" ? "kg" : "pc", active: d.active };
      const parBase = Math.max(0, Math.round(par * (unit === "kg" ? 1000 : 1) * 1000) / 1000);
      if (product) {
        const levels = { ...(prod.itemById.get(product.stockItemId)?.levels ?? { min: 0, par: 0, max: 0 }), par: parBase };
        await db.update("mfgProducts", product.id, fields);
        await db.update("stockItems", product.stockItemId, locked ? { name, active: d.active, levels } : { ...stock, levels });
      } else {
        const n = prod.products.length + 1;
        const code = `M${String(Math.max(n, ...prod.products.map((p) => Number(p.code.replace(/\D/g, "")) + 1 || 0))).padStart(3, "0")}`;
        const item = await db.insert("stockItems", {
          ...stock, sku: code, category: "prep", kind: "prep", packs: [], account: "food", levels: { min: 0, par: parBase, max: 0 }, branchLevels: {}, supplierIds: [], preferredSupplierId: null, lastCost: 0,
          defaultLocationIds: prod.settings?.productLocationId ? [prod.settings.productLocationId] : [], trackBatches: true, shelfLifeDays: null, vatBp: 0, yieldBp: 10_000, allergens: [], note: "منتج مصنع", marketKey: null,
        });
        await db.insert("mfgProducts", { ...fields, code, stockItemId: item.id, sort: n });
      }
      toast({ tone: "success", title: L("تم حفظ المنتج", "Product saved") });
      onClose();
    } catch (e) {
      toast({ tone: "error", title: L("تعذر الحفظ", "Could not save"), description: String((e as Error).message ?? e) });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      open
      onClose={onClose}
      size="xl"
      title={product ? loc(product.name) : L("منتج مصنّع جديد", "New manufactured product")}
      description={product ? `${product.code} · ${loc(METHOD_LABEL[product.method])}` : L("يُضاف كصنف في المخزن تلقائياً", "A stock item is created for it automatically")}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>{readOnly ? L("إغلاق", "Close") : L("إلغاء", "Cancel")}</Button>
          {readOnly ? null : <Button loading={busy} disabled={!d.name.ar.trim()} onClick={save}>{L("حفظ", "Save")}</Button>}
        </div>
      }
    >
      <fieldset disabled={readOnly} className="grid gap-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <Input label={L("الاسم بالعربي", "Arabic name")} value={d.name.ar} onChange={(e) => set({ name: { ...d.name, ar: e.target.value } })} />
          <Input label={L("الاسم بالإنجليزي", "English name")} dir="ltr" value={d.name.en} onChange={(e) => set({ name: { ...d.name, en: e.target.value } })} />
          <Select label={L("القسم", "Category")} value={d.category} onChange={(e) => { const c = e.target.value as MfgCategory; set({ category: c, categoryCode: codeOf(prod, c) }); }} options={CATEGORY_ORDER.map((c) => ({ value: c, label: loc(CATEGORY_LABEL[c]) }))} />
          <Num label={L("كود القسم في رقم الباتش", "Category code in the batch number")} value={d.categoryCode} onChange={(n) => set({ categoryCode: Math.round(n) })} />
          <Select label={L("طريقة التصنيع", "Manufacturing method")} disabled={locked} hint={locked ? L("لا تتغير بعد تسجيل تشغيلات", "Fixed once batches exist") : undefined} value={d.method} onChange={(e) => set({ method: e.target.value as MfgMethod })} options={METHODS.map((m) => ({ value: m, label: loc(METHOD_LABEL[m]) }))} />
          {d.method === "chicken" ? (
            <Select label={L("طريقة الوزن والعد", "Weighing mode")} disabled={locked} value={d.chickenMode ?? "weight"} onChange={(e) => set({ chickenMode: e.target.value as MfgChickenMode })} options={[{ value: "weight", label: L("بالوزن (فرم، بايتس)", "By weight") }, { value: "pre_count", label: L("متبل قبل العد (ناجيتس، كوردن بلو)", "Marinated before counting") }, { value: "post_count", label: L("متبل بعد العد (كرسبي، ستيك)", "Marinated after counting") }]} />
          ) : (
            <Select label={L("نوع الوصفة", "Recipe type")} value={d.recipeType} onChange={(e) => set({ recipeType: e.target.value as Draft["recipeType"] })} options={[{ value: "main", label: L("رئيسية", "Main") }, { value: "sub", label: L("فرعية", "Sub-recipe") }, { value: "marinade", label: L("تتبيلة", "Marinade") }]} />
          )}
          <Num label={L("وزن الحصة", "Portion weight")} suffix={L("جم", "g")} value={d.portionGrams ?? 0} onChange={(n) => set({ portionGrams: n || null })} hint={unit === "pc" ? L("مطلوب للمنتجات التي تخزن بالقطعة", "Required for products stocked by the piece") : undefined} />
          <Num label={L("الصلاحية", "Shelf life")} suffix={L("يوم", "days")} value={d.shelfLifeDays} onChange={(n) => set({ shelfLifeDays: Math.round(n) })} hint={L("تحسب تاريخ الانتهاء على الستيكر", "Sets the expiry date on the sticker")} />
          <Num label={L("الحد اليومي", "Daily minimum")} suffix={unit === "kg" ? L("كجم", "kg") : L("قطعة", "pc")} value={par} onChange={setPar} hint={L("الكمية اللي لازم تكون جاهزة أول اليوم، وخطة اليوم بتكمل عليها", "What should be ready at the start of the day; the daily plan tops up to it")} />
          <Select label={L("درجة التخزين", "Storage temperature")} value={d.storageTemp} onChange={(e) => set({ storageTemp: e.target.value as MfgStorageTemp })} options={[{ value: "chilled", label: L("مبرد", "Chilled") }, { value: "frozen", label: L("مجمد", "Frozen") }, { value: "room", label: L("حرارة الغرفة", "Room temperature") }]} />
          <Select label={L("طريقة التخزين", "Storage method")} value={d.storageMethod} onChange={(e) => set({ storageMethod: e.target.value })} options={[{ value: "", label: "—" }, ...[...new Set([...(prod.settings?.storageMethods ?? []), d.storageMethod].filter(Boolean))].map((s) => ({ value: s, label: s }))]} />
        </div>
        <Textarea label={L("شرح مبسط للمكونات", "Short ingredients description")} rows={2} value={d.ingredientsText} onChange={(e) => set({ ingredientsText: e.target.value })} />
        {d.method === "fat" ? null : <LinesEditor readOnly={readOnly} title={L("الوصفة", "Recipe")} hint={per} lines={d.lines} onChange={(lines) => set({ lines })} items={prod.items.filter((i) => i.id !== product?.stockItemId)} itemById={prod.itemById} unitCost={prod.unitCost} />}
        <LinesEditor readOnly={readOnly} title={L("باكيج التخزين", "Storage packaging")} hint={per} lines={d.packaging} onChange={(packaging) => set({ packaging })} items={prod.items.filter((i) => i.id !== product?.stockItemId)} itemById={prod.itemById} unitCost={prod.unitCost} />
        <Switch checked={d.active} onChange={(active) => set({ active })} label={L("المنتج شغال", "Active")} description={L("المنتج الموقوف لا يظهر في التشغيلات الجديدة", "Inactive products are hidden from new batches")} />
      </fieldset>
    </Dialog>
  );
}

const codeOf = (prod: Prod, c: MfgCategory) => prod.products.find((p) => p.category === c)?.categoryCode ?? Math.max(0, ...prod.products.map((p) => p.categoryCode)) + 1;
