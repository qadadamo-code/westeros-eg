/**
 * جدول الأسعار (Mohammed 2026-11-23): كل الأصناف في جدول واحد بفلتر الفئة وقناة البيع، وتعديل سريع لسعر 1 و2 و3.
 * كل قناة بيع (الحسابات > المبيعات) بتاخد واحد من التلاتة.
 */
import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { useDb, useLive } from "@/data/hooks";
import { channelsOf, levelPrice, type PriceLevel } from "@/data/channels";
import type { MenuCategory, MenuItem } from "@/data/types";
import { cn } from "@/lib/cn";
import { major } from "@/lib/money";
import { Card, Input, Select, useToast } from "@/ui";

const pounds = (u: number | null | undefined) => (u == null ? "" : String(u / major(1)));
const FIELD: Record<PriceLevel, "price" | "price2" | "price3"> = { 1: "price", 2: "price2", 3: "price3" };

export function PriceTable({ items, cats, readOnly }: { items: MenuItem[]; cats: MenuCategory[]; readOnly: boolean }) {
  const db = useDb();
  const { toast } = useToast();
  const settings = useLive("settings").data[0];
  const channels = channelsOf(settings);
  const [cat, setCat] = useState("");
  const [ch, setCh] = useState("");
  const [q, setQ] = useState("");
  const channel = channels.find((c) => c.id === ch) ?? null;
  const rows = useMemo(() => {
    const n = q.trim().toLowerCase();
    const order = new Map(cats.map((c) => [c.id, c.sort]));
    return items
      .filter((i) => (!cat || i.categoryId === cat) && (!channel || !(i.hiddenOn ?? []).includes(channel.kind)) && (!n || i.name.ar.toLowerCase().includes(n) || i.name.en.toLowerCase().includes(n) || (i.sku ?? "") === n))
      .sort((a, b) => (order.get(a.categoryId) ?? 0) - (order.get(b.categoryId) ?? 0) || a.sort - b.sort);
  }, [items, cats, cat, channel, q]);
  const setPrice = async (i: MenuItem, level: PriceLevel, text: string) => {
    const t = text.trim();
    const v = t === "" ? null : major(Number(t.replace(/[^\d.]/g, "")) || 0);
    if (level === 1 && v == null) return;
    if (v === (i[FIELD[level]] ?? null)) return;
    try {
      await db.update("menuItems", i.id, { [FIELD[level]]: v } as Partial<MenuItem>);
    } catch (e) {
      toast({ tone: "error", title: "تعذر الحفظ", description: String((e as Error)?.message ?? e) });
    }
  };
  const catName = (id: string) => cats.find((c) => c.id === id)?.name.ar ?? "—";
  return (
    <Card className="grid gap-3 p-3">
      <div className="flex flex-wrap items-end gap-2">
        <Input icon={<Search />} wrapClassName="w-56" placeholder="ابحث بالاسم أو الكود" value={q} onChange={(e) => setQ(e.target.value)} />
        <Select aria-label="الفئة" value={cat} onChange={(e) => setCat(e.target.value)} options={[{ value: "", label: "كل الفئات" }, ...cats.map((c) => ({ value: c.id, label: c.name.ar }))]} />
        <Select aria-label="قناة البيع" value={ch} onChange={(e) => setCh(e.target.value)} options={[{ value: "", label: "كل القنوات" }, ...channels.map((c) => ({ value: c.id, label: `${c.name} (سعر ${c.level})` }))]} />
        <span className="num ms-auto text-[13px] text-muted">{rows.length} صنف</span>
      </div>
      <p className="text-[12.5px] text-muted">اكتب السعر واطلع من الخانة يتحفظ على طول. سعر 2 أو 3 فاضي = بياخد السعر الأول. {channel ? `قناة ${channel.name} بتاخد سعر ${channel.level}.` : ""}</p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-[13.5px]">
          <thead>
            <tr className="border-b border-line text-[12.5px] text-muted">
              <th className="p-2 text-start">الكود</th><th className="p-2 text-start">الصنف</th><th className="p-2 text-start">الفئة</th>
              {([1, 2, 3] as PriceLevel[]).map((l) => <th key={l} className={cn("p-2 text-start", channel?.level === l && "text-primary")}>سعر {l}{channels.filter((c) => c.level === l).length ? <span className="block text-[11px] font-normal">{channels.filter((c) => c.level === l).map((c) => c.name).join("، ")}</span> : null}</th>)}
              {channel ? <th className="p-2 text-start">في {channel.name}</th> : null}
            </tr>
          </thead>
          <tbody>
            {rows.map((i) => (
              <tr key={i.id} className="border-b border-line/60">
                <td className="num p-2 text-muted">{i.sku || "—"}</td>
                <td className="p-2 font-semibold">{i.name.ar}{i.name.en && i.name.en !== i.name.ar ? <span className="block text-[11.5px] font-medium text-muted" dir="ltr">{i.name.en}</span> : null}</td>
                <td className="p-2 text-muted">{catName(i.categoryId)}</td>
                {([1, 2, 3] as PriceLevel[]).map((l) => (
                  <td key={`${i.id}-${l}-${i[FIELD[l]] ?? ""}`} className="p-2">
                    {readOnly ? <span className="num">{pounds(i[FIELD[l]]) || "—"}</span> : (
                      <Input aria-label={`سعر ${l}`} wrapClassName="w-24" inputMode="decimal" dir="ltr" className={cn("num", channel?.level === l && "border-primary")} placeholder={l === 1 ? "0" : pounds(i.price)} defaultValue={pounds(i[FIELD[l]])} onBlur={(e) => void setPrice(i, l, e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()} />
                    )}
                  </td>
                ))}
                {channel ? <td className="num p-2 font-semibold">{pounds(Math.max(0, levelPrice(i, channel.level) - (i.discount ?? 0)))}</td> : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
