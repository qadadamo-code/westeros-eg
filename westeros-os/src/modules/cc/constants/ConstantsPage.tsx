/** 4- ثوابت النظام: the definitions of the document, in tabs by the main menu they belong to (2026-11-22): المخازن والفروع, التصنيع. */
import { AreaGate, useArea } from "../useAccess";
import { useState, type ReactNode } from "react";
import { Factory, Plus, Settings2, Trash2, Warehouse, X } from "lucide-react";
import { useLocation } from "react-router-dom";
import { RouteTabs } from "@/modules/marketing/ui";
import { useDb, useLive } from "@/data/hooks";
import type { CodeRange, MfgCategoryDef, MfgLists, MfgMeatType, MfgSettings, MfgUnitDef } from "@/data/types";
import { uuid } from "@/lib/id";
import { PageHeader } from "@/shell/PageHeader";
import { Num } from "@/modules/production/ui";
import { Button, Card, CardHeader, EmptyState, IconButton, Input, Select, useToast } from "@/ui";
import { codeRanges, rangeProblem, rawRanges, specOf, STORE_TYPES, type CodeKind } from "../lib";
import { useCc } from "../useCc";

const BASE_LABEL: Record<MfgUnitDef["base"], string> = { g: "وزن (جرام)", ml: "حجم (مل)", pc: "عدد (قطعة)" };

export default function ConstantsPage() {
  return <AreaGate id="constants"><ConstantsPageBody /></AreaGate>;
}

/** the main menus that have constants; المستخدمين keeps its roles and الحسابات its settings on their own screens */
const CONSTANT_TABS = [
  { to: "/constants", end: true, label: "المخازن والفروع", icon: <Warehouse /> },
  { to: "/constants/mfg", label: "التصنيع", icon: <Factory /> },
];

