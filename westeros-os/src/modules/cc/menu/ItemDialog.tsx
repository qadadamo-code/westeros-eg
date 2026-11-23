/** إضافة وتعديل صنف في المنيو: الاسم بالعربي والإنجليزي، السعر والخصم، وقت التحضير، الوصف، الصورة، الفئة، القنوات، ظاهر ومميز. */
import { useState } from "react";
import { useDb } from "@/data/hooks";
import type { MenuCategory, MenuItem, SalesChannel } from "@/data/types";
import { UNITS_PER_MAJOR } from "@/lib/money";
import { Button, Dialog, Input, Select, Switch, Textarea, useToast } from "@/ui";
import { ImageField } from "../ui";

/** the channels a till sells on, like Bonbell's scenarios */
export const CHANNELS: { id: SalesChannel; label: string }[] = [
  { id: "delivery", label: "توصيل" },
  { id: "dine_in", label: "صالة" },
  { id: "takeaway", label: "تيك أواي" },
];

const num = (s: string) => {
  const n = Number(String(s).replace(/[^\d.]/g, ""));
  return Number.isFinite(n) ? n : 0;
};

export function ItemDialog({ item, cats, defaultCat, sort, onClose, onSaved }: { item: MenuItem | null; cats: MenuCategory[]; defaultCat: string; sort: number; onClose: () => void; onSaved?: (id: string) => void }) {
  const db = useDb();
  const { toast } = useToast();
  const [d, setD] = useState(() => ({
    ar: item?.name.ar ?? "",
    en: item?.name.en ?? "",
    price: item ? String(item.price / UNITS_PER_MAJOR) : "",
    pct: item && item.price && item.discount ? String(Math.round((item.discount / item.price) * 1000) / 10) : "0",
    prep: String(item?.prepMinutes ?? 15),
    kcal: item?.calories ? String(item.calories) : "",
    descAr: item?.description.ar ?? "",
    descEn: item?.description.en ?? "",
    imageUrl: item?.imageUrl ?? null,
    categoryId: item?.categoryId ?? defaultCat ?? cats[0]?.id ?? "",
    hiddenOn: item?.hiddenOn ?? ([] as SalesChannel[]),
    active: item?.active ?? true,
    recommended: item?.recommended ?? false,
  }));
  const [busy, setBusy] = useState(false);
  const set = (p: Partial<typeof d>) => setD((x) => ({ ...x, ...p }));
  const price = Math.round(num(d.price) * UNITS_PER_MAJOR);
  const pct = Math.min(100, num(d.pct));
  const final = Math.round((num(d.price) * (1 - pct / 100)) * 100) / 100;
  const save = async () => {
    setBusy(true);
    try {
      const fields: Partial<MenuItem> = {
        name: { ar: d.ar.trim(), en: d.en.trim() || d.ar.trim() },
        description: { ar: d.descAr.trim(), en: d.descEn.trim() },
        price,
        discount: Math.max(0, price - Math.round(final * UNITS_PER_MAJOR)),
        prepMinutes: Math.max(0, Math.round(num(d.prep))),
        calories: d.kcal.trim() ? Math.round(num(d.kcal)) : null,
        imageUrl: d.imageUrl,
        categoryId: d.categoryId,
        hiddenOn: d.hiddenOn,
        active: d.active,
        recommended: d.recommended,
      };
      const row = item
        ? await db.update("menuItems", item.id, fields)
        : await db.insert("menuItems", {
            cost: null, sku: null, stationId: null, modifierGroupIds: [], tags: [], available: true, vatExempt: false, sort,
            channelPrices: {}, branchPrices: {}, schedule: [], allergens: [], calories: fields.calories ?? null, comboOf: [],
            ...(fields as Required<Pick<MenuItem, "name" | "description" | "price" | "prepMinutes" | "categoryId" | "active">>),
            imageUrl: d.imageUrl, hiddenOn: d.hiddenOn, discount: fields.discount, recommended: d.recommended,
          });
      toast({ tone: "success", title: "اتحفظ الصنف" });
      onClose();
      if (!item) onSaved?.(row.id);
    } catch (e) {
      toast({ tone: "error", title: "تعذر الحفظ", description: String((e as Error)?.message ?? e) });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open onClose={onClose} size="lg" title={item ? "تعديل الصنف" : "إضافة صنف"}
      footer={<div className="flex justify-end gap-2"><Button variant="ghost" onClick={onClose}>إلغاء</Button><Button loading={busy} disabled={!d.ar.trim() || !d.categoryId || price <= 0} onClick={save}>حفظ</Button></div>}>
      <div className="grid gap-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Input label="الاسم بالعربي" value={d.ar} onChange={(e) => set({ ar: e.target.value })} />
          <Input label="الاسم بالإنجليزي" dir="ltr" value={d.en} onChange={(e) => set({ en: e.target.value })} />
        </div>
        <div className="grid gap-3 sm:grid-cols-5">
          <Input label="السعر (جنيه)" inputMode="decimal" className="num" dir="ltr" value={d.price} onChange={(e) => set({ price: e.target.value })} />
          <Input label="الخصم %" inputMode="decimal" className="num" dir="ltr" value={d.pct} onChange={(e) => set({ pct: e.target.value })} hint={pct ? `السعر بعد الخصم ${final}` : undefined} />
          <Input label="وقت التحضير (دقيقة)" inputMode="numeric" className="num" dir="ltr" value={d.prep} onChange={(e) => set({ prep: e.target.value })} />
          <Input label="السعرات" inputMode="numeric" className="num" dir="ltr" value={d.kcal} onChange={(e) => set({ kcal: e.target.value })} />
          <Select label="الفئة" value={d.categoryId} onChange={(e) => set({ categoryId: e.target.value })} options={cats.map((c) => ({ value: c.id, label: c.name.ar }))} />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Textarea label="الوصف بالعربي" rows={3} value={d.descAr} onChange={(e) => set({ descAr: e.target.value })} />
          <Textarea label="الوصف بالإنجليزي" rows={3} dir="ltr" value={d.descEn} onChange={(e) => set({ descEn: e.target.value })} />
        </div>
        <ImageField value={d.imageUrl} onChange={(imageUrl) => set({ imageUrl })} />
        <div>
          <p className="mb-2 text-[13px] font-semibold text-ink-2">بيتباع في</p>
          <div className="flex flex-wrap gap-2">
            {CHANNELS.map((c) => {
              const on = !d.hiddenOn.includes(c.id);
              return (
                <button key={c.id} type="button" aria-pressed={on} onClick={() => set({ hiddenOn: on ? [...d.hiddenOn, c.id] : d.hiddenOn.filter((x) => x !== c.id) })}
                  className={on ? "h-10 rounded-xl border border-primary bg-primary-soft px-4 text-[14px] font-semibold" : "h-10 rounded-xl border border-line px-4 text-[14px] text-muted"}>
                  {on ? "✓ " : ""}{c.label}
                </button>
              );
            })}
          </div>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <Switch checked={d.active} onChange={(active) => set({ active })} label="ظاهر" description="الصنف المخفي ما بيظهرش للكاشير" />
          <Switch checked={d.recommended} onChange={(recommended) => set({ recommended })} label="مميز" />
        </div>
      </div>
    </Dialog>
  );
}
