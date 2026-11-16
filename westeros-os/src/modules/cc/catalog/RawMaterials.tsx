/** 3.1 مواد الخام: the list, add and edit, and the Excel import matched by the raw material code. */
import { useMemo, useState } from "react";
import { Boxes, Plus, Search } from "lucide-react";
import { useSession } from "@/auth/session";
import { useDb } from "@/data/hooks";
import type { RawSpec, StockItem } from "@/data/types";
import { formatMoney, major } from "@/lib/money";
import { MoneyInput } from "@/modules/marketing/ui";
import { Num } from "@/modules/production/ui";
import { Badge, Button, Card, Dialog, EmptyState, Input, Select, Switch, Table, useToast, type Column } from "@/ui";
import { conversionOf, fmtDay, mfgUnitPrice, num, specOf, stockFieldsOf } from "../lib";
import { ImageField, Result } from "../ui";
import { sheetNumber } from "../xlsx";
import { useCc, type Cc } from "../useCc";
import { ExcelImport } from "./Import";

const COLS = ["كود الخام", "اسم الخام", "فئة الخام", "وحدة التخزين", "اخر سعر شراء", "تاريخ اخر عملية شراء", "تاريخ الصلاحية", "وحدة التصنيع", "الكمية في وحدة التخزين"];
const money = (u: number) => formatMoney(u, { lang: "ar" });
const isoDay = (s: string) => {
  const t = s.trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(t)) return t.slice(0, 10);
  const m = t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  // an Excel date cell is a day count
  if (/^\d{5}(\.\d+)?$/.test(t)) return new Date(Math.round((Number(t) - 25569) * 86_400_000)).toISOString().slice(0, 10);
  return null;
};

/** A new stock row for a raw material card. */
function newRaw(cc: Cc, name: string, sku: string, spec: RawSpec, mfg: boolean): Omit<StockItem, "id" | "createdAt" | "updatedAt" | "restaurantId"> {
  const store = cc.warehouses.find((l) => (l.type ?? "raw") === "raw") ?? cc.warehouses[0];
  return {
    name: { ar: name, en: name }, sku, category: "dry", kind: "raw", ...stockFieldsOf(spec, cc.lists), account: "food", levels: { min: 0, par: 0, max: 0 }, branchLevels: {},
    supplierIds: [], preferredSupplierId: null, defaultLocationIds: store ? [store.id] : [], trackBatches: false, shelfLifeDays: null, vatBp: 0, yieldBp: 10_000, allergens: [], active: true,
    note: spec.category, marketKey: null, mfg, spec,
  };
}

