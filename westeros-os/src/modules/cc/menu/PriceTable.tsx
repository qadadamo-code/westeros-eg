/**
 * جدول الأسعار (Mohammed 2026-11-23): كل الأصناف في جدول واحد بفلتر الفئة وقناة البيع، وتعديل سريع لسعر 1 و2 و3.
 * كل قناة بيع (الحسابات > المبيعات) بتاخد واحد من التلاتة.
 * (2026-11-24) لكل صنف قنوات البيع المفعل فيها: الصنف المقفول على قناة بيختفي من الكاشير لما الطلب عليها.
 * وتصدير واستيراد اكسل بالكود (ربط الأعمدة، مراجعة، اعتماد)؛ الاستيراد بيعدل أصناف موجودة بس.
 */
import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { useDb, useLive } from "@/data/hooks";
import { channelsOf, levelPrice, soldOn, soldPatch, type PriceLevel, type SalesChannelDef } from "@/data/channels";
import type { MenuCategory, MenuItem } from "@/data/types";
import { inChunks } from "@/lib/batch";
import { cn } from "@/lib/cn";
import { major } from "@/lib/money";
import { Card, Input, Select, useToast } from "@/ui";
import { ExcelImport, type ImportField, type ImportPlan } from "../catalog/Import";
import { ExportButton } from "../ui";
import { sheetCode, sheetNumber } from "../xlsx";

const pounds = (u: number | null | undefined) => (u == null ? "" : String(u / major(1)));
const FIELD: Record<PriceLevel, "price" | "price2" | "price3"> = { 1: "price", 2: "price2", 3: "price3" };
const YES = ["نعم", "اه", "آه", "ايوه", "yes", "y", "1", "true", "✓", "مفعل"];
const NO = ["لا", "لأ", "no", "n", "0", "false", "مقفول", "غير مفعل"];

