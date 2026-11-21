/** 5.2 الوصفات: every defined recipe in one list; a recipe is defined for a product chosen from the manufactured products. */
import { useArea } from "../useAccess";
import { searchHit } from "@/lib/search";
import { useMemo, useState } from "react";
import { BookOpenCheck, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { useSession } from "@/auth/session";
import { useDb } from "@/data/hooks";
import type { MfgProduct, MfgRecipeLine } from "@/data/types";
import { packagingItems, recipeItems } from "@/modules/production/ProductsPage";
import { LinesEditor } from "@/modules/production/ui";
import { categoryName } from "@/modules/production/useProduction";
import { Badge, Button, Card, Dialog, EmptyState, Input, Select, Table, useToast, type Column } from "@/ui";
import { methodLabel } from "../catalog/Products";
import { productStoreType, storeTemp, storeTypeName } from "../lib";
import { ReadOnly } from "../ui";
import { useCc, type Cc } from "../useCc";

type RecipeType = MfgProduct["recipeType"];
/** a product that already has a recipe: it cannot get a second one */
const hasRecipe = (p: MfgProduct) => p.recipeDefined || p.lines.length > 0;
const clean = (l: MfgRecipeLine[]) => l.filter((x) => x.qty > 0);

export default function Recipes() {
  const cc = useCc();
  const db = useDb();
  const { toast } = useToast();
  const prod = cc.prod;
  const { can } = useSession();
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("");
  const [rtype, setRtype] = useState<RecipeType | "">("");
  const [del, setDel] = useState<MfgProduct | null>(null);
  const [busy, setBusy] = useState(false);
  // حذف الوصفة: the product itself and its batches stay; only its ingredients and storage packaging are cleared
  const remove = async () => {
    if (!del) return;
    setBusy(true);
    try {
      await db.update("mfgProducts", del.id, { lines: [], packaging: [], mfgNotes: "", recipeDefined: false });
      toast({ tone: "success", title: `تم حذف وصفة ${del.name.ar}` });
      setDel(null);
    } catch (e) {
      toast({ tone: "error", title: "تعذر الحذف", description: String((e as Error).message ?? e) });
    } finally {
      setBusy(false);
    }
  };
  const [open, setOpen] = useState<MfgProduct | "new" | null>(null);
  const manage = can("production.manage");
  const area = useArea();
  const names = cc.lists.recipeNames;
  const rows = useMemo(() => {
    const n = q.trim().toLowerCase();
    return prod.products.filter((p) => hasRecipe(p) && (!cat || p.category === cat) && (!rtype || p.recipeType === rtype) && searchHit(n, p.name.ar, p.code));
  }, [prod.products, q, cat, rtype]);
  // only the categories that have products, in the order of the constants
  const cats = useMemo(() => prod.categories.filter((c) => prod.products.some((p) => p.category === c.id)), [prod.categories, prod.products]);
  const free = prod.products.some((p) => p.active && !hasRecipe(p));
  const columns: Column<MfgProduct>[] = [
    { key: "code", header: "كود المنتج", cell: (p) => <span className="num text-muted">{p.code}</span> },
    { key: "name", header: "اسم المنتج", cell: (p) => <span className="font-semibold">{p.name.ar}</span> },
    { key: "cat", header: "فئة المنتج", hideOnMobile: true, cell: (p) => categoryName(prod.categories, p.category).ar },
    { key: "type", header: "نوع الوصفة", cell: (p) => <Badge tone={p.recipeType === "main" ? "primary" : "brass"} size="sm">{names[p.recipeType]}</Badge> },
    { key: "n", header: "المكونات", align: "end", cell: (p) => <span className="num">{p.lines.length}</span> },
    ...(manage && (area.edit || area.delete)
      ? [{ key: "edit", header: "", align: "end" as const, cell: (p: MfgProduct) => (
          <span className="inline-flex gap-2">
            {area.edit ? <Button size="sm" variant="outline" icon={<Pencil className="size-4" />} onClick={(e) => { e.stopPropagation(); setOpen(p); }}>تعديل</Button> : null}
            {area.delete ? <Button size="sm" variant="outline" className="text-danger" icon={<Trash2 className="size-4" />} onClick={(e) => { e.stopPropagation(); setDel(p); }}>حذف</Button> : null}
          </span>
        ) }]
      : []),
  ];
  return (
    <div className="grid gap-4">
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_190px_170px_auto]">
        <Input icon={<Search />} placeholder="ابحث باسم المنتج أو الكود" value={q} onChange={(e) => setQ(e.target.value)} />
        <Select aria-label="فئة المنتج" value={cat} onChange={(e) => setCat(e.target.value)} options={[{ value: "", label: "كل الفئات" }, ...cats.map((c) => ({ value: c.id, label: c.name.ar }))]} />
        <Select aria-label="نوع الوصفة" value={rtype} onChange={(e) => setRtype(e.target.value as RecipeType | "")} options={[{ value: "", label: "كل أنواع الوصفات" }, ...(["main", "sub", "marinade"] as const).map((t) => ({ value: t, label: names[t] }))]} />
        {manage && area.add ? <Button icon={<Plus />} disabled={!free} title={free || !prod.products.length ? undefined : "كل المنتجات المصنعة لها وصفات"} onClick={() => setOpen("new")}>تعريف وصفة</Button> : null}
      </div>
      <Card className="overflow-hidden">
        <Table columns={columns} rows={rows} rowKey={(p) => p.id} dense onRowClick={(p) => setOpen(p)} empty={<EmptyState compact icon={<BookOpenCheck />} title="لا توجد وصفات معرفة" body={prod.products.length ? undefined : "أضف المنتجات المصنعة أولاً من قائمة المنتجات والخامات"} />} />
      </Card>
      {del ? (
        <Dialog open onClose={() => (busy ? undefined : setDel(null))} size="sm" title={`حذف وصفة ${del.name.ar}؟`}
          description={`هتتمسح مكونات الوصفة (${del.lines.length}) وباكيج التخزين. المنتج نفسه والتشغيلات المسجلة يفضلوا زي ما هم، وتقدر ترجع عن الحذف من السجل والاسترجاع.`}
          footer={<div className="flex justify-end gap-2"><Button variant="ghost" disabled={busy} onClick={() => setDel(null)}>إلغاء</Button><Button variant="danger" loading={busy} icon={<Trash2 />} onClick={remove}>حذف الوصفة</Button></div>}>
          {null}
        </Dialog>
      ) : null}
      {open ? <RecipeDialog key={open === "new" ? "new" : open.id} product={open === "new" ? null : open} cc={cc} readOnly={!manage || (open === "new" ? !area.add : !area.edit)} onClose={() => setOpen(null)} /> : null}
    </div>
  );
}