export default function RawMaterials() {
  const cc = useCc();
  const db = useDb();
  const { can } = useSession();
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("");
  const [edit, setEdit] = useState<StockItem | "new" | null>(null);
  const manage = can("inventory.manage");
  const cats = useMemo(() => [...new Set([...cc.lists.rawCategories, ...cc.raws.map((i) => specOf(i, cc.lists).category)].filter(Boolean))], [cc.lists, cc.raws]);
  const rows = useMemo(() => {
    const n = q.trim().toLowerCase();
    return cc.raws.filter((i) => (!cat || specOf(i, cc.lists).category === cat) && (!n || i.name.ar.toLowerCase().includes(n) || i.sku.toLowerCase().includes(n)));
  }, [cc.raws, cc.lists, q, cat]);
  const columns: Column<StockItem>[] = [
    { key: "code", header: "كود الخام", cell: (i) => <span className="num text-muted">{i.sku}</span> },
    { key: "name", header: "اسم الخام", cell: (i) => <span className="font-semibold">{i.name.ar}{i.mfg === false ? <Badge tone="neutral" size="sm" className="ms-2">مخزن ومشتريات فقط</Badge> : null}</span> },
    { key: "cat", header: "فئة الخام", hideOnMobile: true, cell: (i) => specOf(i, cc.lists).category || "—" },
    { key: "su", header: "وحدة التخزين", hideOnMobile: true, cell: (i) => specOf(i, cc.lists).storageUnit },
    { key: "price", header: "اخر سعر شراء", align: "end", cell: (i) => <span className="num">{money(specOf(i, cc.lists).lastPrice)}</span> },
    { key: "date", header: "تاريخ اخر شراء", hideOnMobile: true, cell: (i) => <span className="num">{fmtDay(specOf(i, cc.lists).lastPurchaseDate)}</span> },
    { key: "mu", header: "وحدة التصنيع", hideOnMobile: true, cell: (i) => specOf(i, cc.lists).mfgUnit },
    { key: "per", header: "الكمية في وحدة التخزين", align: "end", hideOnMobile: true, cell: (i) => <span className="num">{num(specOf(i, cc.lists).perStorage)}</span> },
    { key: "conv", header: "معامل التحويل", align: "end", hideOnMobile: true, cell: (i) => <span className="num">{num(conversionOf(specOf(i, cc.lists).perStorage), 5)}</span> },
    { key: "mp", header: "سعر وحدة التصنيع", align: "end", cell: (i) => { const s = specOf(i, cc.lists); return <span className="num font-semibold">{money(mfgUnitPrice(s.lastPrice, s.perStorage))}</span>; } },
  ];
  const importRows = async (sheet: Record<string, string>[]) => {
    let added = 0, updated = 0;
    const bySku = new Map(cc.raws.map((i) => [i.sku, i]));
    for (const r of sheet) {
      const sku = (r["كود الخام"] ?? "").trim();
      if (!sku) continue;
      const cur = bySku.get(sku);
      const old = cur ? specOf(cur, cc.lists) : null;
      const has = (k: string) => (r[k] ?? "").trim() !== "";
      const spec: RawSpec = {
        image: old?.image ?? null,
        category: has("فئة الخام") ? r["فئة الخام"].trim() : (old?.category ?? ""),
        storageUnit: has("وحدة التخزين") ? r["وحدة التخزين"].trim() : (old?.storageUnit ?? cc.lists.storageUnits[0] ?? "كيلو"),
        mfgUnit: has("وحدة التصنيع") && cc.lists.mfgUnits.some((u) => u.name === r["وحدة التصنيع"].trim()) ? r["وحدة التصنيع"].trim() : (old?.mfgUnit ?? cc.lists.mfgUnits[0]?.name ?? "كيلو"),
        perStorage: has("الكمية في وحدة التخزين") ? sheetNumber(r["الكمية في وحدة التخزين"]) || 1 : (old?.perStorage ?? 1),
        lastPrice: has("اخر سعر شراء") ? major(sheetNumber(r["اخر سعر شراء"])) : (old?.lastPrice ?? 0),
        lastPurchaseDate: has("تاريخ اخر عملية شراء") ? isoDay(r["تاريخ اخر عملية شراء"]) : (old?.lastPurchaseDate ?? null),
        expiryDate: has("تاريخ الصلاحية") ? isoDay(r["تاريخ الصلاحية"]) : (old?.expiryDate ?? null),
      };
      const name = has("اسم الخام") ? r["اسم الخام"].trim() : (cur?.name.ar ?? "");
      if (cur) {
        // an item that already moved keeps its base unit: only the price and the card change
        const moved = cc.levels.some((l) => l.itemId === cur.id);
        const fields = stockFieldsOf(spec, cc.lists);
        await db.update("stockItems", cur.id, moved && fields.baseUnit !== cur.baseUnit ? { name: { ar: name, en: name }, note: spec.category, spec: { ...spec, mfgUnit: old!.mfgUnit, perStorage: old!.perStorage } } : { name: { ar: name, en: name }, note: spec.category, spec, ...fields });
        updated++;
      } else if (name) {
        await db.insert("stockItems", newRaw(cc, name, sku, spec, true));
        added++;
      }
    }
    return { added, updated };
  };
  return (
    <div className="grid gap-4">
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_200px_auto_auto]">
        <Input icon={<Search />} placeholder="ابحث باسم الخام أو الكود" value={q} onChange={(e) => setQ(e.target.value)} />
        <Select value={cat} onChange={(e) => setCat(e.target.value)} options={[{ value: "", label: "كل الفئات" }, ...cats.map((c) => ({ value: c, label: c }))]} />
        {manage ? <ExcelImport columns={COLS} onRows={importRows} /> : null}
        {manage ? <Button icon={<Plus />} onClick={() => setEdit("new")}>اضافة مادة خام</Button> : null}
      </div>
      <Card className="overflow-hidden">
        <Table columns={columns} rows={rows} rowKey={(i) => i.id} dense onRowClick={(i) => setEdit(i)} empty={<EmptyState compact icon={<Boxes />} title="لا توجد مواد خام" />} />
      </Card>
      {edit ? <RawDialog key={edit === "new" ? "new" : edit.id} item={edit === "new" ? null : edit} cc={cc} cats={cats} readOnly={!manage} onClose={() => setEdit(null)} /> : null}
    </div>
  );
}

