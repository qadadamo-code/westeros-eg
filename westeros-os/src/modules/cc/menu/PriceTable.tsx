/**
 * عرض في قائمة (Saqr 2026-11-28): المنيو كله في جدول واحد، بتختار الأعمدة اللي تظهر، وزرار «تعديل مباشر» بيفتح تعديل كل
 * البيانات الظاهرة في الجدول نفسه (كل خانة بتتحفظ أول ما تطلع منها). كان اسمه جدول الأسعار:
 * جدول الأسعار (Mohammed 2026-11-23): كل الأصناف في جدول واحد بفلتر الفئة وقناة البيع، وتعديل سريع لسعر 1 و2 و3.
 * كل قناة بيع (الحسابات > المبيعات) بتاخد واحد من التلاتة.
 * (2026-11-24) لكل صنف قنوات البيع المفعل فيها: الصنف المقفول على قناة بيختفي من الكاشير لما الطلب عليها.
 * وتصدير واستيراد اكسل بالكود (ربط الأعمدة، مراجعة، اعتماد)؛ الاستيراد بيعدل أصناف موجودة بس.
 */
import { useMemo, useState } from "react";
import { Columns3, PencilLine, Search } from "lucide-react";
import { useDb, useLive } from "@/data/hooks";
import { channelsOf, levelPrice, soldOn, soldPatch, type PriceLevel, type SalesChannelDef } from "@/data/channels";
import type { MenuCategory, MenuItem } from "@/data/types";
import { inChunks } from "@/lib/batch";
import { cn } from "@/lib/cn";
import { major } from "@/lib/money";
import { Button, Card, Input, Select, useToast } from "@/ui";
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

type Col = { key: string; label: string; sub?: string; def: boolean; center?: boolean };
const COLS_KEY = "menu-list-cols";
const BASE_COLS: Col[] = [
  { key: "sku", label: "الكود", def: true },
  { key: "image", label: "الصورة", def: false },
  { key: "nameAr", label: "الاسم", def: true },
  { key: "nameEn", label: "الاسم بالإنجليزي", def: false },
  { key: "cat", label: "الفئة", def: true },
  { key: "p1", label: "سعر 1", def: true },
  { key: "p2", label: "سعر 2", def: true },
  { key: "p3", label: "سعر 3", def: true },
  { key: "disc", label: "الخصم %", def: true },
  { key: "final", label: "بعد الخصم", def: false },
  { key: "desc", label: "الوصف", def: false },
  { key: "prep", label: "وقت التحضير", def: false },
  { key: "kcal", label: "السعرات", def: false },
  { key: "active", label: "ظاهر", def: true, center: true },
  { key: "available", label: "متاح", def: false, center: true },
  { key: "rec", label: "مميز", def: true, center: true },
];
const readCols = (): string[] | null => {
  try {
    const v = JSON.parse(localStorage.getItem(COLS_KEY) ?? "null");
    return Array.isArray(v) ? v : null;
  } catch {
    return null;
  }
};
const numIn = (t: string) => Number(t.replace(",", ".").replace(/[^\d.]/g, "")) || 0;