function ConstantsPageBody() {
  const tab = useLocation().pathname.replace(/\/+$/, "").endsWith("/mfg") ? "mfg" : "stores";
  const readOnly = !useArea().edit;
  const cc = useCc();
  const db = useDb();
  const prod = cc.prod;
  const s = prod.settings;
  const saleCats = useLive("menuCategories", { orderBy: [{ field: "sort" }] }).data;
  const menuItems = useLive("menuItems").data;
  const { toast } = useToast();
  if (!s) return <EmptyState icon={<Settings2 />} title="لا توجد ثوابت لهذا المطعم" />;
  const lists = cc.lists;
  const patch = (p: Partial<MfgSettings>) => db.update("mfgSettings", s.id, p);
  const setLists = (p: Partial<MfgLists>) => patch({ lists: { ...lists, ...p } });
  const cats = prod.categories;
  const setCat = (id: string, p: Partial<MfgCategoryDef>) => patch({ productCategories: cats.map((c) => (c.id === id ? { ...c, ...p } : c)) });
  const usedCats = new Set(prod.products.map((x) => x.category));
  const usedRawCats = new Set(cc.raws.map((i) => specOf(i, lists).category));
  const usedSale = new Set(menuItems.map((i) => i.categoryId));
  // مدى أكواد كل فئة: a new item takes the next free code of its category
  const ranges: Record<CodeKind, Record<string, CodeRange>> = {
    raw: rawRanges(lists, cc.raws),
    sale: codeRanges(lists.codeRanges?.sale, saleCats.map((c) => c.id)),
    product: codeRanges(lists.codeRanges?.product, cats.map((c) => c.id)),
  };
  const saveRange = (kind: CodeKind, key: string, next: CodeRange) => setLists({ codeRanges: { ...lists.codeRanges, [kind]: { ...ranges[kind], [key]: next } } });
  // تعديل اسم فئة خام: the list, its code range, the meat and packaging choices and every raw material of the category follow the new name
  const renameRawCat = async (old: string, typed: string): Promise<boolean> => {
    const next = typed.trim();
    if (!next || next === old) return false;
    if (lists.rawCategories.includes(next)) {
      toast({ tone: "error", title: "الاسم مستخدم", description: `فيه فئة خام تانية اسمها ${next}` });
      return false;
    }
    const raw = Object.fromEntries(Object.entries(ranges.raw).map(([k, v]) => [k === old ? next : k, v]));
    const packCat = lists.packagingCategory ?? lists.rawCategories.find((c) => c.includes("تغليف")) ?? "";
    const moved = cc.raws.filter((i) => specOf(i, lists).category === old);
    await patch({ lists: { ...lists, rawCategories: lists.rawCategories.map((c) => (c === old ? next : c)), codeRanges: { ...lists.codeRanges, raw }, ...(meatCat === old ? { meatCategory: next } : {}), ...(packCat === old ? { packagingCategory: next } : {}) } });
    for (const i of moved) await db.update("stockItems", i.id, i.spec ? { spec: { ...i.spec, category: next } } : { note: next });
    toast({ tone: "success", title: "تم تعديل اسم الفئة", description: moved.length ? `اتنقل معاها ${moved.length} مادة خام` : undefined });
    return true;
  };
  const setMeat = (id: string, p: Partial<MfgMeatType>) => patch({ meatTypes: s.meatTypes.map((m) => (m.id === id ? { ...m, ...p } : m)) });
  // تعريف اللحوم: only the raw materials of the meat category, also the warehouse-only ones (choosing one brings it into manufacturing)
  const meatCat = lists.meatCategory ?? lists.rawCategories.find((c) => c.includes("لحوم")) ?? "";
  const meatOptions = (chosen: string | null) => [{ value: "", label: "—" }, ...cc.raws.filter((i) => i.active && (!meatCat || specOf(i, lists).category === meatCat || i.id === chosen)).map((i) => ({ value: i.id, label: `${i.name.ar} · ${i.sku}` }))];
  // دجاج الفرم: the meat category's raw materials, plus the manufactured products of the chicken category
  const chickenCat = lists.chickenProductCategory ?? prod.categories.find((c) => !c.burger && (c.id === "chicken" || c.name.ar.includes("دجاج")))?.id ?? "";
  const chickenCats = new Set(chickenCat ? [chickenCat] : []);
  const mincedOptions = [...meatOptions(s.mincedChickenItemId), ...prod.products.filter((x) => x.active && chickenCats.has(x.category) && cc.itemById.has(x.stockItemId)).map((x) => ({ value: x.stockItemId, label: `${x.name.ar} · ${x.code} (منتج مصنع)` }))];
  // دهن برجر اللحم: raw materials of the meat and chicken categories, plus the manufactured products of the meat and chicken categories (such as الدهن الجاهز: its price and stock are the product's own)
  const isMeatName = (n: string) => /لحم|لحوم|دجاج|فراخ/.test(n);
  const fatRawCats = new Set([meatCat, ...lists.rawCategories.filter(isMeatName)].filter(Boolean));
  const fatProductCats = new Set(cats.filter((c) => c.burger || c.id === chickenCat || isMeatName(c.name.ar)).map((c) => c.id));
  const fatOptions = [
    { value: "", label: "—" },
    ...cc.raws.filter((x) => x.active && (fatRawCats.has(specOf(x, lists).category) || x.id === s.rawFatItemId) && !prod.products.some((pr) => pr.stockItemId === x.id)).map((x) => ({ value: x.id, label: `${x.name.ar} · ${x.sku}` })),
    ...prod.products.filter((x) => x.active && (fatProductCats.has(x.category) || x.stockItemId === s.rawFatItemId) && cc.itemById.has(x.stockItemId)).map((x) => ({ value: x.stockItemId, label: `${x.name.ar} · ${x.code} (منتج مصنع)` })),
  ];
  const pick = (id: string) => {
    if (id && cc.itemById.get(id)?.mfg === false) void db.update("stockItems", id, { mfg: true });
    return id || null;
  };
  return (
    <div className="grid gap-5">
      <PageHeader icon={<Settings2 />} title="ثوابت النظام" />
      {/* one tab per main menu, holding the constants its screens choose from */}
      <RouteTabs label="ثوابت النظام" items={CONSTANT_TABS} />
      {readOnly ? <p className="rounded-xl border border-line px-3 py-2 text-[13.5px] text-muted">للمشاهدة بس: الدور بتاعك مالوش صلاحية تعديل ثوابت النظام.</p> : null}
      {/* without تعديل every field and button of the page is locked */}
      <fieldset disabled={readOnly} className="contents">
      <div className="grid items-start gap-5 lg:grid-cols-2">
        {tab === "stores" ? (
          <>
        <Chips title="تعريف وحدة التخزين لمواد الخام" subtitle="حذف الوحدة من هنا يشيلها من القائمة فقط، والخامات المسجلة بها تفضل كما هي" values={lists.storageUnits} onChange={(storageUnits) => setLists({ storageUnits })} placeholder="وحدة تخزين جديدة" />

        <Card>
          <CardHeader title="أنواع المخازن ودرجة حرارتها" subtitle="أنواع ثابتة: يختار منها نوع المخزن، ونوع تخزين الخام، ونوع مخزن المنتج المصنع" />
          <ul className="grid gap-2 px-5 pb-5 sm:grid-cols-2">
            {STORE_TYPES.map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-3 rounded-xl border border-line px-4 py-3">
                <span className="font-semibold">{t.name}</span>
                <span className="num text-[14.5px] text-muted" dir="ltr">{t.temp != null ? `${t.temp}°` : "—"}</span>
              </li>
            ))}
          </ul>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader title="تعريف فئات مواد الخام" subtitle="لكل فئة مدى أكواد: بداية الكود وعدد الأصناف. الخام الجديد ياخد أول كود فاضي في فئته" />
          <ul className="grid gap-2 px-5 pb-3">
            {lists.rawCategories.map((c) => (
              <li key={c} className="grid items-end gap-2 rounded-xl border border-line p-3 grid-cols-[minmax(0,1fr)_auto]">
                <div className="grid gap-2">
                  <Input label="اسم الفئة" defaultValue={c} onBlur={(e) => { const el = e.target; void renameRawCat(c, el.value).then((ok) => { if (!ok) el.value = c; }); }} />
                  <RangeInputs id={c} ranges={ranges.raw} nameOf={(k) => k} onSave={(r) => saveRange("raw", c, r)} />
                </div>
                <IconButton label={usedRawCats.has(c) ? "مستخدمة في مواد خام" : "حذف"} disabled={usedRawCats.has(c)} onClick={() => setLists({ rawCategories: lists.rawCategories.filter((x) => x !== c) })}><Trash2 /></IconButton>
              </li>
            ))}
          </ul>
          <AddForm placeholder="فئة خام جديدة" onAdd={(v) => !lists.rawCategories.includes(v) && setLists({ rawCategories: [...lists.rawCategories, v] })} />
        </Card>

          </>
        ) : (
          <>
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

        <Chips title="طريقة التخزين" subtitle="القائمة المعرفة مسبقاً في بيانات المنتج المصنع" values={s.storageMethods} onChange={(storageMethods) => patch({ storageMethods })} placeholder="طريقة تخزين جديدة" />
        <Card className="lg:col-span-2">
          <CardHeader title="تعريف فئات الأصناف المصنعة" subtitle="كود الفئة هو أول رقم في رقم التشغيلة. ولكل فئة مدى أكواد لمنتجاتها: بداية الكود وعدد الأصناف"
            action={<Button size="sm" variant="outline" icon={<Plus />} onClick={() => patch({ productCategories: [...cats, { id: uuid(), name: { ar: "فئة جديدة", en: "New category" }, code: Math.max(0, ...cats.map((c) => c.code)) + 1, burger: null }] })}>فئة جديدة</Button>} />
          <ul className="grid gap-2 px-5 pb-5">
            {cats.map((c) => (
              <li key={c.id} className="grid items-end gap-2 rounded-xl border border-line p-3 sm:grid-cols-[minmax(0,1fr)_110px_minmax(0,1.6fr)_auto]">
                <Input label="اسم الفئة" defaultValue={c.name.ar} onBlur={(e) => e.target.value.trim() && e.target.value !== c.name.ar && setCat(c.id, { name: { ar: e.target.value.trim(), en: e.target.value.trim() } })} />
                <Num label="كود الفئة" value={c.code} onChange={(n) => setCat(c.id, { code: Math.max(0, Math.round(n)) })} />
                <RangeInputs id={c.id} ranges={ranges.product} nameOf={(k) => cats.find((x) => x.id === k)?.name.ar ?? ""} onSave={(r) => saveRange("product", c.id, r)} />
                <IconButton label={usedCats.has(c.id) ? "فيها منتجات، انقلها أولاً" : "حذف"} disabled={usedCats.has(c.id)} onClick={() => patch({ productCategories: cats.filter((x) => x.id !== c.id) })}><Trash2 /></IconButton>
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <CardHeader title="تعريف فئات أصناف البيع" subtitle="لكل فئة مدى أكواد: بداية الكود وعدد الأصناف. الصنف الجديد ياخد أول كود فاضي في فئته" />
          <SaleCategories cats={saleCats} used={usedSale} ranges={ranges.sale} onSave={(id, r) => saveRange("sale", id, r)} />
        </Card>

        <Card>
          <CardHeader title="تعريف أنواع البرجر" subtitle="اختر فئة المنتجات لكل نوع، عشان طريقة تصنيع البرجر تعرف منتجاتها" />
          <div className="grid gap-3 px-5 pb-5 sm:grid-cols-2">
            {(["beef", "chicken"] as const).map((kind) => (
              <Select key={kind} label={kind === "beef" ? "برجر لحم (لحم ودهن)" : "برجر دجاج (فرم)"} value={cats.find((c) => c.burger === kind)?.id ?? ""}
                onChange={(e) => patch({ productCategories: cats.map((c) => (c.id === e.target.value ? { ...c, burger: kind } : c.burger === kind ? { ...c, burger: null } : c)) })}
                options={[{ value: "", label: "بدون" }, ...cats.map((c) => ({ value: c.id, label: c.name.ar }))]} />
            ))}
          </div>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader title="تعريف اللحوم" subtitle="نوع قطعية اللحم، ربط بمادة خام محددة، وزن الدهن"
            action={<Button size="sm" variant="outline" icon={<Plus />} onClick={() => patch({ meatTypes: [...s.meatTypes, { id: uuid(), name: { ar: "قطعية جديدة", en: "New cut" }, stockItemId: null, fatGramsPerKg: 200 }] })}>قطعية جديدة</Button>} />
          <div className="grid gap-3 px-5 pb-3 sm:grid-cols-2">
            <Select label="فئة الخام للحوم" hint="كل قوائم المواد الخام في تعريف اللحوم تعرض خامات هذه الفئة فقط" value={meatCat} onChange={(e) => setLists({ meatCategory: e.target.value })} options={[{ value: "", label: "كل الفئات" }, ...lists.rawCategories.map((c) => ({ value: c, label: c }))]} />
            <Select label="فئة المصنعات للدجاج" hint="منتجات هذه الفئة المصنعة تظهر في قائمة دجاج الفرم" value={chickenCat} onChange={(e) => setLists({ chickenProductCategory: e.target.value })} options={[{ value: "", label: "بدون" }, ...cats.map((c) => ({ value: c.id, label: c.name.ar }))]} />
          </div>
          <ul className="grid gap-2 px-5 pb-3">
            {s.meatTypes.map((m) => (
              <li key={m.id} className="grid items-end gap-2 rounded-xl border border-line p-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_170px_auto]">
                <Input label="نوع قطعية اللحم" defaultValue={m.name.ar} onBlur={(e) => e.target.value.trim() && e.target.value !== m.name.ar && setMeat(m.id, { name: { ar: e.target.value.trim(), en: e.target.value.trim() } })} />
                <Select label="مادة الخام" value={m.stockItemId ?? ""} onChange={(e) => setMeat(m.id, { stockItemId: pick(e.target.value) })} options={meatOptions(m.stockItemId)} />
                <Num label="وزن الدهن لكل كيلو لحم" suffix="جم" value={m.fatGramsPerKg} onChange={(n) => setMeat(m.id, { fatGramsPerKg: Math.round(n) })} />
                <IconButton label="حذف" onClick={() => patch({ meatTypes: s.meatTypes.filter((x) => x.id !== m.id) })}><Trash2 /></IconButton>
              </li>
            ))}
            {s.meatTypes.length ? null : <li className="text-[14px] text-muted">أضف أول قطعية لحم.</li>}
          </ul>
          <div className="grid gap-3 px-5 pb-5 sm:grid-cols-3">
            <Select label="الدهن في برجر اللحم" value={s.rawFatItemId ?? ""} onChange={(e) => patch({ rawFatItemId: pick(e.target.value) })} options={fatOptions} hint="المستخدم في تصنيع برجر اللحم: خامات ومصنعات فئات اللحوم والدجاج، سعره وكميته من المخزن" />
            <Select label="دجاج الفرم لبرجر الدجاج" value={s.mincedChickenItemId ?? ""} onChange={(e) => patch({ mincedChickenItemId: pick(e.target.value) })} options={mincedOptions} hint="خامات فئة اللحوم ومنتجات فئة الدجاج المصنعة" />
            <Select label="مادة الخام الواحدة (الدجاج)" value={s.chickenItemId ?? ""} onChange={(e) => patch({ chickenItemId: pick(e.target.value) })} options={meatOptions(s.chickenItemId)} />
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

          </>
        )}
      </div>
      </fieldset>
    </div>
  );
}

function Chips({ title, subtitle, values, onChange, placeholder, used }: { title: ReactNode; subtitle?: ReactNode; values: string[]; onChange: (v: string[]) => void; placeholder: string; used?: Set<string> }) {
  const [text, setText] = useState("");
  return (
    <Card>
      <CardHeader title={title} subtitle={subtitle} />
      <div className="grid gap-3 px-5 pb-5">
        <div className="flex flex-wrap gap-1.5">
          {values.map((m) => (
            <span key={m} className="inline-flex items-center gap-1 rounded-full border border-line bg-surface-2 py-1 ps-3 pe-1 text-[13.5px] font-semibold">
              {m}
              {used?.has(m) ? <span className="pe-2" title="مستخدمة في مواد خام" /> : <button type="button" aria-label="حذف" className="grid size-6 place-items-center rounded-full text-muted hover:bg-surface-3 hover:text-ink" onClick={() => onChange(values.filter((x) => x !== m))}><X className="size-3.5" /></button>}
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

function SaleCategories({ cats, used, ranges, onSave }: { cats: { id: string; name: { ar: string; en: string } }[]; used: Set<string>; ranges: Record<string, CodeRange>; onSave: (id: string, r: CodeRange) => void }) {
  const db = useDb();
  return (
    <>
      <ul className="grid gap-2 px-5 pb-3">
        {cats.map((c) => (
          <li key={c.id} className="grid items-end gap-2 rounded-xl border border-line p-3 grid-cols-[minmax(0,1fr)_auto]">
            <div className="grid gap-2">
              <Input label="اسم الفئة" defaultValue={c.name.ar} onBlur={(e) => {
                const v = e.target.value.trim();
                if (!v || cats.some((x) => x.id !== c.id && x.name.ar === v)) e.target.value = c.name.ar;
                else if (v !== c.name.ar) void db.update("menuCategories", c.id, { name: { ar: v, en: c.name.en === c.name.ar ? v : c.name.en } });
              }} />
              <RangeInputs id={c.id} ranges={ranges} nameOf={(k) => cats.find((x) => x.id === k)?.name.ar ?? ""} onSave={(r) => onSave(c.id, r)} />
            </div>
            <IconButton label={used.has(c.id) ? "فيها أصناف" : "حذف"} disabled={used.has(c.id)} onClick={() => void db.remove("menuCategories", c.id)}><Trash2 /></IconButton>
          </li>
        ))}
      </ul>
      <AddForm placeholder="فئة صنف بيع جديدة" onAdd={(v) => void db.insert("menuCategories", { name: { ar: v, en: v }, sort: cats.length + 1, color: "#F8BB18", icon: "utensils", stationId: null, active: true })} />
    </>
  );
}

function AddForm({ placeholder, onAdd }: { placeholder: string; onAdd: (v: string) => void }) {
  const [text, setText] = useState("");
  return (
    <form className="flex gap-2 px-5 pb-5" onSubmit={(e) => { e.preventDefault(); const v = text.trim(); if (v) onAdd(v); setText(""); }}>
      <Input wrapClassName="flex-1" placeholder={placeholder} value={text} onChange={(e) => setText(e.target.value)} />
      <Button type="submit" variant="outline" icon={<Plus />}>إضافة</Button>
    </form>
  );
}

/** بداية الكود وعدد الأصناف for one category: refused when it crosses the range of another category. */
function RangeInputs({ id, ranges, nameOf, onSave }: { id: string; ranges: Record<string, CodeRange>; nameOf: (key: string) => string; onSave: (r: CodeRange) => void }) {
  const { toast } = useToast();
  const [bump, setBump] = useState(0);
  const r = ranges[id] ?? { from: 1, count: 100 };
  const change = (from: number, count: number) => {
    if (from === r.from && count === r.count) return;
    const problem = rangeProblem(id, { from, count }, ranges, nameOf);
    if (problem) {
      toast({ tone: "error", title: "المدى غير مقبول", description: problem });
      setBump((n) => n + 1); // put the typed numbers back
      return;
    }
    onSave({ from, count });
  };
  return (
    <div key={`${r.from}:${r.count}:${bump}`} className="grid items-end gap-2 grid-cols-2 sm:grid-cols-[110px_110px_minmax(0,1fr)]">
      <Input label="بداية الكود" inputMode="numeric" dir="ltr" defaultValue={String(r.from)} onBlur={(e) => change(Number(e.target.value), r.count)} />
      <Input label="عدد الأصناف" inputMode="numeric" dir="ltr" defaultValue={String(r.count)} onBlur={(e) => change(r.from, Number(e.target.value))} />
      <p className="col-span-2 text-[13.5px] text-muted sm:col-span-1 sm:pb-2.5">الأكواد من <b className="num text-ink">{r.from}</b> إلى <b className="num text-ink">{r.from + r.count - 1}</b></p>
    </div>
  );
}
