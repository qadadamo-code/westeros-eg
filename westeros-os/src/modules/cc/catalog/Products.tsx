/** 3.2 المنتجات المصنعة: the table of products, add and edit. The recipe itself is defined under التصنيع > الوصفات. */
import { useMemo, useState } from "react";
import { ChefHat, Plus, Search } from "lucide-react";
import { useSession } from "@/auth/session";
import { useDb } from "@/data/hooks";
import type { MfgChickenMode, MfgMethod, MfgProduct, MfgStorageTemp } from "@/data/types";
import { Num } from "@/modules/production/ui";
import { categoryName } from "@/modules/production/useProduction";
import { Button, Card, Dialog, EmptyState, Input, Select, Table, Textarea, useToast, type Column } from "@/ui";
import { num } from "../lib";
import { ImageField, ReadOnly } from "../ui";
import { useCc, type Cc } from "../useCc";

/** طريقة التصنيع, as the document lists the methods (5.1) */
export const METHOD_OPTIONS: { value: string; method: MfgMethod; mode: MfgChickenMode | null; label: string }[] = [
  { value: "weight", method: "weight", mode: null, label: "تصنيع مباشر للمنتج يخزن بالوزن" },
  { value: "portion", method: "portion", mode: null, label: "تصنيع مباشر للمنتج يخزن بحصة محددة (بورشن)" },
  { value: "chicken:weight", method: "chicken", mode: "weight", label: "من مادة خام واحدة: تصنيع مباشر لمنتج بالوزن" },
  { value: "chicken:pre_count", method: "chicken", mode: "pre_count", label: "من مادة خام واحدة: متبل قبل العد" },
  { value: "chicken:post_count", method: "chicken", mode: "post_count", label: "من مادة خام واحدة: متبل بعد العد" },
  { value: "burger", method: "burger", mode: null, label: "تصنيع البرجر (لحم / دجاج)" },
];
export const methodValue = (p: Pick<MfgProduct, "method" | "chickenMode">) => (p.method === "chicken" ? `chicken:${p.chickenMode ?? "weight"}` : p.method);
export const methodLabel = (p: Pick<MfgProduct, "method" | "chickenMode">) => METHOD_OPTIONS.find((o) => o.value === methodValue(p))?.label ?? "";
export const TEMP_LABEL: Record<MfgStorageTemp, string> = { chilled: "تبريد 5°", frozen: "تجميد -17°", room: "الغرفة 25°" };
const unitOf = (method: MfgMethod, mode: MfgChickenMode | null): "kg" | "pc" => (method === "weight" || (method === "chicken" && (mode ?? "weight") === "weight") ? "kg" : "pc");

export default function Products() {
  const cc = useCc();
  const prod = cc.prod;
  const { can } = useSession();
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("");
  const [edit, setEdit] = useState<MfgProduct | "new" | null>(null);
  const manage = can("production.manage");
  const rows = useMemo(() => {
    const n = q.trim().toLowerCase();
    return prod.products.filter((p) => (!cat || p.category === cat) && (!n || p.name.ar.toLowerCase().includes(n) || p.code.toLowerCase().includes(n)));
  }, [prod.products, q, cat]);
  const columns: Column<MfgProduct>[] = [
    { key: "code", header: "كود المنتج", cell: (p) => <span className="num text-muted">{p.code}</span> },
    { key: "name", header: "اسم المنتج", cell: (p) => <span className="font-semibold">{p.name.ar}</span> },
    { key: "cat", header: "فئة المنتج", cell: (p) => categoryName(prod.categories, p.category).ar },
    { key: "unit", header: "وحدة التصنيع", hideOnMobile: true, cell: (p) => p.mfgUnit ?? (p.unit === "kg" ? "كيلو" : "قطعة") },
    { key: "sm", header: "طريقة التخزين", hideOnMobile: true, cell: (p) => p.storageMethod || "—" },
    { key: "sq", header: "كمية وحدة التخزين", align: "end", hideOnMobile: true, cell: (p) => (p.storageQty ? <span className="num">{num(p.storageQty)}</span> : "—") },
    { key: "temp", header: "درجة حرارة التخزين", hideOnMobile: true, cell: (p) => TEMP_LABEL[p.storageTemp] },
    { key: "life", header: "صلاحية المنتج", align: "end", cell: (p) => <span className="num">{p.shelfLifeDays} يوم</span> },
    { key: "por", header: "وزن الحصة", align: "end", hideOnMobile: true, cell: (p) => (p.portionGrams ? <span className="num">{p.portionGrams} جم</span> : "—") },
    { key: "m", header: "طريقة التصنيع", hideOnMobile: true, cell: (p) => <span className="text-[13px]">{methodLabel(p)}</span> },
  ];
  return (
    <div className="grid gap-4">
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_220px_auto]">
        <Input icon={<Search />} placeholder="ابحث باسم المنتج أو الكود" value={q} onChange={(e) => setQ(e.target.value)} />
        <Select value={cat} onChange={(e) => setCat(e.target.value)} options={[{ value: "", label: "كل الفئات" }, ...prod.categories.map((c) => ({ value: c.id, label: c.name.ar }))]} />
        {manage ? <Button icon={<Plus />} onClick={() => setEdit("new")}>اضافة منتج</Button> : null}
      </div>
      <Card className="overflow-hidden">
        <Table columns={columns} rows={rows} rowKey={(p) => p.id} dense onRowClick={(p) => setEdit(p)} empty={<EmptyState compact icon={<ChefHat />} title="لا توجد منتجات مصنعة" />} />
      </Card>
      {edit ? <ProductDialog key={edit === "new" ? "new" : edit.id} product={edit === "new" ? null : edit} cc={cc} readOnly={!manage} onClose={() => setEdit(null)} /> : null}
    </div>
  );
}

