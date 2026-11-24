/**
 * قنوات البيع (Mohammed 2026-11-23): كل قناة بتاخد سعر 1 أو 2 أو 3 من أسعار الصنف، وفيها ضريبة أو لأ وسيرفيس أو لأ،
 * وظاهرة في الكاشير أو لأ. نسبة الضريبة والسيرفيس من هنا كمان. وقناة الصالة منها بيتعدل شكل الصالة.
 */
import { useState } from "react";
import { Link } from "react-router-dom";
import { LayoutGrid, Plus, Trash2 } from "lucide-react";
import { useDb, useLive } from "@/data/hooks";
import { channelsOf, KIND_LABEL, type ChannelKind, type PriceLevel, type SalesChannelDef } from "@/data/channels";
import { uuid } from "@/lib/id";
import { Button, Card, IconButton, Input, Select, Switch, useToast } from "@/ui";

const err = (e: unknown) => String((e as Error)?.message ?? e);

export function SalesChannels({ can }: { can: boolean }) {
  const db = useDb();
  const { toast } = useToast();
  const settings = useLive("settings").data[0];
  const list = channelsOf(settings);
  const [name, setName] = useState("");
  if (!settings) return <Card className="p-4 text-muted">إعدادات المطعم لسه بتحمل…</Card>;
  const save = async (next: SalesChannelDef[]) => {
    try {
      await db.update("settings", settings.id, { salesChannels: next });
    } catch (e) {
      toast({ tone: "error", title: "تعذر الحفظ", description: err(e) });
    }
  };
  const edit = (c: SalesChannelDef, p: Partial<SalesChannelDef>) => save(list.map((x) => (x.id === c.id ? { ...x, ...p } : x)));
  const setRate = async (key: "vatRate" | "serviceRate", pct: string) => {
    const v = Math.round(Number(pct.replace(/[^\d.]/g, "")) * 100);
    if (!Number.isFinite(v) || v < 0 || v > 10_000 || v === settings.tax[key]) return;
    try {
      await db.update("settings", settings.id, { tax: { ...settings.tax, [key]: v } });
      toast({ tone: "success", title: "اتحفظت النسبة" });
    } catch (e) {
      toast({ tone: "error", title: "تعذر الحفظ", description: err(e) });
    }
  };
  const add = () => {
    const n = name.trim();
    if (!n) return;
    if (list.some((c) => c.name === n)) return toast({ tone: "error", title: "الاسم موجود" });
    void save([...list, { id: uuid(), name: n, kind: "takeaway", level: 1, tax: settings.tax.vatRegistered, service: false, visible: true }]);
    setName("");
  };
  return (
    <div className="grid gap-4">
      <Card className="grid gap-3 p-4">
        <p className="text-[14px] font-semibold">النسب</p>
        <div className="flex flex-wrap items-end gap-4">
          <Input label="الضريبة" wrapClassName="w-28" end={<span className="pe-2 text-[14px] font-semibold text-muted">%</span>} inputMode="decimal" dir="ltr" className="num text-center" disabled={!can} defaultValue={String(settings.tax.vatRate / 100)} onBlur={(e) => void setRate("vatRate", e.target.value)} />
          <Input label="السيرفيس (الخدمة)" wrapClassName="w-28" end={<span className="pe-2 text-[14px] font-semibold text-muted">%</span>} inputMode="decimal" dir="ltr" className="num text-center" disabled={!can} defaultValue={String(settings.tax.serviceRate / 100)} onBlur={(e) => void setRate("serviceRate", e.target.value)} />
        </div>
        <p className="text-[12.5px] text-muted">كل قناة تحت بتختار هل فواتيرها عليها ضريبة وسيرفيس ولا لأ.</p>
      </Card>
      <Card className="grid gap-3 p-4">
        <p className="text-[14px] font-semibold">قنوات البيع</p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-[13.5px]">
            <thead>
              <tr className="border-b border-line text-[12.5px] text-muted">
                <th className="p-2 text-start">القناة</th><th className="p-2 text-start">النوع في الكاشير</th><th className="p-2 text-start">السعر</th>
                <th className="p-2 text-start">ضريبة</th><th className="p-2 text-start">سيرفيس</th><th className="p-2 text-start">ظاهرة في الكاشير</th><th />
              </tr>
            </thead>
            <tbody>
              {list.map((c) => (
                <tr key={c.id} className="border-b border-line/60">
                  <td className="p-2"><Input aria-label="اسم القناة" disabled={!can} defaultValue={c.name} onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== c.name) void edit(c, { name: v }); }} /></td>
                  <td className="p-2"><Select aria-label="النوع" disabled={!can} value={c.kind} onChange={(e) => void edit(c, { kind: e.target.value as ChannelKind })} options={(Object.keys(KIND_LABEL) as ChannelKind[]).map((k) => ({ value: k, label: KIND_LABEL[k] }))} /></td>
                  <td className="p-2"><Select aria-label="السعر" disabled={!can} value={String(c.level)} onChange={(e) => void edit(c, { level: Number(e.target.value) as PriceLevel })} options={[1, 2, 3].map((l) => ({ value: String(l), label: `سعر ${l}` }))} /></td>
                  <td className="p-2"><Switch checked={c.tax} disabled={!can} onChange={(v) => void edit(c, { tax: v })} label="ضريبة" /></td>
                  <td className="p-2"><Switch checked={c.service} disabled={!can} onChange={(v) => void edit(c, { service: v })} label="سيرفيس" /></td>
                  <td className="p-2"><Switch checked={c.visible} disabled={!can} onChange={(v) => void edit(c, { visible: v })} label="ظاهرة" /></td>
                  <td className="p-2 text-end">
                    <div className="flex items-center justify-end gap-1">
                      {c.kind === "dine_in" ? <Link to="/floor?design=1" className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-line px-2.5 text-[12.5px] font-semibold hover:bg-surface-2"><LayoutGrid className="size-4" /> شكل الصالة</Link> : null}
                      {can ? <IconButton size="sm" label="حذف القناة" disabled={list.length <= 1} onClick={() => void save(list.filter((x) => x.id !== c.id))}><Trash2 /></IconButton> : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {can ? (
          <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); add(); }}>
            <Input wrapClassName="flex-1" placeholder="قناة جديدة (مثلاً: كيتا، مرسول)" value={name} onChange={(e) => setName(e.target.value)} />
            <Button type="submit" variant="outline" icon={<Plus />}>إضافة</Button>
          </form>
        ) : null}
        <p className="text-[12.5px] text-muted">السعر 2 و3 بيتكتبوا لكل صنف من المنيو (جدول الأسعار). لو الصنف ملوش سعر 2 أو 3، بياخد السعر الأول.</p>
      </Card>
    </div>
  );
}