function RecipeDialog({ product, cc, readOnly, onClose }: { product: MfgProduct | null; cc: Cc; readOnly: boolean; onClose: () => void }) {
  const db = useDb();
  const { toast } = useToast();
  const prod = cc.prod;
  const names = cc.lists.recipeNames;
  const [pid, setPid] = useState(product?.id ?? "");
  const p = prod.productById.get(pid) ?? null;
  const [type, setType] = useState<RecipeType>(product?.recipeType ?? "main");
  const [lines, setLines] = useState<MfgRecipeLine[]>(product?.lines ?? []);
  const [packaging, setPackaging] = useState<MfgRecipeLine[]>(product?.packaging ?? []);
  const [notes, setNotes] = useState(product?.mfgNotes ?? "");
  const [busy, setBusy] = useState(false);
  const pick = (id: string) => {
    const x = prod.productById.get(id);
    setPid(id);
    setType(x?.recipeType ?? "main");
    setLines(x?.lines ?? []);
    setPackaging(x?.packaging ?? []);
    setNotes(x?.mfgNotes ?? "");
  };
  const changeType = (t: RecipeType) => {
    // قائمة المكونات تظهر حسب نوع الوصفة: drop what the new type may not contain
    const ok = new Set(recipeItems(prod, t, p?.stockItemId).map((i) => i.id));
    setType(t);
    setLines((l) => l.filter((x) => ok.has(x.itemId)));
  };
  const per = p && (p.method === "weight" || p.method === "portion") ? "العيارات لوجبة واحدة" : "العيارات لكل كيلو صافي";
  const save = async () => {
    if (!p) return;
    // لا تكرار للوصفات: a new recipe for a product that already has one is refused (another device may have saved it meanwhile)
    if (!product && hasRecipe(p)) return toast({ tone: "error", title: `${p.name.ar} له وصفة بالفعل`, description: "افتح وصفته من القائمة وعدّل عليها" });
    setBusy(true);
    try {
      await db.update("mfgProducts", p.id, { recipeType: type, lines: clean(lines), packaging: clean(packaging), mfgNotes: notes.trim(), recipeDefined: true });
      toast({ tone: "success", title: "تم حفظ الوصفة" });
      onClose();
    } catch (e) {
      toast({ tone: "error", title: "تعذر الحفظ", description: String((e as Error).message ?? e) });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open onClose={onClose} size="xl" title={product ? (readOnly ? `وصفة ${product.name.ar}` : `تعديل وصفة ${product.name.ar}`) : "تعريف وصفة"}
      footer={<div className="flex justify-end gap-2"><Button variant="ghost" onClick={onClose}>{readOnly ? "إغلاق" : "إلغاء"}</Button>{readOnly ? null : <Button loading={busy} disabled={!p} onClick={save}>حفظ</Button>}</div>}>
      <fieldset disabled={readOnly} className="grid gap-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <Select label="اسم المنتج" disabled={!!product} value={pid} onChange={(e) => pick(e.target.value)} options={[{ value: "", label: "اختر من المنتجات المصنعة" }, ...prod.products.filter((x) => x.active && (x.id === product?.id || !hasRecipe(x))).map((x) => ({ value: x.id, label: `${x.name.ar} · ${x.code}` }))]} />
          <ReadOnly label="اسم الشيف">{cc.staff?.name ?? "—"}</ReadOnly>
          <Select label="نوع الوصفة" value={type} onChange={(e) => changeType(e.target.value as RecipeType)} options={(["main", "sub", "marinade"] as const).map((t) => ({ value: t, label: names[t] }))} />
        </div>
        {p ? (
          <>
            <div className="grid gap-x-6 gap-y-1.5 rounded-2xl border border-line bg-surface-2 p-4 text-[13.5px] sm:grid-cols-2">
              <Info k="كود المنتج" v={p.code} />
              <Info k="فئة المنتج" v={categoryName(prod.categories, p.category).ar} />
              <Info k="وحدة التصنيع" v={p.mfgUnit ?? (p.unit === "kg" ? "كيلو" : "قطعة")} />
              <Info k="طريقة التخزين" v={p.storageMethod ? `${p.storageMethod}${p.storageQty ? ` (${p.storageQty})` : ""}` : "—"} />
              <Info k="نوع المخزن" v={`${storeTypeName(productStoreType(p))} ${storeTemp(productStoreType(p))}`} />
              <Info k="صلاحية المنتج" v={`${p.shelfLifeDays} يوم`} />
              <Info k="وزن الحصة" v={p.portionGrams ? `${p.portionGrams} جم` : "—"} />
              <Info k="طريقة التصنيع" v={methodLabel(p)} />
            </div>
            <LinesEditor readOnly={readOnly} title="المكونات" hint={per} lines={lines} onChange={setLines} items={recipeItems(prod, type, p.stockItemId)} itemById={prod.itemById} unitCost={prod.unitCost} />
            <LinesEditor readOnly={readOnly} title="باكيج التخزين" hint={`من خامات فئة التغليف. ${p.method === "portion" || p.method === "burger" ? "العيارات لكل قطعة ناتجة" : "العيارات لكل كيلو صافي"}. يدخل في التكلفة فقط`} lines={packaging} onChange={setPackaging} items={packagingItems(prod, p.stockItemId)} itemById={prod.itemById} unitCost={prod.unitCost} />
            <label className="grid gap-1.5">
              <span className="text-[13.5px] font-semibold">ملاحظات التصنيع <span className="font-normal text-muted">(تظهر للشيف بلون بارز وقت تصنيع المنتج)</span></span>
              <textarea rows={3} dir="auto" className="w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-[14.5px] outline-none focus:border-primary" placeholder="مثال: يتقلب 10 دقايق على نار هادية، ويتبرد قبل التعبئة" value={notes} onChange={(e) => setNotes(e.target.value)} />
            </label>
          </>
        ) : null}
      </fieldset>
    </Dialog>
  );
}

function Info({ k, v }: { k: string; v: string }) {
  return <p className="flex justify-between gap-3"><span className="text-muted">{k}</span><span className="font-semibold">{v}</span></p>;
}
