/** الخيارات الجانبية (Side Options في Bonbell): قائمة أسماء الخيارات اللي المجموعات بتختار منها، بسعر مقترح. */
import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { useDb, useLive } from "@/data/hooks";
import type { Modifier } from "@/data/types";
import { uuid } from "@/lib/id";
import { Button, Card, EmptyState, IconButton, Input, useToast } from "@/ui";
import { listsOf } from "../lib";

export function SideOptions({ readOnly, mods }: { readOnly: boolean; mods: Modifier[] }) {
  const db = useDb();
  const { toast } = useToast();
  const settings = useLive("mfgSettings").data[0];
  const lists = listsOf(settings);
  const list = lists.sideOptions ?? [];
  const [d, setD] = useState({ name: "", nameAr: "", price: "0" });
  const [q, setQ] = useState("");
  const save = async (next: typeof list) => {
    if (!settings) return toast({ tone: "error", title: "ثوابت النظام لسه ما اتعملتش" });
    try {
      await db.update("mfgSettings", settings.id, { lists: { ...lists, sideOptions: next } });
    } catch (e) {
      toast({ tone: "error", title: "تعذر الحفظ", description: String((e as Error)?.message ?? e) });
    }
  };
  const add = async () => {
    const name = d.name.trim();
    if (!name) return;
    if (list.some((o) => o.name.toLowerCase() === name.toLowerCase())) return toast({ tone: "error", title: "الاسم موجود" });
    await save([...list, { id: uuid(), name, nameAr: d.nameAr.trim() || undefined, price: Number(d.price) || 0 }]);
    setD({ name: "", nameAr: "", price: "0" });
  };
  const used = (name: string) => mods.filter((m) => m.name.en === name || m.name.ar === name).length;
  const rows = list.filter((o) => !q.trim() || o.name.toLowerCase().includes(q.trim().toLowerCase()) || (o.nameAr ?? "").includes(q.trim()));
  return (
    <Card className="grid gap-3 p-3">
      {!readOnly ? (
        <div className="grid items-end gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_120px_auto]">
          <Input label="الاسم بالإنجليزي" dir="ltr" value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} />
          <Input label="الاسم بالعربي" value={d.nameAr} onChange={(e) => setD({ ...d, nameAr: e.target.value })} />
          <Input label="السعر" inputMode="decimal" className="num" dir="ltr" value={d.price} onChange={(e) => setD({ ...d, price: e.target.value })} />
          <Button icon={<Plus />} disabled={!d.name.trim()} onClick={add}>إضافة خيار جانبي</Button>
        </div>
      ) : null}
      <Input wrapClassName="max-w-xs" placeholder="ابحث" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] text-[13.5px]">
          <thead><tr className="border-b border-line text-[12.5px] text-muted"><th className="p-2 text-start">#</th><th className="p-2 text-start">الاسم</th><th className="p-2 text-start">السعر</th><th className="p-2 text-start">مستخدم في</th><th /></tr></thead>
          <tbody>
            {rows.map((o, i) => (
              <tr key={o.id} className="border-b border-line/60">
                <td className="num p-2 text-muted">{i + 1}</td>
                <td className="p-2 font-semibold"><span dir="ltr">{o.name}</span>{o.nameAr ? <span className="block text-[12px] font-medium text-muted">{o.nameAr}</span> : null}</td>
                <td className="p-2">{readOnly ? <span className="num">{o.price}</span> : <Input wrapClassName="w-24" inputMode="decimal" className="num" dir="ltr" defaultValue={String(o.price)} onBlur={(e) => Number(e.target.value) !== o.price && save(list.map((x) => (x.id === o.id ? { ...x, price: Number(e.target.value) || 0 } : x)))} />}</td>
                <td className="num p-2 text-muted">{used(o.name) ? `${used(o.name)} خيار` : "—"}</td>
                <td className="p-2 text-end">{!readOnly ? <IconButton size="sm" label="حذف" onClick={() => save(list.filter((x) => x.id !== o.id))}><Trash2 /></IconButton> : null}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length ? <EmptyState compact title="مافيش خيارات جانبية" body="بتتملى لوحدها لما تستورد المنيو من Bonbell، أو ضيفها من هنا." /> : null}
      </div>
    </Card>
  );
}