function RawDialog({ item, cc, cats, readOnly, onClose }: { item: StockItem | null; cc: Cc; cats: string[]; readOnly: boolean; onClose: () => void }) {
  const db = useDb();
  const { toast } = useToast();
  const nextCode = String(Math.max(10000, ...cc.raws.map((i) => Number(i.sku) || 0)) + 1);
  const [name, setName] = useState(item?.name.ar ?? "");
  const [sku, setSku] = useState(item?.sku ?? nextCode);
  const [mfg, setMfg] = useState(item ? item.mfg !== false : true);
  const [s, setS] = useState<RawSpec>(() => (item ? specOf(item, cc.lists) : { image: null, category: cats[0] ?? "", storageUnit: cc.lists.storageUnits[0] ?? "كيلو", mfgUnit: cc.lists.mfgUnits[0]?.name ?? "كيلو", perStorage: 1, lastPrice: 0, lastPurchaseDate: null, expiryDate: null }));
  const [busy, setBusy] = useState(false);
  const set = (p: Partial<RawSpec>) => setS((x) => ({ ...x, ...p }));
  // once stock exists, the manufacturing unit cannot switch between weight, volume and pieces
  const moved = !!item && cc.levels.some((l) => l.itemId === item.id);
  const units = cc.lists.mfgUnits.filter((u) => !moved || u.base === item!.baseUnit);
  const dupe = cc.raws.some((i) => i.sku === sku.trim() && i.id !== item?.id);
  const valid = !!name.trim() && !!sku.trim() && !dupe && s.perStorage > 0;
  const save = async () => {
    setBusy(true);
    try {
      const n = name.trim();
      if (item) await db.update("stockItems", item.id, { name: { ar: n, en: item.name.en && item.name.en !== item.name.ar ? item.name.en : n }, sku: sku.trim(), note: s.category, mfg, spec: s, ...stockFieldsOf(s, cc.lists) });
      else await db.insert("stockItems", newRaw(cc, n, sku.trim(), s, mfg));
      toast({ tone: "success", title: "تم حفظ مادة الخام" });
      onClose();
    } catch (e) {
      toast({ tone: "error", title: "تعذر الحفظ", description: String((e as Error).message ?? e) });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open onClose={onClose} size="xl" title={item ? "تعديل مادة خام" : "اضافة مادة خام"}
      footer={<div className="flex justify-end gap-2"><Button variant="ghost" onClick={onClose}>{readOnly ? "إغلاق" : "إلغاء"}</Button>{readOnly ? null : <Button loading={busy} disabled={!valid} onClick={save}>حفظ</Button>}</div>}>
      <fieldset disabled={readOnly} className="grid gap-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Input label="اسم الخام" value={name} onChange={(e) => setName(e.target.value)} />
          <Input label="كود الخام" dir="ltr" className="num" value={sku} onChange={(e) => setSku(e.target.value)} error={dupe ? "الكود مستخدم لخام آخر" : undefined} />
        </div>
        <ImageField value={s.image} onChange={(image) => set({ image })} />
        <div className="grid gap-3 sm:grid-cols-2">
          <Select label="فئة الخام" value={s.category} onChange={(e) => set({ category: e.target.value })} options={[...(cats.includes(s.category) ? [] : [{ value: s.category, label: s.category || "—" }]), ...cats.map((c) => ({ value: c, label: c }))]} />
          <Select label="وحدة التخزين" value={s.storageUnit} onChange={(e) => set({ storageUnit: e.target.value })} options={[...new Set([...cc.lists.storageUnits, s.storageUnit])].map((u) => ({ value: u, label: u }))} />
          <MoneyInput label="اخر سعر شراء" value={s.lastPrice} onChange={(lastPrice) => set({ lastPrice })} hint={`لكل ${s.storageUnit}`} />
          <Input label="تاريخ اخر عملية شراء" type="date" dir="ltr" value={s.lastPurchaseDate ?? ""} onChange={(e) => set({ lastPurchaseDate: e.target.value || null })} />
          <Input label="تاريخ الصلاحية" type="date" dir="ltr" value={s.expiryDate ?? ""} onChange={(e) => set({ expiryDate: e.target.value || null })} />
          <Select label="وحدة التصنيع" value={s.mfgUnit} onChange={(e) => set({ mfgUnit: e.target.value })} hint={moved ? "للخام رصيد في المخزن، فتبقى الوحدة من نفس النوع" : undefined} options={units.map((u) => ({ value: u.name, label: u.name }))} />
          <Num label="الكمية في وحدة التخزين" suffix={s.mfgUnit} value={s.perStorage} onChange={(perStorage) => set({ perStorage })} hint={`كم ${s.mfgUnit} في ${s.storageUnit} واحدة`} />
          <Result label="معامل التحويل">{num(conversionOf(s.perStorage), 5)}</Result>
          <Result label="سعر وحدة التصنيع">{money(mfgUnitPrice(s.lastPrice, s.perStorage))} / {s.mfgUnit}</Result>
        </div>
        <Switch checked={mfg} onChange={setMfg} label="يدخل في الوصفات والتصنيع" description="لو مقفول: الصنف للمخازن والمشتريات فقط ولا يظهر في الوصفات ولا في التصنيع" />
      </fieldset>
    </Dialog>
  );
}
