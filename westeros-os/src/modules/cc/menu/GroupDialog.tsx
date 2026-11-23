/**
 * مجموعة خيارات لصنف (زي Bonbell): الاسم بالعربي والإنجليزي، مطلوبة أو اختيارية، خيار واحد أو أكتر، أقل وأكتر عدد
 * اختيارات. الخيارات بتتختار من الخيارات الجانبية (اسمها وسعرها من هناك)، وهنا بس أقل وأكتر عدد مرات يتختار كل خيار.
 */
import { useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { useDb, useLive } from "@/data/hooks";
import type { MenuItem, Modifier, ModifierGroup } from "@/data/types";
import { Button, Dialog, IconButton, Input, Segmented, Select, useToast } from "@/ui";
import { listsOf } from "../lib";
import { modFieldsOf } from "./sideOptions";

interface Row { id: string | null; sideOptionId: string; minQty: string; maxQty: string }
const num = (s: string) => {
  const n = Number(String(s).replace(/[^\d.]/g, ""));
  return Number.isFinite(n) ? n : 0;
};
const blankRow = (): Row => ({ id: null, sideOptionId: "", minQty: "0", maxQty: "1" });

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
      ? own.map((m) => ({ id: m.id, sideOptionId: m.sideOptionId ?? library.find((o) => o.name.toLowerCase() === (m.name.en || m.name.ar).toLowerCase())?.id ?? "", minQty: String(m.minQty ?? 0), maxQty: String(m.maxQty ?? 1) }))
      : [blankRow()],
  );
  const [busy, setBusy] = useState(false);
  const libOptions = [{ value: "", label: "اختار من الخيارات الجانبية" }, ...library.map((o) => ({ value: o.id, label: `${o.name}${o.nameAr ? ` · ${o.nameAr}` : ""} (${o.price})${o.available === false ? " · مش متاح" : ""}` }))];
  const setRow = (i: number, p: Partial<Row>) => setRows((r) => r.map((x, j) => (j === i ? { ...x, ...p } : x)));
  const valid = rows.filter((r) => library.some((o) => o.id === r.sideOptionId));
  const save = async () => {
    setBusy(true);
    try {
      const lim = groupLimits({ required: f.required, multi: f.multi, min: Math.round(num(f.min)), max: Math.round(num(f.max)) }, valid.length);
      const row = { name: { ar: f.ar.trim() || f.en.trim(), en: f.en.trim() || f.ar.trim() }, ...lim, required: f.required, multi: f.multi };
      const g = group ? await db.update("modifierGroups", group.id, row) : await db.insert("modifierGroups", { ...row, sort: 0 });
      const keep = new Set<string>();
      for (const [k, r] of valid.entries()) {
        const o = library.find((x) => x.id === r.sideOptionId)!;
        // name, price and availability come from the side option; here only how many times it may be picked
        const m = { ...modFieldsOf(o), minQty: Math.round(num(r.minQty)), maxQty: Math.round(num(r.maxQty)), sort: k + 1 };
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
          <Input label="أقل عدد اختيارات" inputMode="numeric" className="num" dir="ltr" value={f.required ? f.min : "0"} onChange={(e) => setF({ ...f, min: e.target.value })} disabled={!f.required} hint={f.required ? undefined : "المجموعة الاختيارية أقل عدد فيها 0"} />
          <Input label="أكتر عدد اختيارات" inputMode="numeric" className="num" dir="ltr" value={f.max} onChange={(e) => setF({ ...f, max: e.target.value })} disabled={!f.multi} hint={f.multi ? "0 = من غير حد" : undefined} />
        </div>
        <div className="grid gap-2">
          <p className="text-[14px] font-semibold">الخيارات</p>
          {!library.length ? <p className="rounded-xl border border-line px-3 py-2 text-[13px] text-muted">مافيش خيارات جانبية لسه. ضيفها الأول من تبويب "الخيارات الجانبية".</p> : null}
          {rows.map((r, i) => {
            const o = library.find((x) => x.id === r.sideOptionId);
            return (
              <div key={i} className="grid items-end gap-2 rounded-xl border border-line p-2 sm:grid-cols-[minmax(0,2.4fr)_90px_80px_80px_auto]">
                <Select label={`الخيار ${i + 1}`} value={r.sideOptionId} onChange={(e) => setRow(i, { sideOptionId: e.target.value })} options={libOptions} />
                <div className="pb-2 text-[13px]"><span className="block text-[12px] text-muted">السعر</span><span className="num font-semibold">{o ? o.price : "—"}</span>{o?.available === false ? <span className="block text-[11.5px] text-danger">مش متاح</span> : null}</div>
                <Input label="أقل عدد" inputMode="numeric" className="num" dir="ltr" value={r.minQty} onChange={(e) => setRow(i, { minQty: e.target.value })} />
                <Input label="أكتر عدد" inputMode="numeric" className="num" dir="ltr" value={r.maxQty} onChange={(e) => setRow(i, { maxQty: e.target.value })} />
                <IconButton label="شيل الخيار" onClick={() => setRows((x) => (x.length > 1 ? x.filter((_, j) => j !== i) : [blankRow()]))}><Trash2 /></IconButton>
              </div>
            );
          })}
          <div><Button size="sm" variant="soft" icon={<Plus />} onClick={() => setRows((x) => [...x, blankRow()])}>إضافة خيار</Button></div>
          <p className="text-[12.5px] text-muted">الاسم والسعر والإتاحة بيتعدلوا من الخيارات الجانبية بس. "أكتر عدد" للخيار = كام مرة يتختار (زي 2 جبنة)، و0 = من غير حد.</p>
        </div>
      </div>
    </Dialog>
  );
}
