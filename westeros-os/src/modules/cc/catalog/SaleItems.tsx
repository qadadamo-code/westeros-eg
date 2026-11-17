/** 3.3 أصناف البيع: the menu items table, add and edit, and the Excel import matched by the item code. */
import { useMemo, useState } from "react";
import { Plus, Search, UtensilsCrossed } from "lucide-react";
import { useSession } from "@/auth/session";
import { useDb, useLive } from "@/data/hooks";
import type { MenuCategory, MenuItem, MfgRecipeLine, Recipe } from "@/data/types";
import { formatMoney, major } from "@/lib/money";
import { MoneyInput } from "@/modules/marketing/ui";
import { LinesEditor } from "@/modules/production/ui";
import { Button, Card, Dialog, EmptyState, Input, Select, Table, useToast, type Column } from "@/ui";
import { ImageField } from "../ui";
import { sheetCode, sheetNumber } from "../xlsx";
import { codeRanges, nextCodeIn } from "../lib";
import { useCc, type Cc } from "../useCc";
import { BulkBar, useSelection, type DeleteResult } from "./Bulk";
import { ExcelImport, type ImportField, type ImportPlan } from "./Import";

const FIELDS: ImportField[] = [
  { key: "كود الصنف", aliases: ["الكود", "كود", "رقم الصنف", "code", "sku"] },
  { key: "اسم الصنف", aliases: ["الاسم", "الصنف", "name"] },
  { key: "فئة الصنف", aliases: ["الفئة", "فئة", "المجموعة", "القسم", "category"] },
  { key: "سعر البيع", aliases: ["السعر", "price"] },
];
const money = (u: number) => formatMoney(u, { lang: "ar" });
const blank = (categoryId: string): Omit<MenuItem, "id" | "createdAt" | "updatedAt" | "restaurantId"> => ({
  categoryId, name: { ar: "", en: "" }, description: { ar: "", en: "" }, price: 0, cost: null, sku: null, stationId: null, modifierGroupIds: [], tags: [], prepMinutes: 10, available: true,
  vatExempt: false, imageUrl: null, sort: 999, active: true, channelPrices: {}, branchPrices: {}, schedule: [], allergens: [], calories: null, comboOf: [], hiddenOn: [],
});

