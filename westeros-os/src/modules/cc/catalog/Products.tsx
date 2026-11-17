/** 3.2 المنتجات المصنعة: the table of products, add and edit. The recipe itself is defined under التصنيع > الوصفات. */
import { searchHit } from "@/lib/search";
import { useMemo, useState } from "react";
import { ChefHat, Plus, Search } from "lucide-react";
import { useSession } from "@/auth/session";
import { useDb, useLive } from "@/data/hooks";
import type { MfgChickenMode, MfgMethod, MfgProduct, MfgStorageTemp } from "@/data/types";
import { Num } from "@/modules/production/ui";
import { categoryName } from "@/modules/production/useProduction";
import { Button, Card, Dialog, EmptyState, Input, Select, Table, Textarea, useToast, type Column } from "@/ui";
import { codeRanges, nextCodeIn, num, productStoreType, STORE_TYPE_OPTIONS, storeTemp, storeTypeName, tempOfStoreType } from "../lib";
import { ExportButton, ImageField, ReadOnly } from "../ui";
import { sheetCode, sheetNumber } from "../xlsx";
import { useCc, type Cc } from "../useCc";
import { BulkBar, useSelection, type DeleteResult } from "./Bulk";
import { ExcelImport, type ImportField, type ImportPlan } from "./Import";
import { stockItemUse } from "./usage";

