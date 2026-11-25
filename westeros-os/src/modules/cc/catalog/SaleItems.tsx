/** 3.3 أصناف البيع: the same items as المنيو (one table), each with its general info and its components for the cost.
 * No Excel import here (Mohammed 2026-11-23): items come from the menu. */
import { useArea } from "../useAccess";
import { searchHit } from "@/lib/search";
import { useMemo, useState } from "react";
import { Plus, Search, UtensilsCrossed } from "lucide-react";
import { useSession } from "@/auth/session";
import { useDb, useLive } from "@/data/hooks";
import type { MenuCategory, MenuItem, MfgRecipeLine, Recipe } from "@/data/types";
import { formatMoney } from "@/lib/money";
import { LinesEditor } from "@/modules/production/ui";
import { Button, Card, Dialog, EmptyState, Input, Select, Table, useToast, type Column } from "@/ui";
import { ExportButton, ImageField, Result } from "../ui";
import { nextCode } from "../menu/codes";
import { useAutoCodes } from "../menu/useAutoCodes";
import { mainBranchOf, onMenuOf, sameItem } from "../menu/menuBranch";
import { useCc, type Cc } from "../useCc";
import { BulkBar, useSelection, type DeleteResult } from "./Bulk";

const money = (u: number) => formatMoney(u, { lang: "ar" });
type CostLine = { itemId: string; qty: number; use?: "dine" | "pickup" };
/** تكلفة محلي / تكلفة استلام (Saqr 2026-11-25): the same components, with the packaging of that kind of order only */
const linesCost = (lines: CostLine[], unitCost: (id: string) => number, kind: "dine" | "pickup") =>
  Math.round(lines.reduce((a, l) => (l.use && l.use !== kind ? a : a + l.qty * unitCost(l.itemId)), 0));
const blank = (categoryId: string): Omit<MenuItem, "id" | "createdAt" | "updatedAt" | "restaurantId"> => ({
  categoryId, name: { ar: "", en: "" }, description: { ar: "", en: "" }, price: 0, cost: null, sku: null, stationId: null, modifierGroupIds: [], tags: [], prepMinutes: 10, available: true,
  vatExempt: false, imageUrl: null, sort: 999, active: true, channelPrices: {}, branchPrices: {}, schedule: [], allergens: [], calories: null, comboOf: [], hiddenOn: [],
});