export default function SaleItems() {
  const cc = useCc();
  const db = useDb();
  const { can } = useSession();
  const items = useLive("menuItems", { orderBy: [{ field: "sort" }] }).data;
  const cats = useLive("menuCategories", { orderBy: [{ field: "sort" }] }).data;
  const recipes = useLive("recipes").data;
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("");
  const [edit, setEdit] = useState<MenuItem | "new" | null>(null);
  const manage = can("menu.edit");
  const catName = (id: string) => cats.find((c) => c.id === id)?.name.ar ?? "—";
  const recipeOf = (id: string) => recipes.find((r) => r.ownerType === "menu_item" && r.ownerId === id && !r.scopeItemId) ?? null;
  const rows = useMemo(() => {
    const n = q.trim().toLowerCase();
    return items.filter((i) => (!cat || i.categoryId === cat) && (!n || i.name.ar.toLowerCase().includes(n) || (i.sku ?? "").toLowerCase().includes(n)));
  }, [items, q, cat]);
  const sel = useSelection(rows, (i) => i.id);
  const move = async (categoryId: string) => {
    for (const i of sel.rows) if (i.categoryId !== categoryId) await db.update("menuItems", i.id, { categoryId });
    return sel.rows.length;
  };
  const remove = async (): Promise<DeleteResult> => {
    const out: DeleteResult = { deleted: 0, refused: [] };
    for (const i of sel.rows) {
      // an item that was sold stays: its orders point at it
      if ((await db.list("orderItems", { where: { itemId: i.id }, limit: 1 })).length) {
        out.refused.push({ name: i.name.ar, why: "اتباع في طلبات" });
        continue;
      }
      try {
        await db.remove("menuItems", i.id);
        for (const r of recipes.filter((x) => x.ownerType === "menu_item" && x.ownerId === i.id)) await db.remove("recipes", r.id);
        out.deleted++;
      } catch {
        out.refused.push({ name: i.name.ar, why: "مرتبط ببيانات أخرى" });
      }
    }
    return out;
  };
  const columns: Column<MenuItem>[] = [
    ...(manage ? [sel.column] : []),
    { key: "code", header: "كود الصنف", cell: (i) => <span className="num text-muted">{i.sku || "—"}</span> },
    { key: "name", header: "اسم الصنف", cell: (i) => <span className="font-semibold">{i.name.ar}</span> },
    { key: "cat", header: "فئة الصنف", cell: (i) => catName(i.categoryId) },
    { key: "comp", header: "مكونات الصنف", hideOnMobile: true, cell: (i) => { const n = recipeOf(i.id)?.lines.length ?? 0; return n ? <span className="num">{n} مكون</span> : <span className="text-faint">—</span>; } },
    { key: "price", header: "سعر البيع", align: "end", cell: (i) => <span className="num font-semibold">{money(i.price)}</span> },
  ];
  // `dry`: only say what the file would add and edit (the review step); nothing is written
  const importRows = async (sheet: Record<string, string>[], dry: boolean): Promise<ImportPlan> => {
    const plan: ImportPlan = { added: [], updated: [], skipped: 0 };
    const fresh = new Set<string>();
    const bySku = new Map(items.filter((i) => i.sku).map((i) => [i.sku as string, i]));
    const catByName = new Map(cats.map((c) => [c.name.ar.trim(), c]));
    for (const r of sheet) {
      const sku = sheetCode(r["كود الصنف"]);
      if (!sku) {
        plan.skipped++;
        continue;
      }
      const name = (r["اسم الصنف"] ?? "").trim();
      if (dry) {
        const cur = bySku.get(sku);
        if (cur) plan.updated.push({ code: sku, name: name || cur.name.ar });
        else if (fresh.has(sku)) continue;
        else if (name && ((r["فئة الصنف"] ?? "").trim() || cats[0])) (fresh.add(sku), plan.added.push({ code: sku, name }));
        else plan.skipped++;
        continue;
      }
      const cName = (r["فئة الصنف"] ?? "").trim();
      let c: MenuCategory | undefined = cName ? catByName.get(cName) : undefined;
      if (cName && !c) {
        c = await db.insert("menuCategories", { name: { ar: cName, en: cName }, sort: cats.length + catByName.size + 1, color: "#F8BB18", icon: "utensils", stationId: null, active: true });
        catByName.set(cName, c);
      }
      const price = (r["سعر البيع"] ?? "").trim() ? major(sheetNumber(r["سعر البيع"])) : null;
      const cur = bySku.get(sku);
      if (cur) {
        await db.update("menuItems", cur.id, { ...(name ? { name: { ar: name, en: cur.name.en && cur.name.en !== cur.name.ar ? cur.name.en : name } } : {}), ...(c ? { categoryId: c.id } : {}), ...(price != null ? { price } : {}) });
        if (fresh.has(sku)) continue;
        plan.updated.push({ code: sku, name: name || cur.name.ar });
      } else if (name && (c ?? cats[0])) {
        bySku.set(sku, await db.insert("menuItems", { ...blank((c ?? cats[0]).id), name: { ar: name, en: name }, sku, price: price ?? 0 }));
        fresh.add(sku);
        plan.added.push({ code: sku, name });
      } else plan.skipped++;
    }
    return plan;
  };
  return (
    <div className="grid gap-4">
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_200px_auto_auto]">
        <Input icon={<Search />} placeholder="ابحث باسم الصنف أو الكود" value={q} onChange={(e) => setQ(e.target.value)} />
        <Select value={cat} onChange={(e) => setCat(e.target.value)} options={[{ value: "", label: "كل الفئات" }, ...cats.map((c) => ({ value: c.id, label: c.name.ar }))]} />
        {manage ? <ExcelImport fields={FIELDS} run={importRows} /> : null}
        {manage ? <Button icon={<Plus />} disabled={!cats.length} onClick={() => setEdit("new")}>اضافة صنف</Button> : null}
      </div>
      {manage ? <BulkBar count={sel.rows.length} noun="صنف" onClear={sel.clear} onEdit={() => setEdit(sel.rows[0])} categories={cats.map((c) => ({ value: c.id, label: c.name.ar }))} onMove={move} onDelete={remove} /> : null}
      <Card className="overflow-hidden">
        <Table columns={columns} rows={rows} rowKey={(i) => i.id} dense onRowClick={(i) => setEdit(i)} empty={<EmptyState compact icon={<UtensilsCrossed />} title="لا توجد أصناف بيع" body={cats.length ? undefined : "عرّف فئات أصناف البيع من ثوابت النظام أولاً"} />} />
      </Card>
      {edit ? <SaleDialog key={edit === "new" ? "new" : edit.id} item={edit === "new" ? null : edit} recipe={edit === "new" ? null : recipeOf(edit.id)} cats={cats} items={items} cc={cc} readOnly={!manage} onClose={() => setEdit(null)} /> : null}
    </div>
  );
}

