/**
 * الخيارات الجانبية (Side Options في Bonbell): المكان الوحيد اللي بيتعدل فيه اسم الخيار بالعربي والإنجليزي وسعره وإتاحته،
 * وأي تعديل بيتطبق على الخيار ده في كل الأصناف. والخيار ممكن يكون صنف من المنيو (زي برجر جوه بوكس) عشان يتحسب في مبيعاته.
 */
import { inChunks } from "@/lib/batch";
import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { useDb, useLive } from "@/data/hooks";
import type { MenuItem, Modifier } from "@/data/types";
import { uuid } from "@/lib/id";
import { Button, Card, EmptyState, IconButton, Input, Select, Switch, useToast } from "@/ui";
import { Confirm } from "../finance/ui";
import { listsOf } from "../lib";
import { inStep, modFieldsOf, type SideOpt } from "./sideOptions";

export function SideOptions({ readOnly, mods, items }: { readOnly: boolean; mods: Modifier[]; items: MenuItem[] }) {
  const db = useDb();
  const { toast } = useToast();
  const settings = useLive("mfgSettings").data[0];
  const lists = listsOf(settings);
  const list = lists.sideOptions ?? [];
  const [d, setD] = useState({ name: "", nameAr: "", price: "0", menuItemId: "" });
  const [q, setQ] = useState("");
  const [drop, setDrop] = useState<SideOpt | null>(null);
  // a side option with a price is also a row of أصناف البيع (its components and cost): deleting it here removes it there too
  const remove = async (o: SideOpt) => {
    await save(list.filter((x) => x.id !== o.id));
    try {
      for (const r of await db.list("recipes", { where: { ownerType: "modifier", ownerId: o.id } })) await db.remove("recipes", r.id);
    } catch { /* the option is gone; a leftover recipe matches nothing */ }
    setDrop(null);
    toast({ tone: "success", title: "اتحذف الخيار من المنيو ومن أصناف البيع" });
  };
  const save = async (next: SideOpt[], changed?: SideOpt) => {
    if (!settings) return toast({ tone: "error", title: "ثوابت النظام لسه ما اتعملتش" });
    try {
      await db.update("mfgSettings", settings.id, { lists: { ...lists, sideOptions: next } });
      // the option changes on every item that uses it
      if (changed) {
        const f = modFieldsOf(changed);
        await inChunks(mods.filter((m) => m.sideOptionId === changed.id && !inStep(m, changed)), (m) => db.update("modifiers", m.id, f));
      }
    } catch (e) {
      toast({ tone: "error", title: "تعذر الحفظ", description: String((e as Error)?.message ?? e) });
    }
  };
  const edit = (o: SideOpt, p: Partial<SideOpt>) => {
    const next = { ...o, ...p };
    return save(list.map((x) => (x.id === o.id ? next : x)), next);
  };
  const add = async () => {
    const name = d.name.trim();
    if (!name) return;
    if (list.some((o) => o.name.toLowerCase() === name.toLowerCase())) return toast({ tone: "error", title: "الاسم موجود" });
    await save([...list, { id: uuid(), name, nameAr: d.nameAr.trim() || undefined, price: Number(d.price) || 0, available: true, menuItemId: d.menuItemId || null }]);
    setD({ name: "", nameAr: "", price: "0", menuItemId: "" });
  };
  const usedBy = (o: SideOpt) => mods.filter((m) => m.sideOptionId === o.id).length;
  const itemOptions = [{ value: "", label: "— مش صنف —" }, ...items.map((i) => ({ value: i.id, label: i.name.ar || i.name.en }))];
  const n = q.trim().toLowerCase();
  const rows = list.filter((o) => !n || o.name.toLowerCase().includes(n) || (o.nameAr ?? "").includes(q.trim()));
  return (
    <Card className="grid gap-3 p-3">
      <p className="text-[13px] text-muted">اسم الخيار وسعره وإتاحته بيتعدلوا من هنا بس، والتعديل بيتطبق على كل الأصناف اللي فيها الخيار ده. ولو الخيار صنف من المنيو (زي برجر جوه بوكس)، اختار الصنف عشان يظهر تحته في الفاتورة ويتحسب في مبيعاته.</p>
      {!readOnly ? (
        <div className="grid items-end gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_100px_minmax(0,1fr)_auto]">
          <Input label="الاسم بالإنجليزي" dir="ltr" value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} />
          <Input label="الاسم بالعربي" value={d.nameAr} onChange={(e) => setD({ ...d, nameAr: e.target.value })} />
          <Input label="السعر" inputMode="decimal" className="num" dir="ltr" value={d.price} onChange={(e) => setD({ ...d, price: e.target.value })} />
          <Select label="صنف من المنيو" value={d.menuItemId} onChange={(e) => setD({ ...d, menuItemId: e.target.value })} options={itemOptions} />
          <Button icon={<Plus />} disabled={!d.name.trim()} onClick={add}>إضافة خيار جانبي</Button>
        </div>
      ) : null}
      <Input wrapClassName="max-w-xs" placeholder="ابحث" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="overflow-x-auto">
        <table className="w-full min-w-[820px] text-[13.5px]">
          <thead><tr className="border-b border-line text-[12.5px] text-muted"><th className="p-2 text-start">#</th><th className="p-2 text-start">بالإنجليزي</th><th className="p-2 text-start">بالعربي</th><th className="p-2 text-start">السعر</th><th className="p-2 text-start">صنف من المنيو</th><th className="p-2 text-start">متاح</th><th className="p-2 text-start">مستخدم في</th><th /></tr></thead>
          <tbody>
            {rows.map((o, i) => (
              <tr key={o.id} className="border-b border-line/60">
                <td className="num p-2 text-muted">{i + 1}</td>
                {readOnly ? (
                  <>
                    <td className="p-2 font-semibold" dir="ltr">{o.name}</td>
                    <td className="p-2">{o.nameAr || "—"}</td>
                    <td className="num p-2">{o.price}</td>
                    <td className="p-2 text-muted">{items.find((x) => x.id === o.menuItemId)?.name.ar ?? "—"}</td>
                    <td className="p-2">{o.available === false ? "لأ" : "أيوه"}</td>
                  </>
                ) : (
                  <>
                    <td className="p-2"><Input aria-label="الاسم بالإنجليزي" dir="ltr" defaultValue={o.name} onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== o.name) void edit(o, { name: v }); }} /></td>
                    <td className="p-2"><Input aria-label="الاسم بالعربي" defaultValue={o.nameAr ?? ""} onBlur={(e) => { const v = e.target.value.trim(); if (v !== (o.nameAr ?? "")) void edit(o, { nameAr: v || undefined }); }} /></td>
                    <td className="p-2"><Input aria-label="السعر" wrapClassName="w-24" inputMode="decimal" className="num" dir="ltr" defaultValue={String(o.price)} onBlur={(e) => { const v = Number(e.target.value) || 0; if (v !== o.price) void edit(o, { price: v }); }} /></td>
                    <td className="p-2"><Select aria-label="صنف من المنيو" value={o.menuItemId ?? ""} onChange={(e) => void edit(o, { menuItemId: e.target.value || null })} options={itemOptions} /></td>
                    <td className="p-2"><Switch checked={o.available !== false} onChange={(v) => void edit(o, { available: v })} label="متاح" /></td>
                  </>
                )}
                <td className="num p-2 text-muted">{usedBy(o) ? `${usedBy(o)} صنف` : "—"}</td>
                <td className="p-2 text-end">{!readOnly ? (
                  <IconButton size="sm" label={usedBy(o) ? "مستخدم في أصناف: شيله من مجموعاتها الأول" : "حذف"} disabled={usedBy(o) > 0} onClick={() => setDrop(o)}><Trash2 /></IconButton>
                ) : null}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length ? <EmptyState compact title="مافيش خيارات جانبية" body="بتتملى لوحدها لما تستورد المنيو من Bonbell، أو ضيفها من هنا." /> : null}
      </div>
      <Confirm open={!!drop} onClose={() => setDrop(null)} onConfirm={() => drop && remove(drop)} danger title="حذف الخيار الجانبي؟" confirmLabel="حذف"
        description={drop ? `"${drop.nameAr || drop.name}" هيتحذف من المنيو${drop.price > 0 && !drop.menuItemId ? " ومن أصناف البيع في التصنيع، ومعاه مكوناته وتكلفته" : ""}.` : undefined} />
    </Card>
  );
}