export default function SaleItems() {
  const cc = useCc();
  const db = useDb();
  const { can } = useSession();
  const allItems = useLive("menuItems", { orderBy: [{ field: "sort" }] }).data;
  const allCats = useLive("menuCategories", { orderBy: [{ field: "sort" }] }).data;
  // كل فرع إله منيو (0054): أصناف البيع بتعرض كل صنف مرة وحدة (Saqr 2026-11-25). The main branch's row, and a branch's
  // own item only when the main menu doesn't have it; the recipe of the main row serves every branch's copy.
  const main = mainBranchOf(useSession().branches);
  const onMain = onMenuOf(main, main);
  const items = useMemo(() => {
    const mine = allItems.filter(onMain);
    const extra: MenuItem[] = [];
    for (const i of allItems) if (!onMain(i) && !mine.some((m) => sameItem(m, i)) && !extra.some((m) => sameItem(m, i))) extra.push(i);
    return [...mine, ...extra];
  }, [allItems, main]); // eslint-disable-line react-hooks/exhaustive-deps
  const cats = useMemo(() => {
    const mine = allCats.filter(onMain);
    return [...mine, ...allCats.filter((c) => !onMain(c) && !mine.some((m) => m.name.ar.trim() === c.name.ar.trim()) && items.some((i) => i.categoryId === c.id))];
  }, [allCats, items, main]); // eslint-disable-line react-hooks/exhaustive-deps
  const recipes = useLive("recipes").data;
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("");
  const [edit, setEdit] = useState<MenuItem | "new" | null>(null);
  const area = useArea();
  const manage = can("menu.edit");
  useAutoCodes(manage, allCats, allItems);
  const catName = (id: string) => cats.find((c) => c.id === id)?.name.ar ?? "—";
  const recipeOf = (id: string) => recipes.find((r) => r.ownerType === "menu_item" && r.ownerId === id && !r.scopeItemId) ?? null;
  // تكلفة الصنف: قيمة مكوناته (الكمية × تكلفة الوحدة لكل مكون)
  const costOf = (id: string, kind: "dine" | "pickup" = "dine") => linesCost(recipeOf(id)?.lines ?? [], cc.prod.unitCost, kind);
  const rows = useMemo(() => {
    const n = q.trim().toLowerCase();
    return items.filter((i) => (!cat || i.categoryId === cat) && searchHit(n, i.name.ar, i.sku));
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
    { key: "cost", header: "تكلفة محلي", align: "end", cell: (i) => (recipeOf(i.id)?.lines.length ? <span className="num font-semibold">{money(costOf(i.id, "dine"))}</span> : <span className="text-faint">—</span>) },
    { key: "costOut", header: "تكلفة استلام", align: "end", cell: (i) => (recipeOf(i.id)?.lines.length ? <span className="num font-semibold">{money(costOf(i.id, "pickup"))}</span> : <span className="text-faint">—</span>) },
  ];
  return (
    <div className="grid gap-4">
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_200px_auto_auto]">
        <Input icon={<Search />} placeholder="ابحث باسم الصنف أو الكود" value={q} onChange={(e) => setQ(e.target.value)} />
        <Select value={cat} onChange={(e) => setCat(e.target.value)} options={[{ value: "", label: "كل الفئات" }, ...cats.map((c) => ({ value: c.id, label: c.name.ar }))]} />
        <ExportButton file="أصناف البيع" head={["كود الصنف", "اسم الصنف", "فئة الصنف", "عدد المكونات", "تكلفة محلي", "تكلفة استلام"]} rows={() => rows.map((i) => [i.sku ?? "", i.name.ar, catName(i.categoryId), recipeOf(i.id)?.lines.length ?? 0, costOf(i.id, "dine") / 100_000, costOf(i.id, "pickup") / 100_000])} />
        {manage && area.add ? <Button icon={<Plus />} disabled={!cats.length} onClick={() => setEdit("new")}>اضافة صنف</Button> : null}
      </div>
      {manage ? <BulkBar count={sel.rows.length} noun="صنف" onClear={sel.clear} onEdit={() => setEdit(sel.rows[0])} categories={cats.map((c) => ({ value: c.id, label: c.name.ar }))} onMove={move} onDelete={remove} /> : null}
      <Card className="overflow-hidden">
        <Table columns={columns} rows={rows} rowKey={(i) => i.id} dense onRowClick={(i) => setEdit(i)} empty={<EmptyState compact icon={<UtensilsCrossed />} title="لا توجد أصناف بيع" body={cats.length ? undefined : "عرّف فئات أصناف البيع من ثوابت النظام أولاً"} />} />
      </Card>
      {edit ? <SaleDialog key={edit === "new" ? "new" : edit.id} item={edit === "new" ? null : edit} recipe={edit === "new" ? null : recipeOf(edit.id)} cats={cats} items={items} cc={cc} readOnly={!manage || (edit === "new" ? !area.add : !area.edit)} onClose={() => setEdit(null)} /> : null}
    </div>
  );
}