const FIELDS: ImportField[] = [
  { key: "كود المنتج", aliases: ["الكود", "كود", "رقم الصنف", "كود الصنف", "code", "sku"] },
  { key: "اسم المنتج", aliases: ["الاسم", "اسم الصنف", "الصنف", "name"] },
  { key: "فئة المنتج", aliases: ["الفئة", "فئة", "المجموعة", "القسم", "category"] },
  { key: "طريقة التخزين" },
  { key: "كمية وحدة التخزين", aliases: ["الكمية في وحدة التخزين"] },
  { key: "صلاحية المنتج", aliases: ["الصلاحية", "مدة الصلاحية", "ايام الصلاحية"] },
  { key: "وزن الحصة", aliases: ["وزن البورشن", "الحصة"] },
];
/** كود المنتج as the system writes it: a bare number in the file is the same code (12 = M012) */
const productCode = (v: string | undefined) => {
  const c = sheetCode(v).toUpperCase();
  return /^\d+$/.test(c) ? `M${c.padStart(3, "0")}` : c;
};

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
  const db = useDb();
  const prod = cc.prod;
  const { can } = useSession();
  const recipes = useLive("recipes").data;
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("");
  const [edit, setEdit] = useState<MfgProduct | "new" | null>(null);
  const manage = can("production.manage");
  const rows = useMemo(() => {
    const n = q.trim().toLowerCase();
    return prod.products.filter((p) => (!cat || p.category === cat) && searchHit(n, p.name.ar, p.code));
  }, [prod.products, q, cat]);
  const sel = useSelection(rows, (p) => p.id);
  const columns: Column<MfgProduct>[] = [
    ...(manage ? [sel.column] : []),
    { key: "code", header: "كود المنتج", cell: (p) => <span className="num text-muted">{p.code}</span> },
    { key: "name", header: "اسم المنتج", cell: (p) => <span className="font-semibold">{p.name.ar}</span> },
    { key: "cat", header: "فئة المنتج", cell: (p) => categoryName(prod.categories, p.category).ar },
    { key: "unit", header: "وحدة التصنيع", hideOnMobile: true, cell: (p) => p.mfgUnit ?? (p.unit === "kg" ? "كيلو" : "قطعة") },
    { key: "sm", header: "طريقة التخزين", hideOnMobile: true, cell: (p) => p.storageMethod || "—" },
    { key: "sq", header: "كمية وحدة التخزين", align: "end", hideOnMobile: true, cell: (p) => (p.storageQty ? <span className="num">{num(p.storageQty)}</span> : "—") },
    { key: "stype", header: "نوع المخزن", hideOnMobile: true, cell: (p) => storeTypeName(productStoreType(p)) },
    { key: "temp", header: "درجة حرارة التخزين", hideOnMobile: true, cell: (p) => <span className="num" dir="ltr">{storeTemp(productStoreType(p))}</span> },
    { key: "life", header: "صلاحية المنتج", align: "end", cell: (p) => <span className="num">{p.shelfLifeDays} يوم</span> },
    { key: "por", header: "وزن الحصة", align: "end", hideOnMobile: true, cell: (p) => (p.portionGrams ? <span className="num">{p.portionGrams} جم</span> : "—") },
    { key: "m", header: "طريقة التصنيع", hideOnMobile: true, cell: (p) => <span className="text-[13px]">{methodLabel(p)}</span> },
  ];
  // `dry`: only say what the file would add and edit (the review step); nothing is written
  const importRows = async (sheet: Record<string, string>[], dry: boolean): Promise<ImportPlan> => {
    const plan: ImportPlan = { added: [], updated: [], skipped: 0 };
    const fresh = new Set<string>();
    const byCode = new Map(prod.products.map((p) => [p.code.toUpperCase(), p]));
    const catByName = new Map(prod.categories.map((c) => [c.name.ar.trim(), c]));
    const store = cc.warehouses.find((l) => l.type === "products")?.id ?? prod.settings?.productLocationId ?? null;
    let sort = prod.products.length;
    for (const r of sheet) {
      const code = productCode(r["كود المنتج"]);
      if (!code) {
        plan.skipped++;
        continue;
      }
      const has = (k: string) => (r[k] ?? "").trim() !== "";
      const cur = byCode.get(code);
      const n = has("اسم المنتج") ? r["اسم المنتج"].trim() : (cur?.name.ar ?? "");
      const c = has("فئة المنتج") ? catByName.get(r["فئة المنتج"].trim()) : undefined;
      // a new product needs a name and a category defined in the constants (the batch number starts with it)
      const ok = cur ? true : !!n && !!c;
      if (dry || !ok) {
        if (cur) plan.updated.push({ code, name: n });
        else if (fresh.has(code)) continue;
        else if (ok) (fresh.add(code), plan.added.push({ code, name: n }));
        else plan.skipped++;
        continue;
      }
      const patch = {
        ...(has("طريقة التخزين") ? { storageMethod: r["طريقة التخزين"].trim() } : {}),
        ...(has("كمية وحدة التخزين") ? { storageQty: sheetNumber(r["كمية وحدة التخزين"]) || null } : {}),
        ...(has("صلاحية المنتج") ? { shelfLifeDays: Math.round(sheetNumber(r["صلاحية المنتج"])) } : {}),
        ...(has("وزن الحصة") ? { portionGrams: sheetNumber(r["وزن الحصة"]) || null } : {}),
      };
      if (cur) {
        const name = { ar: n, en: cur.name.en && cur.name.en !== cur.name.ar ? cur.name.en : n };
        await db.update("mfgProducts", cur.id, { name, ...(c ? { category: c.id, categoryCode: c.code } : {}), ...patch });
        if (n !== cur.name.ar) await db.update("stockItems", cur.stockItemId, { name });
        if (fresh.has(code)) continue;
        plan.updated.push({ code, name: n });
      } else {
        // a new product is stocked by weight (تصنيع مباشر بالوزن) until its method is chosen on its card
        const name = { ar: n, en: n };
        const item = await db.insert("stockItems", {
          name, baseUnit: "g", countUnit: "kg", sku: code, category: "prep", kind: "prep", packs: [], account: "food", levels: { min: 0, par: 0, max: 0 }, branchLevels: {}, supplierIds: [], preferredSupplierId: null, lastCost: 0,
          defaultLocationIds: store ? [store] : [], trackBatches: true, shelfLifeDays: null, vatBp: 0, yieldBp: 10_000, allergens: [], active: true, note: "منتج مصنع", marketKey: null,
        });
        const made = await db.insert("mfgProducts", {
          name, imageUrl: null, category: c!.id, categoryCode: c!.code, mfgUnit: "كيلو", storageMethod: "", storageQty: null, storageTemp: "chilled", shelfLifeDays: 0, ingredientsText: "", portionGrams: null,
          method: "weight", chickenMode: null, unit: "kg", ...patch, code, recipeType: "main", lines: [], packaging: [], stockItemId: item.id, active: true, sort: ++sort,
        });
        byCode.set(code, made);
        fresh.add(code);
        plan.added.push({ code, name: n });
      }
    }
    return plan;
  };
  const move = async (category: string) => {
    const c = prod.categories.find((x) => x.id === category);
    if (!c) return 0;
    for (const p of sel.rows) if (p.category !== c.id) await db.update("mfgProducts", p.id, { category: c.id, categoryCode: c.code });
    return sel.rows.length;
  };
  const remove = async (): Promise<DeleteResult> => {
    const out: DeleteResult = { deleted: 0, refused: [] };
    for (const p of sel.rows) {
      const why = prod.batches.some((b) => b.outputs.some((o) => o.productId === p.id)) ? "له تشغيلات مسجلة" : await stockItemUse(db, cc, recipes, p.stockItemId, p.id);
      if (why) {
        out.refused.push({ name: p.name.ar, why });
        continue;
      }
      try {
        await db.remove("mfgProducts", p.id);
        await db.remove("stockItems", p.stockItemId);
        out.deleted++;
      } catch {
        out.refused.push({ name: p.name.ar, why: "مرتبط ببيانات أخرى" });
      }
    }
    return out;
  };
  return (
    <div className="grid gap-4">
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_220px_auto_auto_auto]">
        <Input icon={<Search />} placeholder="ابحث باسم المنتج أو الكود" value={q} onChange={(e) => setQ(e.target.value)} />
        <Select value={cat} onChange={(e) => setCat(e.target.value)} options={[{ value: "", label: "كل الفئات" }, ...prod.categories.map((c) => ({ value: c.id, label: c.name.ar }))]} />
        <ExportButton file="المنتجات المصنعة" head={["كود المنتج", "اسم المنتج", "فئة المنتج", "وحدة التصنيع", "طريقة التخزين", "كمية وحدة التخزين", "نوع المخزن", "درجة حرارة التخزين", "صلاحية المنتج (يوم)", "وزن الحصة (جم)", "طريقة التصنيع"]}
          rows={() => rows.map((p) => [p.code, p.name.ar, categoryName(prod.categories, p.category).ar, p.mfgUnit ?? (p.unit === "kg" ? "كيلو" : "قطعة"), p.storageMethod, p.storageQty, storeTypeName(productStoreType(p)), storeTemp(productStoreType(p)), p.shelfLifeDays, p.portionGrams, methodLabel(p)])} />
        {manage ? <ExcelImport fields={FIELDS} run={importRows} skipNote="من غير كود، أو منتج جديد من غير اسم أو من غير فئة معرفة في ثوابت النظام." /> : null}
        {manage ? <Button icon={<Plus />} onClick={() => setEdit("new")}>اضافة منتج</Button> : null}
      </div>
      {manage ? <BulkBar count={sel.rows.length} noun="منتج" onClear={sel.clear} onEdit={() => setEdit(sel.rows[0])} categories={prod.categories.map((c) => ({ value: c.id, label: c.name.ar }))} onMove={move} onDelete={remove} /> : null}
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
  const [d, setD] = useState(() => ({
    name: product?.name.ar ?? "", imageUrl: product?.imageUrl ?? null, category: product?.category ?? prod.categories[0]?.id ?? "", mfgUnit: product?.mfgUnit ?? "",
    storageMethod: product?.storageMethod ?? "", storageQty: product?.storageQty ?? 0, storeType: product ? productStoreType(product) : "cold", shelfLifeDays: product?.shelfLifeDays ?? 0,
    ingredientsText: product?.ingredientsText ?? "", portionGrams: product?.portionGrams ?? 0, method: product ? methodValue(product) : "weight",
  }));
  const [busy, setBusy] = useState(false);
  const set = (p: Partial<typeof d>) => setD((x) => ({ ...x, ...p }));
  // كود المنتج: the next free code of the category's range (ثوابت النظام)
  const nextNo = nextCodeIn(codeRanges(cc.lists.codeRanges?.product, prod.categories.map((c) => c.id))[d.category], prod.products.map((p) => p.code));
  const nextCode = nextNo ? `M${String(nextNo).padStart(3, "0")}` : "";
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
        name, imageUrl: d.imageUrl, category: d.category, categoryCode: c?.code ?? product?.categoryCode ?? 0, mfgUnit, storageMethod: d.storageMethod, storageQty: d.storageQty || null, storeType: d.storeType, storageTemp: tempOfStoreType(d.storeType),
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
      footer={<div className="flex justify-end gap-2"><Button variant="ghost" onClick={onClose}>{readOnly ? "إغلاق" : "إلغاء"}</Button>{readOnly ? null : <Button loading={busy} disabled={!d.name.trim() || !d.category || (!product && !nextCode)} onClick={save}>حفظ</Button>}</div>}>
      <fieldset disabled={readOnly} className="grid gap-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Input label="اسم المنتج" value={d.name} onChange={(e) => set({ name: e.target.value })} />
          <ReadOnly label="كود المنتج"><span className="num">{product?.code ?? (nextCode || "أكواد الفئة خلصت")}</span></ReadOnly>
        </div>
        <ImageField value={d.imageUrl} onChange={(imageUrl) => set({ imageUrl })} />
        <div className="grid gap-3 sm:grid-cols-2">
          <Select label="فئة المنتج" value={d.category} onChange={(e) => set({ category: e.target.value })} options={[...(prod.categories.some((c) => c.id === d.category) ? [] : [{ value: d.category, label: "—" }]), ...prod.categories.map((c) => ({ value: c.id, label: c.name.ar }))]} />
          <Select label="وحدة التصنيع" value={mfgUnit} onChange={(e) => set({ mfgUnit: e.target.value })} options={[...new Set([...cc.lists.mfgUnits.map((u) => u.name), mfgUnit])].map((u) => ({ value: u, label: u }))} />
          <Select label="طريقة التخزين" value={d.storageMethod} onChange={(e) => set({ storageMethod: e.target.value })} options={[{ value: "", label: "—" }, ...[...new Set([...(prod.settings?.storageMethods ?? []), d.storageMethod].filter(Boolean))].map((s) => ({ value: s, label: s }))]} />
          <Num label="كمية وحدة التخزين" value={d.storageQty} onChange={(storageQty) => set({ storageQty })} hint={d.storageMethod ? `الكمية لكل ${d.storageMethod}` : "الكمية لكل وحدة تخزين"} />
          <Select label="نوع المخزن" value={d.storeType} onChange={(e) => set({ storeType: e.target.value })} options={STORE_TYPE_OPTIONS} />
          <ReadOnly label="درجة حرارة التخزين"><span className="num" dir="ltr">{storeTemp(d.storeType)}</span></ReadOnly>
          <Num label="صلاحية المنتج" suffix="يوم" value={d.shelfLifeDays} onChange={(shelfLifeDays) => set({ shelfLifeDays })} />
          <Num label="وزن الحصة" suffix="جم" value={d.portionGrams} onChange={(portionGrams) => set({ portionGrams })} hint="ان وجد" />
          <Select label="طريقة التصنيع" disabled={locked} hint={locked ? "لا تتغير بعد تسجيل تشغيلات" : undefined} value={d.method} onChange={(e) => set({ method: e.target.value })} options={METHOD_OPTIONS.map((o) => ({ value: o.value, label: o.label }))} />
        </div>
        <Textarea label="المكونات (شرح مبسط للمكونات لطباعة ستيكر الصلاحية)" rows={2} value={d.ingredientsText} onChange={(e) => set({ ingredientsText: e.target.value })} />
      </fieldset>
    </Dialog>
  );
}