function ProductDialog({ product, cc, readOnly, onClose }: { product: MfgProduct | null; cc: Cc; readOnly: boolean; onClose: () => void }) {
  const db = useDb();
  const { toast } = useToast();
  const prod = cc.prod;
  const nextCode = `M${String(Math.max(prod.products.length + 1, ...prod.products.map((p) => (Number(p.code.replace(/\D/g, "")) || 0) + 1))).padStart(3, "0")}`;
  const [d, setD] = useState(() => ({
    name: product?.name.ar ?? "", imageUrl: product?.imageUrl ?? null, category: product?.category ?? prod.categories[0]?.id ?? "", mfgUnit: product?.mfgUnit ?? "",
    storageMethod: product?.storageMethod ?? "", storageQty: product?.storageQty ?? 0, storageTemp: product?.storageTemp ?? ("chilled" as MfgStorageTemp), shelfLifeDays: product?.shelfLifeDays ?? 0,
    ingredientsText: product?.ingredientsText ?? "", portionGrams: product?.portionGrams ?? 0, method: product ? methodValue(product) : "weight",
  }));
  const [busy, setBusy] = useState(false);
  const set = (p: Partial<typeof d>) => setD((x) => ({ ...x, ...p }));
  // the way a product is made decides how it is stocked (kilos or pieces): fixed once it has batches
  const locked = !!product && prod.batches.some((b) => b.outputs.some((o) => o.productId === product.id));
  const opt = METHOD_OPTIONS.find((o) => o.value === d.method) ?? METHOD_OPTIONS[0];
  const unit = unitOf(opt.method, opt.mode);
  const mfgUnit = d.mfgUnit || (unit === "kg" ? "كيلو" : "قطعة");
  const save = async () => {
    setBusy(true);
    try {
      const n = d.name.trim();
      const name = { ar: n, en: product?.name.en && product.name.en !== product.name.ar ? product.name.en : n };
      const c = prod.categories.find((x) => x.id === d.category);
      const fields = {
        name, imageUrl: d.imageUrl, category: d.category, categoryCode: c?.code ?? product?.categoryCode ?? 0, mfgUnit, storageMethod: d.storageMethod, storageQty: d.storageQty || null, storageTemp: d.storageTemp,
        shelfLifeDays: Math.round(d.shelfLifeDays), ingredientsText: d.ingredientsText, portionGrams: d.portionGrams || null, method: opt.method, chickenMode: opt.mode, unit,
      };
      const stock = { name, baseUnit: unit === "kg" ? ("g" as const) : ("pc" as const), countUnit: unit === "kg" ? "kg" : "pc" };
      if (product) {
        await db.update("mfgProducts", product.id, fields);
        await db.update("stockItems", product.stockItemId, locked ? { name } : stock);
      } else {
        const store = cc.warehouses.find((l) => l.type === "products")?.id ?? prod.settings?.productLocationId ?? null;
        const item = await db.insert("stockItems", {
          ...stock, sku: nextCode, category: "prep", kind: "prep", packs: [], account: "food", levels: { min: 0, par: 0, max: 0 }, branchLevels: {}, supplierIds: [], preferredSupplierId: null, lastCost: 0,
          defaultLocationIds: store ? [store] : [], trackBatches: true, shelfLifeDays: null, vatBp: 0, yieldBp: 10_000, allergens: [], active: true, note: "منتج مصنع", marketKey: null,
        });
        await db.insert("mfgProducts", { ...fields, code: nextCode, recipeType: "main", lines: [], packaging: [], stockItemId: item.id, active: true, sort: prod.products.length + 1 });
      }
      toast({ tone: "success", title: "تم حفظ المنتج" });
      onClose();
    } catch (e) {
      toast({ tone: "error", title: "تعذر الحفظ", description: String((e as Error).message ?? e) });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open onClose={onClose} size="xl" title={product ? "تعديل منتج" : "اضافة منتج"}
      footer={<div className="flex justify-end gap-2"><Button variant="ghost" onClick={onClose}>{readOnly ? "إغلاق" : "إلغاء"}</Button>{readOnly ? null : <Button loading={busy} disabled={!d.name.trim() || !d.category} onClick={save}>حفظ</Button>}</div>}>
      <fieldset disabled={readOnly} className="grid gap-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Input label="اسم المنتج" value={d.name} onChange={(e) => set({ name: e.target.value })} />
          <ReadOnly label="كود المنتج"><span className="num">{product?.code ?? nextCode}</span></ReadOnly>
        </div>
        <ImageField value={d.imageUrl} onChange={(imageUrl) => set({ imageUrl })} />
        <div className="grid gap-3 sm:grid-cols-2">
          <Select label="فئة المنتج" value={d.category} onChange={(e) => set({ category: e.target.value })} options={[...(prod.categories.some((c) => c.id === d.category) ? [] : [{ value: d.category, label: "—" }]), ...prod.categories.map((c) => ({ value: c.id, label: c.name.ar }))]} />
          <Select label="وحدة التصنيع" value={mfgUnit} onChange={(e) => set({ mfgUnit: e.target.value })} options={[...new Set([...cc.lists.mfgUnits.map((u) => u.name), mfgUnit])].map((u) => ({ value: u, label: u }))} />
          <Select label="طريقة التخزين" value={d.storageMethod} onChange={(e) => set({ storageMethod: e.target.value })} options={[{ value: "", label: "—" }, ...[...new Set([...(prod.settings?.storageMethods ?? []), d.storageMethod].filter(Boolean))].map((s) => ({ value: s, label: s }))]} />
          <Num label="كمية وحدة التخزين" value={d.storageQty} onChange={(storageQty) => set({ storageQty })} hint={d.storageMethod ? `الكمية لكل ${d.storageMethod}` : "الكمية لكل وحدة تخزين"} />
          <Select label="درجة حرارة التخزين" value={d.storageTemp} onChange={(e) => set({ storageTemp: e.target.value as MfgStorageTemp })} options={(Object.keys(TEMP_LABEL) as MfgStorageTemp[]).map((t) => ({ value: t, label: TEMP_LABEL[t] }))} />
          <Num label="صلاحية المنتج" suffix="يوم" value={d.shelfLifeDays} onChange={(shelfLifeDays) => set({ shelfLifeDays })} />
          <Num label="وزن الحصة" suffix="جم" value={d.portionGrams} onChange={(portionGrams) => set({ portionGrams })} hint="ان وجد" />
          <Select label="طريقة التصنيع" disabled={locked} hint={locked ? "لا تتغير بعد تسجيل تشغيلات" : undefined} value={d.method} onChange={(e) => set({ method: e.target.value })} options={METHOD_OPTIONS.map((o) => ({ value: o.value, label: o.label }))} />
        </div>
        <Textarea label="المكونات (شرح مبسط للمكونات لطباعة ستيكر الصلاحية)" rows={2} value={d.ingredientsText} onChange={(e) => set({ ingredientsText: e.target.value })} />
      </fieldset>
    </Dialog>
  );
}
