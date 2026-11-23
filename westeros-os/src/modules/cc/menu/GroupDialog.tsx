/**
 * مجموعة خيارات لصنف (زي Bonbell): الاسم بالعربي والإنجليزي، مطلوبة أو اختيارية، خيار واحد أو أكتر، أقل وأكتر عدد
 * اختيارات، وكل خيار باسمه وسعره وأقل وأكتر عدد مرات يتختار (0 = من غير حد).
 */
import { useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { useDb, useLive } from "@/data/hooks";
import type { MenuItem, Modifier, ModifierGroup } from "@/data/types";
import { UNITS_PER_MAJOR } from "@/lib/money";
import { Button, Dialog, IconButton, Input, Segmented, Switch, useToast } from "@/ui";
import { listsOf } from "../lib";

interface Row { id: string | null; ar: string; en: string; price: string; minQty: string; maxQty: string; available: boolean }
const num = (s: string) => {
  const n = Number(String(s).replace(/[^\d.]/g, ""));
  return Number.isFinite(n) ? n : 0;
};
const blankRow = (): Row => ({ id: null, ar: "", en: "", price: "0", minQty: "0", maxQty: "1", available: true });

/** the group's columns from the form: max ≥ 1 always; multi with max 0 = as many as the options */
export function groupLimits(f: { required: boolean; multi: boolean; min: number; max: number }, options: number) {
  const max = f.multi ? (f.max > 0 ? f.max : Math.max(1, options)) : 1;
  const min = f.required ? Math.max(1, Math.min(f.min || 1, max)) : 0;
  return { min, max };
}

export function GroupDialog({ item, group, mods, onClose }: { item: MenuItem; group: ModifierGroup | null; mods: Modifier[]; onClose: () => void }) {
  const db = useDb();
  const { toast } = useToast();
  const settings = useLive("mfgSettings").data[0];
  const library = listsOf(settings).sideOptions ?? [];
  const own = useMemo(() => (group ? mods.filter((m) => m.groupId === group.id) : []), [group, mods]);
  const [f, setF] = useState(() => ({
    ar: group?.name.ar ?? "",
    en: group?.name.en ?? "",
    required: group?.required ?? (group ? group.min > 0 : false),
    multi: group?.multi ?? (group ? group.max > 1 : false),
    min: String(group?.min ?? 0),
    max: String(group && (group.multi ?? group.max > 1) ? group.max : 0),
  }));
  const [rows, setRows] = useState<Row[]>(() =>
    own.length
      ? own.map((m) => ({ id: m.id, ar: m.name.ar, en: m.name.en, price: String(m.price / UNITS_PER_MAJOR), minQty: String(m.minQty ?? 0), maxQty: String(m.maxQty ?? 1), available: m.available }))
      : [blankRow()],
  );
  const [busy, setBusy] = useState(false);
  // اسم الخيار: from the side options and every option already on the menu
  const names = useMemo(() => [...new Set([...library.map((o) => o.name), ...mods.map((m) => m.name.en || m.name.ar)])].filter(Boolean).sort(), [library, mods]);
  const setRow = (i: number, p: Partial<Row>) => setRows((r) => r.map((x, j) => (j === i ? { ...x, ...p } : x)));
  const pickName = (i: number, v: string) => {
    const lib = library.find((o) => o.name === v);
    setRow(i, { en: v, ...(lib && !rows[i].ar ? { ar: lib.nameAr || "" } : {}), ...(lib && num(rows[i].price) === 0 ? { price: String(lib.price) } : {}) });
  };
  const valid = rows.filter((r) => r.ar.trim() || r.en.trim());
  const save = async () => {
    setBusy(true);
    try {
      const lim = groupLimits({ required: f.required, multi: f.multi, min: Math.round(num(f.min)), max: Math.round(num(f.max)) }, valid.length);
      const row = { name: { ar: f.ar.trim() || f.en.trim(), en: f.en.trim() || f.ar.trim() }, ...lim, required: f.required, multi: f.multi };
      const g = group ? await db.update("modifierGroups", group.id, row) : await db.insert("modifierGroups", { ...row, sort: 0 });
      const keep = new Set<string>();
      for (const [k, r] of valid.entries()) {
        const m = { name: { ar: r.ar.trim() || r.en.trim(), en: r.en.trim() || r.ar.trim() }, price: Math.round(num(r.price) * UNITS_PER_MAJOR), minQty: Math.round(num(r.minQty)), maxQty: Math.round(num(r.maxQty)), available: r.available, sort: k + 1 };
        if (r.id) {
          await db.update("modifiers", r.id, m);
          keep.add(r.id);
        } else await db.insert("modifiers", { ...m, groupId: g.id, isDefault: false });
      }
      // an option taken off the group: orders keep its name and price on the line, so the row can go
      for (const m of own) if (!keep.has(m.id)) await db.remove("modifiers", m.id);
      if (!group) await db.update("menuItems", item.id, { modifierGroupIds: [...item.modifierGroupIds, g.id] });
      toast({ tone: "success", title: "اتحفظت المجموعة" });
      onClose();
    } catch (e) {
      toast({ tone: "error", title: "تعذر الحفظ", description: String((e as Error)?.message ?? e) });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open onClose={onClose} size="xl" title={group ? "تعديل المجموعة" : "إضافة مجموعة"} description={item.name.ar}
      footer={<div className="flex justify-end gap-2"><Button variant="ghost" onClick={onClose}>إلغاء</Button><Button loading={busy} disabled={!(f.ar.trim() || f.en.trim()) || !valid.length} onClick={save}>حفظ</Button></div>}>
      <div className="grid gap-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Input label="اسم المجموعة بالعربي" value={f.ar} onChange={(e) => setF({ ...f, ar: e.target.value })} placeholder="مثلاً: الحجم، كومبو، الإضافات، ملاحظات" />
          <Input label="اسم المجموعة بالإنجليزي" dir="ltr" value={f.en} onChange={(e) => setF({ ...f, en: e.target.value })} placeholder="SIZE, COMBO, EXTRAS, NOTES" />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Segmented label="مطلوبة" value={f.required ? "req" : "opt"} onChange={(v) => setF({ ...f, required: v === "req" })} options={[{ value: "req", label: "مطلوبة" }, { value: "opt", label: "اختيارية" }]} />
          <Segmented label="نوع الخيارات" value={f.multi ? "multi" : "single"} onChange={(v) => setF({ ...f, multi: v === "multi" })} options={[{ value: "single", label: "خيار واحد" }, { value: "multi", label: "أكتر من خيار" }]} />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Input label="أقل عدد اختيارات" inputMode="numeric" className="num" dir="ltr" value={f.min} onChange={(e) => setF({ ...f, min: e.target.value })} disabled={!f.required} />
          <Input label="أكتر عدد اختيارات" inputMode="numeric" className="num" dir="ltr" value={f.max} onChange={(e) => setF({ ...f, max: e.target.value })} disabled={!f.multi} hint={f.multi ? "0 = من غير حد" : undefined} />
        </div>
        <datalist id="side-option-names">{names.map((n) => <option key={n} value={n} />)}</datalist>
        <div className="grid gap-2">
          <p className="text-[14px] font-semibold">الخيارات</p>
          {rows.map((r, i) => (
            <div key={i} className="grid items-end gap-2 rounded-xl border border-line p-2 sm:grid-cols-[minmax(0,1.3fr)_minmax(0,1.3fr)_90px_80px_80px_auto_auto]">
              <Input label={`الخيار ${i + 1} بالإنجليزي`} dir="ltr" list="side-option-names" value={r.en} onChange={(e) => pickName(i, e.target.value)} />
              <Input label="بالعربي" value={r.ar} onChange={(e) => setRow(i, { ar: e.target.value })} />
              <Input label="السعر" inputMode="decimal" className="num" dir="ltr" value={r.price} onChange={(e) => setRow(i, { price: e.target.value })} />
              <Input label="أقل عدد" inputMode="numeric" className="num" dir="ltr" value={r.minQty} onChange={(e) => setRow(i, { minQty: e.target.value })} />
              <Input label="أكتر عدد" inputMode="numeric" className="num" dir="ltr" value={r.maxQty} onChange={(e) => setRow(i, { maxQty: e.target.value })} />
              <div className="pb-1"><Switch checked={r.available} onChange={(available) => setRow(i, { available })} label="متاح" /></div>
              <IconButton label="حذف الخيار" onClick={() => setRows((x) => (x.length > 1 ? x.filter((_, j) => j !== i) : [blankRow()]))}><Trash2 /></IconButton>
            </div>
          ))}
          <div><Button size="sm" variant="soft" icon={<Plus />} onClick={() => setRows((x) => [...x, blankRow()])}>إضافة خيار</Button></div>
          <p className="text-[12.5px] text-muted">سعر الخيار بيتضاف على سعر الصنف عند الكاشير. "أكتر عدد" للخيار = كام مرة يتختار (زي 2 جبنة)، و0 = من غير حد.</p>
        </div>
      </div>
    </Dialog>
  );
}
