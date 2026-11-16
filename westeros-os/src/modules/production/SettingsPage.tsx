/** ثوابت النظام: product categories and their codes, chef codes, meat cuts and their suggested fat, storage methods, and the raw materials the methods use. */
import { useState } from "react";
import { Beef, ChefHat, Package, Plus, Settings2, Tags, Trash2, X } from "lucide-react";
import { useSession } from "@/auth/session";
import { useDb } from "@/data/hooks";
import type { MfgCategoryDef, MfgMeatType, MfgSettings, StockItem } from "@/data/types";
import { useT } from "@/i18n/i18n";
import { uuid } from "@/lib/id";
import { Button, Card, CardHeader, EmptyState, IconButton, Input, Select } from "@/ui";
import { Num } from "./ui";
import { useProduction } from "./useProduction";

export default function SettingsPage() {
  const { L, loc } = useT();
  const db = useDb();
  const { can } = useSession();
  const prod = useProduction();
  const [method, setMethod] = useState("");
  const s = prod.settings;
  if (!can("production.manage")) return <EmptyState icon={<Settings2 />} title={L("الثوابت للإدارة والشيف", "Constants are for managers and chefs")} />;
  if (!s) return <EmptyState icon={<Settings2 />} title={L("لا توجد ثوابت تصنيع لهذا المطعم", "No manufacturing constants for this restaurant")} />;
  const patch = (p: Partial<MfgSettings>) => db.update("mfgSettings", s.id, p);
  const kitchen = prod.staff.filter((m) => m.active && (m.role === "chef" || m.role === "kitchen" || s.chefCodes[m.id]));
  const raws = prod.items.filter((i) => i.active);
  const itemOptions = (list: StockItem[]) => [{ value: "", label: "—" }, ...list.map((i) => ({ value: i.id, label: `${loc(i.name)} · ${i.sku}` }))];
  const cats = prod.categories;
  const setCat = (id: string, p: Partial<MfgCategoryDef>) => patch({ productCategories: cats.map((c) => (c.id === id ? { ...c, ...p } : c)) });
  const usedCats = new Set(prod.products.map((x) => x.category));
  const setMeat = (id: string, p: Partial<MfgMeatType>) => patch({ meatTypes: s.meatTypes.map((m) => (m.id === id ? { ...m, ...p } : m)) });
  return (
    <div className="grid items-start gap-5 lg:grid-cols-2">
      <Card className="lg:col-span-2">
        <CardHeader
          icon={<Tags />}
          title={L("فئات المنتجات المصنعة", "Product categories")}
          subtitle={L("الكود هو أول رقم في رقم التشغيلة. حدد نوع البرجر على الفئات التي تُصنع بطريقة البرجر.", "The code is the first number of the batch number. Mark the categories made with the burger method.")}
          action={<Button size="sm" variant="outline" icon={<Plus />} onClick={() => patch({ productCategories: [...cats, { id: uuid(), name: { ar: L("فئة جديدة", "New category"), en: "New category" }, code: Math.max(0, ...cats.map((c) => c.code)) + 1, burger: null }] })}>{L("فئة جديدة", "Add category")}</Button>}
        />
        <ul className="grid gap-2 px-5 pb-5">
          {cats.map((c) => (
            <li key={c.id} className="grid items-end gap-2 rounded-xl border border-line p-3 sm:grid-cols-[minmax(0,1.4fr)_110px_minmax(0,1fr)_auto]">
              <Input label={L("اسم الفئة", "Name")} defaultValue={c.name.ar} onBlur={(e) => e.target.value.trim() && e.target.value !== c.name.ar && setCat(c.id, { name: { ar: e.target.value.trim(), en: e.target.value.trim() } })} />
              <Num label={L("الكود", "Code")} value={c.code} onChange={(n) => setCat(c.id, { code: Math.max(0, Math.round(n)) })} />
              <Select label={L("نوع البرجر", "Burger type")} value={c.burger ?? ""} onChange={(e) => setCat(c.id, { burger: (e.target.value || null) as MfgCategoryDef["burger"] })} options={[{ value: "", label: L("ليست برجر", "Not a burger") }, { value: "beef", label: L("برجر لحم (لحم ودهن)", "Meat burger (meat & fat)") }, { value: "chicken", label: L("برجر دجاج (فرم)", "Chicken burger (mince)") }]} />
              <IconButton label={usedCats.has(c.id) ? L("فيها منتجات، انقلها أولًا", "Has products, move them first") : L("حذف", "Remove")} disabled={usedCats.has(c.id)} onClick={() => patch({ productCategories: cats.filter((x) => x.id !== c.id) })}>
                <Trash2 />
              </IconButton>
            </li>
          ))}
          {cats.length ? null : <li className="text-[14px] text-muted">{L("أضف أول فئة.", "Add the first category.")}</li>}
        </ul>
      </Card>

      <Card>
        <CardHeader icon={<ChefHat />} title={L("أكواد الشيفات", "Chef codes")} subtitle={L("الرقم بين القوسين في رقم الباتش، مثل 2-21102026#1(5)", "The number in brackets in the batch number, e.g. 2-21102026#1(5)")} />
        <ul className="grid gap-2 px-5 pb-5">
          {kitchen.map((m) => (
            <li key={m.id} className="flex items-center gap-3 rounded-xl border border-line px-3 py-2">
              <span className="min-w-0 flex-1 truncate text-[14.5px] font-semibold">{m.name}</span>
              <Num className="w-24" value={s.chefCodes[m.id] ?? 0} onChange={(n) => patch({ chefCodes: { ...s.chefCodes, [m.id]: Math.round(n) } })} />
            </li>
          ))}
          {kitchen.length ? null : <li className="text-[14px] text-muted">{L("أضف الشيفات من صفحة الموظفين.", "Add chefs from the staff page.")}</li>}
        </ul>
      </Card>

      <Card>
        <CardHeader icon={<Package />} title={L("طرق التخزين", "Storage methods")} subtitle={L("تظهر على الستيكر وفي بيانات المنتج", "Shown on the sticker and the product")} />
        <div className="grid gap-3 px-5 pb-5">
          <div className="flex flex-wrap gap-1.5">
            {s.storageMethods.map((m) => (
              <span key={m} className="inline-flex items-center gap-1 rounded-full border border-line bg-surface-2 py-1 ps-3 pe-1 text-[13.5px] font-semibold">
                {m}
                <button type="button" aria-label={L("حذف", "Remove")} className="grid size-6 place-items-center rounded-full text-muted hover:bg-surface-3 hover:text-ink" onClick={() => patch({ storageMethods: s.storageMethods.filter((x) => x !== m) })}>
                  <X className="size-3.5" />
                </button>
              </span>
            ))}
          </div>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const v = method.trim();
              if (v && !s.storageMethods.includes(v)) void patch({ storageMethods: [...s.storageMethods, v] });
              setMethod("");
            }}
          >
            <Input wrapClassName="flex-1" placeholder={L("طريقة تخزين جديدة", "New storage method")} value={method} onChange={(e) => setMethod(e.target.value)} />
            <Button type="submit" variant="outline" icon={<Plus />}>{L("إضافة", "Add")}</Button>
          </form>
        </div>
      </Card>

      <Card className="lg:col-span-2">
        <CardHeader
          icon={<Beef />}
          title={L("أنواع اللحوم ووزن الدهن", "Meat cuts & fat weight")}
          subtitle={L("جرامات الدهن المقترحة لكل كيلو لحم صافي في تصنيع البرجر", "Suggested grams of fat per net kilo of meat for burgers")}
          action={<Button size="sm" variant="outline" icon={<Plus />} onClick={() => patch({ meatTypes: [...s.meatTypes, { id: uuid(), name: { ar: L("نوع لحم جديد", "New cut"), en: "New cut" }, stockItemId: null, fatGramsPerKg: 200 }] })}>{L("نوع جديد", "Add cut")}</Button>}
        />
        <ul className="grid gap-2 px-5 pb-5">
          {s.meatTypes.map((m) => (
            <li key={m.id} className="grid items-end gap-2 rounded-xl border border-line p-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_140px_auto]">
              <Input label={L("الاسم", "Name")} defaultValue={m.name.ar} onBlur={(e) => e.target.value.trim() && e.target.value !== m.name.ar && setMeat(m.id, { name: { ar: e.target.value.trim(), en: e.target.value.trim() } })} />
              <Select label={L("الخامة في المخزن", "Stock item")} value={m.stockItemId ?? ""} onChange={(e) => setMeat(m.id, { stockItemId: e.target.value || null })} options={itemOptions(raws.filter((i) => i.kind === "raw"))} />
              <Num label={L("دهن لكل كيلو", "Fat per kilo")} suffix={L("جم", "g")} value={m.fatGramsPerKg} onChange={(n) => setMeat(m.id, { fatGramsPerKg: Math.round(n) })} />
              <IconButton label={L("حذف", "Remove")} onClick={() => patch({ meatTypes: s.meatTypes.filter((x) => x.id !== m.id) })}>
                <Trash2 />
              </IconButton>
            </li>
          ))}
        </ul>
      </Card>

      <Card className="lg:col-span-2">
        <CardHeader icon={<Settings2 />} title={L("خامات طرق التصنيع", "Raw materials of the methods")} subtitle={L("الخامة التي تُسحب من المخزن في كل طريقة", "The stock item each method draws from")} />
        <div className="grid gap-3 px-5 pb-5 sm:grid-cols-2">
          <Select label={L("الخامة المقترحة لطريقة المادة الخام الواحدة", "Default raw material for the one-raw-material method")} hint={L("مثل صدور الدجاج. الشيف يقدر يختار غيرها في كل تشغيلة.", "For example chicken breast. The chef can pick another per batch.")} value={s.chickenItemId ?? ""} onChange={(e) => patch({ chickenItemId: e.target.value || null })} options={itemOptions(raws.filter((i) => i.kind === "raw"))} />
          <Select label={L("الفرم المستخدم في برجر الدجاج", "Mince used in chicken burgers")} value={s.mincedChickenItemId ?? ""} onChange={(e) => patch({ mincedChickenItemId: e.target.value || null })} options={itemOptions(raws)} />
          <Select label={L("خامة الدهن في برجر اللحم", "Fat raw material for meat burgers")} hint={L("يُحسب بآخر سعر شراء", "Costed at the last purchase price")} value={s.rawFatItemId ?? ""} onChange={(e) => patch({ rawFatItemId: e.target.value || null })} options={itemOptions(raws.filter((i) => i.kind === "raw"))} />
        </div>
      </Card>
    </div>
  );
}