/** the patch a sheet row asks for: a blank cell leaves its field as it is */
export function rowPatch(i: MenuItem, r: Record<string, string>, channels: SalesChannelDef[]): Partial<MenuItem> {
  const p: Partial<MenuItem> = {};
  const has = (k: string) => (r[k] ?? "").trim() !== "";
  if (has("سعر 1")) {
    const v = major(sheetNumber(r["سعر 1"]));
    if (v > 0 && v !== i.price) p.price = v;
  }
  for (const l of [2, 3] as const) {
    const k = `سعر ${l}`;
    if (!has(k)) continue;
    const v = major(sheetNumber(r[k]));
    const next = v > 0 ? v : null;
    if (next !== (i[FIELD[l]] ?? null)) (p as Record<string, unknown>)[FIELD[l]] = next;
  }
  let cur: Pick<MenuItem, "offChannels" | "hiddenOn"> = { offChannels: i.offChannels ?? [], hiddenOn: i.hiddenOn ?? [] };
  let changed = false;
  for (const c of channels) {
    const t = (r[c.name] ?? "").trim().toLowerCase();
    const want = YES.includes(t) ? true : NO.includes(t) ? false : null;
    if (want == null || want === soldOn(cur, c)) continue;
    cur = soldPatch(cur, c, want);
    changed = true;
  }
  if (changed) Object.assign(p, cur);
  return p;
}

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
      .filter((i) => (!cat || i.categoryId === cat) && (!n || i.name.ar.toLowerCase().includes(n) || i.name.en.toLowerCase().includes(n) || (i.sku ?? "") === n))
      .sort((a, b) => (order.get(a.categoryId) ?? 0) - (order.get(b.categoryId) ?? 0) || a.sort - b.sort);
  }, [items, cats, cat, q]);
  const save = async (i: MenuItem, patch: Partial<MenuItem>) => {
    try {
      await db.update("menuItems", i.id, patch);
    } catch (e) {
      toast({ tone: "error", title: "تعذر الحفظ", description: String((e as Error)?.message ?? e) });
    }
  };
  const setPrice = async (i: MenuItem, level: PriceLevel, text: string) => {
    const t = text.trim();
    const v = t === "" ? null : major(Number(t.replace(/[^\d.]/g, "")) || 0);
    if (level === 1 && v == null) return;
    if (v === (i[FIELD[level]] ?? null)) return;
    await save(i, { [FIELD[level]]: v } as Partial<MenuItem>);
  };
  const catName = (id: string) => cats.find((c) => c.id === id)?.name.ar ?? "—";

  const head = ["الكود", "الصنف", "الفئة", "سعر 1", "سعر 2", "سعر 3", ...channels.map((c) => c.name)];
  const fields: ImportField[] = [
    { key: "الكود", aliases: ["كود", "code", "sku"] },
    { key: "سعر 1", aliases: ["السعر", "السعر 1", "السعر الأول", "price"] },
    { key: "سعر 2", aliases: ["السعر 2", "السعر التاني"] },
    { key: "سعر 3", aliases: ["السعر 3", "السعر التالت"] },
    ...channels.map((c) => ({ key: c.name })),
  ];
  const importRows = async (sheet: Record<string, string>[], dry: boolean): Promise<ImportPlan> => {
    const plan: ImportPlan = { added: [], updated: [], skipped: 0 };
    const bySku = new Map(items.filter((i) => i.sku).map((i) => [i.sku!, i]));
    const writes: { i: MenuItem; p: Partial<MenuItem> }[] = [];
    for (const r of sheet) {
      const i = bySku.get(sheetCode(r["الكود"]));
      if (!i) {
        plan.skipped++;
        continue;
      }
      const p = rowPatch(i, r, channels);
      if (!Object.keys(p).length) continue;
      plan.updated.push({ code: i.sku ?? "", name: i.name.ar });
      writes.push({ i, p });
    }
    if (!dry) await inChunks(writes, ({ i, p }) => db.update("menuItems", i.id, p));
    return plan;
  };

  return (
    <Card className="grid gap-3 p-3">
      <div className="flex flex-wrap items-end gap-2">
        <Input icon={<Search />} wrapClassName="w-56" placeholder="ابحث بالاسم أو الكود" value={q} onChange={(e) => setQ(e.target.value)} />
        <Select aria-label="الفئة" value={cat} onChange={(e) => setCat(e.target.value)} options={[{ value: "", label: "كل الفئات" }, ...cats.map((c) => ({ value: c.id, label: c.name.ar }))]} />
        <Select aria-label="قناة البيع" value={ch} onChange={(e) => setCh(e.target.value)} options={[{ value: "", label: "كل القنوات" }, ...channels.map((c) => ({ value: c.id, label: `${c.name} (سعر ${c.level})` }))]} />
        <span className="num text-[13px] text-muted">{rows.length} صنف</span>
        <div className="ms-auto flex flex-wrap gap-2">
          <ExportButton size="sm" file="جدول-الأسعار" head={head} rows={() => rows.map((i) => [i.sku ?? "", i.name.ar, catName(i.categoryId), i.price / major(1), i.price2 ? i.price2 / major(1) : "", i.price3 ? i.price3 / major(1) : "", ...channels.map((c) => (soldOn(i, c) ? "نعم" : "لا"))])} />
          {!readOnly ? <ExcelImport fields={fields} run={importRows} skipNote="من غير كود، أو كود مش موجود في المنيو (الاستيراد هنا بيعدل الأصناف الموجودة بس)." /> : null}
        </div>
      </div>
      <p className="text-[12.5px] text-muted">اكتب السعر واطلع من الخانة يتحفظ على طول. سعر 2 أو 3 فاضي = بياخد السعر الأول. علّم القنوات اللي الصنف بيتباع فيها: الصنف المقفول على قناة مش هيظهر في الكاشير لما الطلب عليها. {channel ? `قناة ${channel.name} بتاخد سعر ${channel.level}.` : ""}</p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-[13.5px]">
          <thead>
            <tr className="border-b border-line text-[12.5px] text-muted">
              <th className="p-2 text-start">الكود</th><th className="p-2 text-start">الصنف</th><th className="p-2 text-start">الفئة</th>
              {([1, 2, 3] as PriceLevel[]).map((l) => <th key={l} className={cn("p-2 text-start", channel?.level === l && "text-primary")}>سعر {l}{channels.filter((c) => c.level === l).length ? <span className="block text-[11px] font-normal">{channels.filter((c) => c.level === l).map((c) => c.name).join("، ")}</span> : null}</th>)}
              {channel ? <th className="p-2 text-start">في {channel.name}</th> : null}
              {channels.map((c) => <th key={c.id} className={cn("p-2 text-center", channel?.id === c.id && "text-primary")}>{c.name}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((i) => {
              const offHere = channel && !soldOn(i, channel);
              return (
                <tr key={i.id} className={cn("border-b border-line/60", offHere && "opacity-50")}>
                  <td className="num p-2 text-muted">{i.sku || "—"}</td>
                  <td className="p-2 font-semibold">{i.name.ar}{i.discount && i.price ? <span className="num ms-1.5 rounded-full bg-danger px-1.5 py-0.5 text-[11px] font-bold text-white" dir="ltr">{Math.round((i.discount / i.price) * 1000) / 10}%</span> : null}{i.name.en && i.name.en !== i.name.ar ? <span className="block text-[11.5px] font-medium text-muted" dir="ltr">{i.name.en}</span> : null}</td>
                  <td className="p-2 text-muted">{catName(i.categoryId)}</td>
                  {([1, 2, 3] as PriceLevel[]).map((l) => (
                    <td key={`${i.id}-${l}-${i[FIELD[l]] ?? ""}`} className="p-2">
                      {readOnly ? <span className="num">{pounds(i[FIELD[l]]) || "—"}</span> : (
                        <Input aria-label={`سعر ${l}`} wrapClassName="w-24" inputMode="decimal" dir="ltr" className={cn("num", channel?.level === l && "border-primary")} placeholder={l === 1 ? "0" : pounds(i.price)} defaultValue={pounds(i[FIELD[l]])} onBlur={(e) => void setPrice(i, l, e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()} />
                      )}
                    </td>
                  ))}
                  {channel ? <td className="num p-2 font-semibold">{offHere ? <span className="text-muted">مقفول</span> : pounds(Math.max(0, levelPrice(i, channel.level) - (i.discount ?? 0)))}</td> : null}
                  {channels.map((c) => {
                    const on = soldOn(i, c);
                    return (
                      <td key={c.id} className="p-2 text-center">
                        <input type="checkbox" aria-label={`${i.name.ar} في ${c.name}`} className="size-5 accent-[var(--sf-primary)]" checked={on} disabled={readOnly} onChange={() => void save(i, soldPatch(i, c, !on))} />
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