export function PriceTable({ items, cats, readOnly }: { items: MenuItem[]; cats: MenuCategory[]; readOnly: boolean }) {
  const db = useDb();
  const { toast } = useToast();
  const settings = useLive("settings").data[0];
  const channels = channelsOf(settings);
  const [cat, setCat] = useState("");
  const [ch, setCh] = useState("");
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState(false);
  const [picking, setPicking] = useState(false);
  const allCols: Col[] = [...BASE_COLS, ...channels.map((c) => ({ key: `ch:${c.id}`, label: c.name, sub: "قناة بيع", def: true, center: true }))];
  const [shown, setShown] = useState<string[]>(() => readCols() ?? allCols.filter((c) => c.def).map((c) => c.key));
  // a channel added after the columns were saved shows up by itself, unless it was hidden
  const cols = allCols.filter((c) => shown.includes(c.key) || (c.def && c.key.startsWith("ch:") && !shown.includes(`-${c.key}`)));
  const toggleCol = (key: string) => {
    const on = cols.some((c) => c.key === key);
    const next = on ? [...shown.filter((k) => k !== key), `-${key}`] : [...shown.filter((k) => k !== `-${key}`), key];
    setShown(next);
    try {
      localStorage.setItem(COLS_KEY, JSON.stringify(next));
    } catch {
      /* per-viewer convenience only */
    }
  };
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
    const v = t === "" ? null : major(numIn(t));
    if (level === 1 && !v) return;
    if (v === (i[FIELD[level]] ?? null)) return;
    const patch = { [FIELD[level]]: v } as Partial<MenuItem>;
    // the discount stays the same percent when the first price changes
    if (level === 1 && v && i.discount && i.price) patch.discount = Math.round((v * i.discount) / i.price);
    await save(i, patch);
  };
  const setText = (i: MenuItem, key: "nameAr" | "nameEn" | "desc", el: HTMLInputElement) => {
    const v = el.value.trim();
    if (key === "nameAr") {
      if (!v) return void (el.value = i.name.ar);
      if (v !== i.name.ar) void save(i, { name: { ar: v, en: i.name.en === i.name.ar ? v : i.name.en } });
    } else if (key === "nameEn") {
      if (v !== i.name.en) void save(i, { name: { ar: i.name.ar, en: v || i.name.ar } });
    } else if (v !== i.description.ar) void save(i, { description: { ar: v, en: i.description.en } });
  };
  const setSku = (i: MenuItem, el: HTMLInputElement) => {
    const v = el.value.trim();
    if (v === (i.sku ?? "")) return;
    if (v && items.some((x) => x.id !== i.id && x.sku === v)) {
      toast({ tone: "error", title: `الكود ${v} مستخدم لصنف تاني` });
      el.value = i.sku ?? "";
      return;
    }
    void save(i, { sku: v || null });
  };
  const pct = (i: MenuItem) => (i.price && i.discount ? Math.round((i.discount / i.price) * 1000) / 10 : 0);
  const catName = (id: string) => cats.find((c) => c.id === id)?.name.ar ?? "—";
  const edit = editing && !readOnly;
  const enter = (e: React.KeyboardEvent<HTMLInputElement>) => e.key === "Enter" && (e.target as HTMLInputElement).blur();

  const cell = (i: MenuItem, c: Col) => {
    const k = c.key;
    if (k.startsWith("ch:")) {
      const chan = channels.find((x) => `ch:${x.id}` === k);
      if (!chan) return null;
      const on = soldOn(i, chan);
      return <input type="checkbox" aria-label={`${i.name.ar} في ${chan.name}`} className="size-5 accent-[var(--sf-primary)]" checked={on} disabled={!edit} onChange={() => void save(i, soldPatch(i, chan, !on))} />;
    }
    const box = (on: boolean, label: string, p: Partial<MenuItem>) => <input type="checkbox" aria-label={`${i.name.ar}: ${label}`} className="size-5 accent-[var(--sf-primary)]" checked={on} disabled={!edit} onChange={() => void save(i, p)} />;
    const txt = (val: string, key: "nameAr" | "nameEn" | "desc", w: string, ltr?: boolean) =>
      edit ? <Input key={val} aria-label={c.label} wrapClassName={w} dir={ltr ? "ltr" : undefined} defaultValue={val} onBlur={(e) => setText(i, key, e.target)} onKeyDown={enter} /> : <span className={cn(key === "nameAr" && "font-semibold", key === "desc" && "line-clamp-2 max-w-[260px] text-muted")} dir={ltr ? "ltr" : undefined}>{val || "—"}</span>;
    const numBox = (val: string, w: string, onSave: (t: string) => void, ph?: string) =>
      edit ? <Input key={val} aria-label={c.label} wrapClassName={w} inputMode="decimal" dir="ltr" className="num" placeholder={ph} defaultValue={val} onBlur={(e) => onSave(e.target.value)} onKeyDown={enter} /> : <span className="num">{val || "—"}</span>;
    switch (k) {
      case "sku": return edit ? <Input key={i.sku ?? ""} aria-label="الكود" wrapClassName="w-20" inputMode="numeric" dir="ltr" className="num" defaultValue={i.sku ?? ""} onBlur={(e) => setSku(i, e.target)} onKeyDown={enter} /> : <span className="num text-muted">{i.sku || "—"}</span>;
      case "image": return i.imageUrl ? <img src={i.imageUrl} alt="" loading="lazy" className="size-10 rounded-lg object-cover" /> : <span className="block size-10 rounded-lg bg-surface-3" />;
      case "nameAr": return txt(i.name.ar, "nameAr", "w-48");
      case "nameEn": return txt(i.name.en === i.name.ar ? "" : i.name.en, "nameEn", "w-44", true);
      case "desc": return txt(i.description.ar, "desc", "w-64");
      case "cat": return edit ? <div className="w-40"><Select aria-label="الفئة" value={i.categoryId} onChange={(e) => void save(i, { categoryId: e.target.value })} options={cats.map((x) => ({ value: x.id, label: x.name.ar }))} /></div> : <span className="text-muted">{catName(i.categoryId)}</span>;
      case "p1": case "p2": case "p3": {
        const l = Number(k[1]) as PriceLevel;
        return numBox(pounds(i[FIELD[l]]), "w-24", (t) => void setPrice(i, l, t), l === 1 ? "0" : pounds(i.price));
      }
      case "disc": return numBox(pct(i) ? String(pct(i)) : "", "w-20", (t) => { const p = Math.min(100, numIn(t)); const d = Math.round((i.price * p) / 100); if (d !== (i.discount ?? 0)) void save(i, { discount: d }); }, "0");
      case "final": return <span className="num font-semibold">{pounds(Math.max(0, i.price - (i.discount ?? 0)))}</span>;
      case "prep": return numBox(String(i.prepMinutes ?? ""), "w-20", (t) => { const n = Math.round(numIn(t)); if (n !== i.prepMinutes) void save(i, { prepMinutes: n }); });
      case "kcal": return numBox(i.calories ? String(i.calories) : "", "w-20", (t) => { const n = t.trim() ? Math.round(numIn(t)) : null; if (n !== (i.calories ?? null)) void save(i, { calories: n }); });
      case "active": return box(i.active, "ظاهر", { active: !i.active });
      case "available": return box(i.available, "متاح", { available: !i.available });
      case "rec": return box(!!i.recommended, "مميز", { recommended: !i.recommended });
      default: return null;
    }
  };
  const exportCell = (i: MenuItem, k: string): string | number => {
    if (k.startsWith("ch:")) { const chan = channels.find((x) => `ch:${x.id}` === k); return chan && soldOn(i, chan) ? "نعم" : "لا"; }
    switch (k) {
      case "sku": return i.sku ?? "";
      case "nameAr": return i.name.ar;
      case "nameEn": return i.name.en;
      case "cat": return catName(i.categoryId);
      case "p1": return i.price / major(1);
      case "p2": return i.price2 ? i.price2 / major(1) : "";
      case "p3": return i.price3 ? i.price3 / major(1) : "";
      case "disc": return pct(i);
      case "final": return Math.max(0, i.price - (i.discount ?? 0)) / major(1);
      case "desc": return i.description.ar;
      case "prep": return i.prepMinutes ?? "";
      case "kcal": return i.calories ?? "";
      case "active": return i.active ? "نعم" : "لا";
      case "available": return i.available ? "نعم" : "لا";
      case "rec": return i.recommended ? "نعم" : "لا";
      default: return "";
    }
  };
  const exportCols = cols.filter((c) => c.key !== "image");

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
    <Card className="grid gap-3 p-3" data-menu-list>
      <div className="flex flex-wrap items-end gap-2">
        <Input icon={<Search />} wrapClassName="w-56" placeholder="ابحث بالاسم أو الكود" value={q} onChange={(e) => setQ(e.target.value)} />
        <Select aria-label="الفئة" value={cat} onChange={(e) => setCat(e.target.value)} options={[{ value: "", label: "كل الفئات" }, ...cats.map((c) => ({ value: c.id, label: c.name.ar }))]} />
        <Select aria-label="قناة البيع" value={ch} onChange={(e) => setCh(e.target.value)} options={[{ value: "", label: "كل القنوات" }, ...channels.map((c) => ({ value: c.id, label: `${c.name} (سعر ${c.level})` }))]} />
        <span className="num text-[13px] text-muted">{rows.length} صنف</span>
        <div className="ms-auto flex flex-wrap gap-2">
          <Button size="sm" variant={picking ? "soft" : "outline"} icon={<Columns3 />} onClick={() => setPicking((v) => !v)}>الأعمدة</Button>
          {!readOnly ? <Button size="sm" variant={editing ? "brass" : "outline"} icon={<PencilLine />} onClick={() => setEditing((v) => !v)}>{editing ? "إنهاء التعديل" : "تعديل مباشر"}</Button> : null}
          <ExportButton size="sm" file="المنيو" head={exportCols.map((c) => c.label)} rows={() => rows.map((i) => exportCols.map((c) => exportCell(i, c.key)))} />
          {!readOnly ? <ExcelImport fields={fields} run={importRows} skipNote="من غير كود، أو كود مش موجود في المنيو (الاستيراد هنا بيعدل الأصناف الموجودة بس)." /> : null}
        </div>
      </div>
      {picking ? (
        <div className="flex flex-wrap gap-1.5 rounded-xl border border-line bg-surface-2 p-2.5" data-col-picker>
          <span className="w-full text-[12.5px] font-semibold text-muted">اختار الأعمدة اللي تظهر في القائمة:</span>
          {allCols.map((c) => {
            const on = cols.some((x) => x.key === c.key);
            return (
              <label key={c.key} className={cn("inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1 text-[13px] font-semibold", on ? "border-primary bg-primary-soft" : "border-line bg-surface")}>
                <input type="checkbox" className="size-4 accent-[var(--sf-primary)]" checked={on} onChange={() => toggleCol(c.key)} />
                {c.label}{c.sub ? <span className="text-[11px] font-normal text-muted">{c.sub}</span> : null}
              </label>
            );
          })}
        </div>
      ) : null}
      <p className="text-[12.5px] text-muted">
        {edit ? "التعديل المباشر شغال: عدّل أي خانة واطلع منها تتحفظ على طول." : readOnly ? "للمشاهدة بس." : "دوس «تعديل مباشر» علشان تعدل كل البيانات الظاهرة في الجدول."}
        {" "}سعر 2 أو 3 فاضي = بياخد السعر الأول. الصنف المقفول على قناة مش هيظهر في الكاشير لما الطلب عليها. {channel ? `قناة ${channel.name} بتاخد سعر ${channel.level}.` : ""}
      </p>
      <div className="max-h-[70vh] overflow-auto">
        <table className="w-full text-[13.5px]">
          <thead className="sticky top-0 z-10 bg-surface">
            <tr className="border-b border-line text-[12.5px] text-muted">
              {cols.map((c) => {
                const lvl = c.key === "p1" ? 1 : c.key === "p2" ? 2 : c.key === "p3" ? 3 : 0;
                const on = lvl ? channel?.level === lvl : channel && c.key === `ch:${channel.id}`;
                return (
                  <th key={c.key} className={cn("whitespace-nowrap p-2", c.center ? "text-center" : "text-start", on && "text-primary")}>
                    {c.label}
                    {lvl && channels.some((x) => x.level === lvl) ? <span className="block text-[11px] font-normal">{channels.filter((x) => x.level === lvl).map((x) => x.name).join("، ")}</span> : null}
                  </th>
                );
              })}
              {channel ? <th className="whitespace-nowrap p-2 text-start text-primary">في {channel.name}</th> : null}
            </tr>
          </thead>
          <tbody>
            {rows.map((i) => {
              const offHere = channel && !soldOn(i, channel);
              return (
                <tr key={i.id} className={cn("border-b border-line/60", offHere && "opacity-50")}>
                  {cols.map((c) => <td key={c.key} className={cn("p-2 align-middle", c.center && "text-center")}>{cell(i, c)}</td>)}
                  {channel ? <td className="num p-2 font-semibold">{offHere ? <span className="text-muted">مقفول</span> : pounds(Math.max(0, levelPrice(i, channel.level) - (i.discount ?? 0)))}</td> : null}
                </tr>
              );
            })}
          </tbody>
        </table>
        {!rows.length ? <p className="p-6 text-center text-[13.5px] text-muted">مافيش أصناف هنا</p> : null}
      </div>
    </Card>
  );
}