function SaleDialog({ item, recipe, cats, items, cc, readOnly, onClose }: { item: MenuItem | null; recipe: Recipe | null; cats: MenuCategory[]; items: MenuItem[]; cc: Cc; readOnly: boolean; onClose: () => void }) {
  const db = useDb();
  const { toast } = useToast();
  const prod = cc.prod;
  const [d, setD] = useState(() => ({ name: item?.name.ar ?? "", imageUrl: item?.imageUrl ?? null, sku: item ? item.sku ?? "" : (null as string | null), categoryId: item?.categoryId ?? cats[0]?.id ?? "" }));
  const [lines, setLines] = useState<MfgRecipeLine[]>(() => (recipe?.lines ?? []).map((l) => ({ itemId: l.itemId, qty: l.qty, ...(l.use ? { use: l.use } : {}) })));
  const [busy, setBusy] = useState(false);
  const set = (p: Partial<typeof d>) => setD((x) => ({ ...x, ...p }));
  // مكونات الصنف: المواد الخام + المنتجات المصنعة ذات الوصفة الرئيسية (Mohammed 2026-11-23). الوصفات الفرعية والتتبيلات تدخل في الرئيسية
  // (plus anything already on this item's recipe, so an old line still shows its name)
  const choices = useMemo(() => {
    const made = new Set(prod.products.filter((p) => p.active && p.recipeType === "main").map((p) => p.stockItemId));
    const onRecipe = new Set((recipe?.lines ?? []).map((l) => l.itemId));
    return prod.items.filter((i) => (i.active && (i.kind === "raw" || made.has(i.id))) || onRecipe.has(i.id));
  }, [prod.products, prod.items, recipe]);
  // كود الصنف: the next free code of the category's block of 1000 (same rule as المنيو), until the user types one
  const auto = nextCode(cats.find((c) => c.id === d.categoryId), items, d.categoryId);
  const sku = d.sku ?? auto;
  const dupe = !!sku.trim() && items.some((i) => i.sku === sku.trim() && i.id !== item?.id);
  const save = async () => {
    setBusy(true);
    try {
      const n = d.name.trim();
      const fields = { name: { ar: n, en: item?.name.en && item.name.en !== item.name.ar ? item.name.en : n }, imageUrl: d.imageUrl, sku: sku.trim() || null, categoryId: d.categoryId };
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
          <Input label="كود الصنف" dir="ltr" className="num" value={sku} onChange={(e) => set({ sku: e.target.value })} error={dupe ? "الكود مستخدم لصنف آخر" : undefined} hint={!item && d.sku === null ? (auto ? "تلقائي حسب فئة الصنف" : "هيتحط تلقائي بعد الحفظ") : undefined} />
        </div>
        {item ? (
          <div className="grid gap-2 rounded-xl border border-line p-3 text-[13.5px] sm:grid-cols-4">
            <Info label="الاسم بالإنجليزي"><span dir="ltr">{item.name.en || "—"}</span></Info>
            <Info label="سعر البيع"><span className="num">{money(item.price)}</span>{item.discount ? <span className="num block text-[12px] text-success">بعد الخصم {money(item.price - item.discount)}</span> : null}</Info>
            <Info label="ظاهر في المنيو">{item.active ? "أيوه" : "لأ"}{!item.available ? " · خلصان" : ""}</Info>
            <Info label="مجموعات الخيارات"><span className="num">{item.modifierGroupIds.length || "—"}</span></Info>
            {item.description.ar || item.description.en ? <div className="sm:col-span-4"><Info label="الوصف">{item.description.ar || item.description.en}</Info></div> : null}
            <p className="text-[12px] text-muted sm:col-span-4">السعر والوصف والخيارات بتتعدل من المنيو. الصنف ده هو نفس صنف المنيو.</p>
          </div>
        ) : null}
        <ImageField value={d.imageUrl} onChange={(imageUrl) => set({ imageUrl })} />
        <div className="grid gap-3 sm:grid-cols-2">
          <Select label="فئة الصنف" value={d.categoryId} onChange={(e) => set({ categoryId: e.target.value })} options={cats.map((c) => ({ value: c.id, label: c.name.ar }))} />
          <div className="grid grid-cols-2 gap-3">
            <Result label="تكلفة محلي">{money(linesCost(lines.filter((l) => l.qty > 0), prod.unitCost, "dine"))}</Result>
            <Result label="تكلفة استلام">{money(linesCost(lines.filter((l) => l.qty > 0), prod.unitCost, "pickup"))}</Result>
          </div>
        </div>
        <LinesEditor readOnly={readOnly} title="مكونات الصنف" hint="من المواد الخام والمنتجات المصنعة ذات الوصفة الرئيسية" lines={lines} onChange={setLines} items={choices} itemById={prod.itemById} unitCost={prod.unitCost} uses />
      </fieldset>
    </Dialog>
  );
}

function Info({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><span className="block text-[12px] text-muted">{label}</span><span className="font-semibold">{children}</span></div>;
}