function SaleDialog({ item, recipe, cats, items, cc, readOnly, onClose }: { item: MenuItem | null; recipe: Recipe | null; cats: MenuCategory[]; items: MenuItem[]; cc: Cc; readOnly: boolean; onClose: () => void }) {
  const db = useDb();
  const { toast } = useToast();
  const prod = cc.prod;
  const [d, setD] = useState(() => ({ name: item?.name.ar ?? "", imageUrl: item?.imageUrl ?? null, sku: item ? item.sku ?? "" : (null as string | null), categoryId: item?.categoryId ?? cats[0]?.id ?? "", price: item?.price ?? 0 }));
  const [lines, setLines] = useState<MfgRecipeLine[]>(() => (recipe?.lines ?? []).map((l) => ({ itemId: l.itemId, qty: l.qty })));
  const [busy, setBusy] = useState(false);
  const set = (p: Partial<typeof d>) => setD((x) => ({ ...x, ...p }));
  // مكونات الصنف: المنتجات المصنعة ذات الوصفة الرئيسية فقط. الوصفات الفرعية والتتبيلات تدخل في الرئيسية، لا في صنف البيع
  // (plus anything already on this item's recipe, so an old line still shows its name)
  const choices = useMemo(() => {
    const made = new Set(prod.products.filter((p) => p.active && p.recipeType === "main").map((p) => p.stockItemId));
    const onRecipe = new Set((recipe?.lines ?? []).map((l) => l.itemId));
    return prod.items.filter((i) => (i.active && made.has(i.id)) || onRecipe.has(i.id));
  }, [prod.products, prod.items, recipe]);
  // كود الصنف: the next free code of the category's range (ثوابت النظام), until the user types one
  const auto = nextCodeIn(codeRanges(cc.lists.codeRanges?.sale, cats.map((c) => c.id))[d.categoryId], items.map((i) => i.sku));
  const sku = d.sku ?? (auto ? String(auto) : "");
  const dupe = !!sku.trim() && items.some((i) => i.sku === sku.trim() && i.id !== item?.id);
  const save = async () => {
    setBusy(true);
    try {
      const n = d.name.trim();
      const fields = { name: { ar: n, en: item?.name.en && item.name.en !== item.name.ar ? item.name.en : n }, imageUrl: d.imageUrl, sku: sku.trim() || null, categoryId: d.categoryId, price: d.price };
      const row = item ? await db.update("menuItems", item.id, fields) : await db.insert("menuItems", { ...blank(d.categoryId), ...fields, sort: items.length + 1 });
      const clean = lines.filter((l) => l.qty > 0);
      if (recipe) await db.update("recipes", recipe.id, { lines: clean, updatedBy: db.actorId });
      else if (clean.length) await db.insert("recipes", { ownerType: "menu_item", ownerId: row.id, scopeItemId: null, lines: clean, yieldQty: 1, method: "", updatedBy: db.actorId });
      toast({ tone: "success", title: "تم حفظ الصنف" });
      onClose();
    } catch (e) {
      toast({ tone: "error", title: "تعذر الحفظ", description: String((e as Error).message ?? e) });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open onClose={onClose} size="xl" title={item ? "تعديل صنف" : "اضافة صنف"}
      footer={<div className="flex justify-end gap-2"><Button variant="ghost" onClick={onClose}>{readOnly ? "إغلاق" : "إلغاء"}</Button>{readOnly ? null : <Button loading={busy} disabled={!d.name.trim() || !d.categoryId || dupe} onClick={save}>حفظ</Button>}</div>}>
      <fieldset disabled={readOnly} className="grid gap-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Input label="اسم الصنف" value={d.name} onChange={(e) => set({ name: e.target.value })} />
          <Input label="كود الصنف" dir="ltr" className="num" value={sku} onChange={(e) => set({ sku: e.target.value })} error={dupe ? "الكود مستخدم لصنف آخر" : undefined} hint={!item && d.sku === null ? (auto ? "تلقائي حسب فئة الصنف" : "أكواد الفئة خلصت، زود عدد الأصناف من ثوابت النظام") : undefined} />
        </div>
        <ImageField value={d.imageUrl} onChange={(imageUrl) => set({ imageUrl })} />
        <div className="grid gap-3 sm:grid-cols-2">
          <Select label="فئة الصنف" value={d.categoryId} onChange={(e) => set({ categoryId: e.target.value })} options={cats.map((c) => ({ value: c.id, label: c.name.ar }))} />
          <MoneyInput label="سعر البيع" value={d.price} onChange={(price) => set({ price })} />
        </div>
        <LinesEditor readOnly={readOnly} title="مكونات الصنف" hint="من المنتجات المصنعة ذات الوصفة الرئيسية فقط" lines={lines} onChange={setLines} items={choices} itemById={prod.itemById} unitCost={prod.unitCost} />
      </fieldset>
    </Dialog>
  );
}
