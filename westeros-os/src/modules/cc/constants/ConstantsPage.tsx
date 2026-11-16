/** 4- ثوابت النظام: the nine definitions of the document, in its order, then the lists its other sections refer to. */
import { useState, type ReactNode } from "react";
import { Plus, Settings2, Trash2, X } from "lucide-react";
import { useDb, useLive } from "@/data/hooks";
import type { MfgCategoryDef, MfgLists, MfgMeatType, MfgSettings, MfgUnitDef } from "@/data/types";
import { uuid } from "@/lib/id";
import { PageHeader } from "@/shell/PageHeader";
import { Num } from "@/modules/production/ui";
import { Button, Card, CardHeader, EmptyState, IconButton, Input, Select } from "@/ui";
import { useCc } from "../useCc";

const BASE_LABEL: Record<MfgUnitDef["base"], string> = { g: "وزن (جرام)", ml: "حجم (مل)", pc: "عدد (قطعة)" };

export default function ConstantsPage() {
  const cc = useCc();
  const db = useDb();
  const prod = cc.prod;
  const s = prod.settings;
  const saleCats = useLive("menuCategories", { orderBy: [{ field: "sort" }] }).data;
  const menuItems = useLive("menuItems").data;
  if (!s) return <EmptyState icon={<Settings2 />} title="لا توجد ثوابت لهذا المطعم" />;
  const lists = cc.lists;
  const patch = (p: Partial<MfgSettings>) => db.update("mfgSettings", s.id, p);
  const setLists = (p: Partial<MfgLists>) => patch({ lists: { ...lists, ...p } });
  const cats = prod.categories;
  const setCat = (id: string, p: Partial<MfgCategoryDef>) => patch({ productCategories: cats.map((c) => (c.id === id ? { ...c, ...p } : c)) });
  const usedCats = new Set(prod.products.map((x) => x.category));
  const usedSale = new Set(menuItems.map((i) => i.categoryId));
  const setMeat = (id: string, p: Partial<MfgMeatType>) => patch({ meatTypes: s.meatTypes.map((m) => (m.id === id ? { ...m, ...p } : m)) });
  const rawOptions = [{ value: "", label: "—" }, ...prod.items.filter((i) => i.active && i.kind === "raw").map((i) => ({ value: i.id, label: `${i.name.ar} · ${i.sku}` }))];
  const anyOptions = [{ value: "", label: "—" }, ...prod.items.filter((i) => i.active).map((i) => ({ value: i.id, label: `${i.name.ar} · ${i.sku}` }))];
  const kitchen = prod.staff.filter((m) => m.active && (m.role === "chef" || m.role === "kitchen" || s.chefCodes[m.id]));
  return (
    <div className="grid gap-5">
      <PageHeader icon={<Settings2 />} title="ثوابت النظام" />
      <div className="grid items-start gap-5 lg:grid-cols-2">
        <Chips title="تعريف وحدة التخزين لمواد الخام" values={lists.storageUnits} onChange={(storageUnits) => setLists({ storageUnits })} placeholder="وحدة تخزين جديدة" />

        <Card>
          <CardHeader title="تعريف وحدة التصنيع لمواد الخام" action={<Button size="sm" variant="outline" icon={<Plus />} onClick={() => setLists({ mfgUnits: [...lists.mfgUnits, { name: "وحدة جديدة", base: "g", factor: 1 }] })}>وحدة جديدة</Button>} />
          <ul className="grid gap-2 px-5 pb-5">
            {lists.mfgUnits.map((u, i) => (
              <li key={i} className="grid items-end gap-2 rounded-xl border border-line p-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_110px_auto]">
                <Input label="الاسم" defaultValue={u.name} onBlur={(e) => e.target.value.trim() && e.target.value !== u.name && setLists({ mfgUnits: lists.mfgUnits.map((x, j) => (j === i ? { ...x, name: e.target.value.trim() } : x)) })} />
                <Select label="النوع" value={u.base} onChange={(e) => setLists({ mfgUnits: lists.mfgUnits.map((x, j) => (j === i ? { ...x, base: e.target.value as MfgUnitDef["base"] } : x)) })} options={(Object.keys(BASE_LABEL) as MfgUnitDef["base"][]).map((b) => ({ value: b, label: BASE_LABEL[b] }))} />
                <Num label="تساوي" value={u.factor} onChange={(n) => setLists({ mfgUnits: lists.mfgUnits.map((x, j) => (j === i ? { ...x, factor: n > 0 ? n : 1 } : x)) })} />
                <IconButton label="حذف" disabled={lists.mfgUnits.length <= 1} onClick={() => setLists({ mfgUnits: lists.mfgUnits.filter((_, j) => j !== i) })}><Trash2 /></IconButton>
              </li>
            ))}
          </ul>
        </Card>

        <Chips title="تعريف فئات مواد الخام" values={lists.rawCategories} onChange={(rawCategories) => setLists({ rawCategories })} placeholder="فئة خام جديدة" />

        <Card>
          <CardHeader title="تعريف فئات أصناف البيع" />
          <SaleCategories cats={saleCats} used={usedSale} />
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader title="تعريف فئات الأصناف المصنعة" subtitle="الكود هو أول رقم في رقم التشغيلة"
            action={<Button size="sm" variant="outline" icon={<Plus />} onClick={() => patch({ productCategories: [...cats, { id: uuid(), name: { ar: "فئة جديدة", en: "New category" }, code: Math.max(0, ...cats.map((c) => c.code)) + 1, burger: null }] })}>فئة جديدة</Button>} />
          <ul className="grid gap-2 px-5 pb-5">
            {cats.map((c) => (
              <li key={c.id} className="grid items-end gap-2 rounded-xl border border-line p-3 sm:grid-cols-[minmax(0,1.4fr)_110px_minmax(0,1fr)_auto]">
                <Input label="اسم الفئة" defaultValue={c.name.ar} onBlur={(e) => e.target.value.trim() && e.target.value !== c.name.ar && setCat(c.id, { name: { ar: e.target.value.trim(), en: e.target.value.trim() } })} />
                <Num label="الكود" value={c.code} onChange={(n) => setCat(c.id, { code: Math.max(0, Math.round(n)) })} />
                <Select label="نوع البرجر" value={c.burger ?? ""} onChange={(e) => setCat(c.id, { burger: (e.target.value || null) as MfgCategoryDef["burger"] })} options={[{ value: "", label: "ليست برجر" }, ...lists.burgerTypes.map((b) => ({ value: b.id, label: b.name }))]} />
                <IconButton label={usedCats.has(c.id) ? "فيها منتجات، انقلها أولاً" : "حذف"} disabled={usedCats.has(c.id)} onClick={() => patch({ productCategories: cats.filter((x) => x.id !== c.id) })}><Trash2 /></IconButton>
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <CardHeader title="تعريف أنواع المخازن" action={<Button size="sm" variant="outline" icon={<Plus />} onClick={() => setLists({ warehouseTypes: [...lists.warehouseTypes, { id: uuid(), name: "نوع جديد", holds: "raw" }] })}>نوع جديد</Button>} />
          <ul className="grid gap-2 px-5 pb-5">
            {lists.warehouseTypes.map((t) => (
              <li key={t.id} className="grid items-end gap-2 rounded-xl border border-line p-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
                <Input label="الاسم" defaultValue={t.name} onBlur={(e) => e.target.value.trim() && e.target.value !== t.name && setLists({ warehouseTypes: lists.warehouseTypes.map((x) => (x.id === t.id ? { ...x, name: e.target.value.trim() } : x)) })} />
                <Select label="الأصناف التي فيه" value={t.holds} onChange={(e) => setLists({ warehouseTypes: lists.warehouseTypes.map((x) => (x.id === t.id ? { ...x, holds: e.target.value as typeof t.holds } : x)) })} options={[{ value: "raw", label: "مواد الخام" }, { value: "products", label: "المنتجات المصنعة" }, { value: "branch", label: "فرع مطعم" }]} />
                <IconButton label={cc.locations.some((l) => l.type === t.id) ? "مستخدم في مخزن" : "حذف"} disabled={cc.locations.some((l) => l.type === t.id) || lists.warehouseTypes.length <= 1} onClick={() => setLists({ warehouseTypes: lists.warehouseTypes.filter((x) => x.id !== t.id) })}><Trash2 /></IconButton>
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <CardHeader title="تعريف أنواع البرجر" />
          <div className="grid gap-3 px-5 pb-5 sm:grid-cols-2">
            {lists.burgerTypes.map((b) => (
              <Input key={b.id} label={b.id === "beef" ? "برجر من لحم ودهن" : "برجر من فرم الدجاج"} defaultValue={b.name} onBlur={(e) => e.target.value.trim() && e.target.value !== b.name && setLists({ burgerTypes: lists.burgerTypes.map((x) => (x.id === b.id ? { ...x, name: e.target.value.trim() } : x)) })} />
            ))}
          </div>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader title="تعريف اللحوم" subtitle="نوع قطعية اللحم، ربط بمادة خام محددة، وزن الدهن"
            action={<Button size="sm" variant="outline" icon={<Plus />} onClick={() => patch({ meatTypes: [...s.meatTypes, { id: uuid(), name: { ar: "قطعية جديدة", en: "New cut" }, stockItemId: null, fatGramsPerKg: 200 }] })}>قطعية جديدة</Button>} />
          <ul className="grid gap-2 px-5 pb-3">
            {s.meatTypes.map((m) => (
              <li key={m.id} className="grid items-end gap-2 rounded-xl border border-line p-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_170px_auto]">
                <Input label="نوع قطعية اللحم" defaultValue={m.name.ar} onBlur={(e) => e.target.value.trim() && e.target.value !== m.name.ar && setMeat(m.id, { name: { ar: e.target.value.trim(), en: e.target.value.trim() } })} />
                <Select label="مادة الخام" value={m.stockItemId ?? ""} onChange={(e) => setMeat(m.id, { stockItemId: e.target.value || null })} options={rawOptions} />
                <Num label="وزن الدهن لكل كيلو لحم" suffix="جم" value={m.fatGramsPerKg} onChange={(n) => setMeat(m.id, { fatGramsPerKg: Math.round(n) })} />
                <IconButton label="حذف" onClick={() => patch({ meatTypes: s.meatTypes.filter((x) => x.id !== m.id) })}><Trash2 /></IconButton>
              </li>
            ))}
            {s.meatTypes.length ? null : <li className="text-[14px] text-muted">أضف أول قطعية لحم.</li>}
          </ul>
          <div className="grid gap-3 px-5 pb-5 sm:grid-cols-3">
            <Select label="مادة خام الدهن" value={s.rawFatItemId ?? ""} onChange={(e) => patch({ rawFatItemId: e.target.value || null })} options={rawOptions} />
            <Select label="دجاج الفرم لبرجر الدجاج" value={s.mincedChickenItemId ?? ""} onChange={(e) => patch({ mincedChickenItemId: e.target.value || null })} options={anyOptions} />
            <Select label="مادة الخام الواحدة (الدجاج)" value={s.chickenItemId ?? ""} onChange={(e) => patch({ chickenItemId: e.target.value || null })} options={rawOptions} />
          </div>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader title="تعريف اسماء الوصفات" subtitle="الرئيسية، الفرعية، التتبيلة" />
          <div className="grid gap-3 px-5 pb-5 sm:grid-cols-3">
            {(["main", "sub", "marinade"] as const).map((k) => (
              <Input key={k} label={k === "main" ? "الرئيسية" : k === "sub" ? "الفرعية" : "التتبيلة"} defaultValue={lists.recipeNames[k]} onBlur={(e) => e.target.value.trim() && e.target.value !== lists.recipeNames[k] && setLists({ recipeNames: { ...lists.recipeNames, [k]: e.target.value.trim() } })} />
            ))}
          </div>
        </Card>

        <Chips title="طريقة التخزين" subtitle="القائمة المعرفة مسبقاً في بيانات المنتج المصنع" values={s.storageMethods} onChange={(storageMethods) => patch({ storageMethods })} placeholder="طريقة تخزين جديدة" />

        <Card>
          <CardHeader title="كود الشيف" subtitle="الرقم بين القوسين في رقم التشغيلة، مثل 2-21102026#1(5)" />
          <ul className="grid gap-2 px-5 pb-5">
            {kitchen.map((m) => (
              <li key={m.id} className="flex items-center gap-3 rounded-xl border border-line px-3 py-2">
                <span className="min-w-0 flex-1 truncate text-[14.5px] font-semibold">{m.name}</span>
                <Num className="w-24" value={s.chefCodes[m.id] ?? 0} onChange={(n) => patch({ chefCodes: { ...s.chefCodes, [m.id]: Math.round(n) } })} />
              </li>
            ))}
            {kitchen.length ? null : <li className="text-[14px] text-muted">لا يوجد شيف بين المستخدمين.</li>}
          </ul>
        </Card>
      </div>
    </div>
  );
}

function Chips({ title, subtitle, values, onChange, placeholder }: { title: ReactNode; subtitle?: ReactNode; values: string[]; onChange: (v: string[]) => void; placeholder: string }) {
  const [text, setText] = useState("");
  return (
    <Card>
      <CardHeader title={title} subtitle={subtitle} />
      <div className="grid gap-3 px-5 pb-5">
        <div className="flex flex-wrap gap-1.5">
          {values.map((m) => (
            <span key={m} className="inline-flex items-center gap-1 rounded-full border border-line bg-surface-2 py-1 ps-3 pe-1 text-[13.5px] font-semibold">
              {m}
              <button type="button" aria-label="حذف" className="grid size-6 place-items-center rounded-full text-muted hover:bg-surface-3 hover:text-ink" onClick={() => onChange(values.filter((x) => x !== m))}><X className="size-3.5" /></button>
            </span>
          ))}
        </div>
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); const v = text.trim(); if (v && !values.includes(v)) onChange([...values, v]); setText(""); }}>
          <Input wrapClassName="flex-1" placeholder={placeholder} value={text} onChange={(e) => setText(e.target.value)} />
          <Button type="submit" variant="outline" icon={<Plus />}>إضافة</Button>
        </form>
      </div>
    </Card>
  );
}

function SaleCategories({ cats, used }: { cats: { id: string; name: { ar: string; en: string } }[]; used: Set<string> }) {
  const db = useDb();
  const [text, setText] = useState("");
  return (
    <div className="grid gap-3 px-5 pb-5">
      <div className="flex flex-wrap gap-1.5">
        {cats.map((c) => (
          <span key={c.id} className="inline-flex items-center gap-1 rounded-full border border-line bg-surface-2 py-1 ps-3 pe-1 text-[13.5px] font-semibold">
            {c.name.ar}
            <button type="button" disabled={used.has(c.id)} title={used.has(c.id) ? "فيها أصناف" : "حذف"} aria-label="حذف" className="grid size-6 place-items-center rounded-full text-muted hover:bg-surface-3 hover:text-ink disabled:opacity-30" onClick={() => void db.remove("menuCategories", c.id)}><X className="size-3.5" /></button>
          </span>
        ))}
      </div>
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); const v = text.trim(); if (v) void db.insert("menuCategories", { name: { ar: v, en: v }, sort: cats.length + 1, color: "#F8BB18", icon: "utensils", stationId: null, active: true }); setText(""); }}>
        <Input wrapClassName="flex-1" placeholder="فئة صنف بيع جديدة" value={text} onChange={(e) => setText(e.target.value)} />
        <Button type="submit" variant="outline" icon={<Plus />}>إضافة</Button>
      </form>
    </div>
  );
}
