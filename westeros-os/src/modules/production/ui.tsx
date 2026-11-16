/** Shared pieces of the manufacturing screens: number entry, ingredient picker, recipe lines, the live result panel. */
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AlertTriangle, Plus, Search, Trash2 } from "lucide-react";
import type { MfgBatchOutput, MfgRecipeLine, StockItem } from "@/data/types";
import { useT } from "@/i18n/i18n";
import { cn } from "@/lib/cn";
import { formatMoney, moneyHidden, type Units } from "@/lib/money";
import { BASE_NAME } from "@/modules/inventory/units";
import { Badge, Card, IconButton, Money } from "@/ui";
import type { BuildError, BuiltBatch } from "./build";

const AR_DIGITS = "٠١٢٣٤٥٦٧٨٩";
/** "١٢٫٥" / "12,5" / "12.5" → 12.5 */
export function parseNum(s: string): number {
  const n = Number(s.replace(/[٠-٩]/g, (d) => String(AR_DIGITS.indexOf(d))).replace(/[٫,]/g, ".").trim());
  return Number.isFinite(n) && n > 0 ? n : 0;
}
export const r3 = (n: number) => Math.round(n * 1000) / 1000;

/** Number field that stays empty instead of showing 0 — a chef types into it with wet hands, nothing to clear first. */
export function Num({ value, onChange, label, suffix, hint, className, autoFocus, big }: { value: number; onChange: (n: number) => void; label?: ReactNode; suffix?: ReactNode; hint?: ReactNode; className?: string; autoFocus?: boolean; big?: boolean }) {
  const [text, setText] = useState(() => (value ? String(r3(value)) : ""));
  const last = useRef(value);
  if (last.current !== value) {
    last.current = value;
    if (r3(parseNum(text)) !== r3(value)) setText(value ? String(r3(value)) : "");
  }
  // inside a dialog the focus trap runs after mount, so take the focus once it has settled
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!autoFocus) return;
    const t = setTimeout(() => input.current?.focus(), 80);
    return () => clearTimeout(t);
  }, [autoFocus]);
  return (
    <label className={cn("grid gap-1.5", className)}>
      {label ? <span className="text-[13px] font-semibold text-ink-2">{label}</span> : null}
      <span className={cn("flex overflow-hidden rounded-xl border border-line bg-surface transition-[border-color,box-shadow] focus-within:border-primary focus-within:shadow-[var(--sf-glow)]", big ? "h-13" : "h-11")}>
        <input
          ref={input}
          autoFocus={autoFocus}
          inputMode="decimal"
          className={cn("num w-0 min-w-12 flex-1 bg-transparent px-3 outline-none", big ? "text-[19px] font-bold" : "text-[15px]")}
          value={text}
          placeholder="0"
          onChange={(e) => {
            setText(e.target.value);
            const n = parseNum(e.target.value);
            last.current = n;
            onChange(n);
          }}
        />
        {suffix ? <span className="grid shrink-0 place-items-center border-s border-line bg-surface-2 px-2.5 text-[12.5px] font-semibold text-muted">{suffix}</span> : null}
      </span>
      {hint ? <span className="text-[12px] text-muted">{hint}</span> : null}
    </label>
  );
}

const norm = (s: string) => s.toLowerCase().replace(/[أإآ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي").trim();

/** Search box over the stock items (raw materials and the manufactured ones). */
export function ItemPicker({ items, onPick, placeholder, exclude }: { items: StockItem[]; onPick: (item: StockItem) => void; placeholder?: string; exclude?: Set<string> }) {
  const { L, loc } = useT();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const found = useMemo(() => {
    const n = norm(q);
    return items
      .filter((i) => i.active && !exclude?.has(i.id) && (!n || norm(i.name.ar).includes(n) || norm(i.name.en).includes(n) || i.sku.toLowerCase().includes(n)))
      .slice(0, 40);
  }, [items, q, exclude]);
  return (
    <div className="relative">
      <span className="flex h-11 items-center gap-2 rounded-xl border border-dashed border-line-strong bg-surface-2 px-3 focus-within:border-primary focus-within:bg-surface">
        <Search className="size-4 shrink-0 text-muted" aria-hidden />
        <input
          className="w-0 flex-1 bg-transparent text-[14.5px] outline-none placeholder:text-faint"
          value={q}
          placeholder={placeholder ?? L("أضف مكون: اكتب الاسم أو الكود", "Add an ingredient: name or code")}
          onChange={(e) => (setQ(e.target.value), setOpen(true))}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && found[0]) (e.preventDefault(), onPick(found[0]), setQ(""));
            if (e.key === "Escape") setOpen(false);
          }}
        />
        <Plus className="size-4 shrink-0 text-muted" aria-hidden />
      </span>
      {open ? (
        <ul className="absolute inset-x-0 top-12 z-20 max-h-64 overflow-y-auto rounded-xl border border-line bg-surface p-1 shadow-sf-lg thin-scrollbar">
          {found.length ? (
            found.map((i) => (
              <li key={i.id}>
                <button type="button" className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-start text-[14px] hover:bg-surface-2" onMouseDown={(e) => (e.preventDefault(), onPick(i), setQ(""))}>
                  <span className="min-w-0 flex-1 truncate">{loc(i.name)}</span>
                  {i.kind === "prep" ? <Badge tone="brass" size="sm">{L("مصنّع", "Made here")}</Badge> : null}
                  <span className="num text-[12px] text-faint">{i.sku}</span>
                </button>
              </li>
            ))
          ) : (
            <li className="px-3 py-3 text-[13.5px] text-muted">{L("لا يوجد صنف بهذا الاسم", "No item matches")}</li>
          )}
        </ul>
      ) : null}
    </div>
  );
}

/**
 * Recipe lines. `lines` hold the quantity for ONE unit (a meal, or a kilo of net meat); `by` is what the batch
 * multiplies them with, so the chef sees and edits the real quantities of this batch.
 */
export function LinesEditor({ title, hint, lines, onChange, by = 1, items, itemById, unitCost, readOnly }: {
  title: ReactNode; hint?: ReactNode; lines: MfgRecipeLine[]; onChange: (l: MfgRecipeLine[]) => void; by?: number; items: StockItem[]; itemById: Map<string, StockItem>; unitCost: (id: string) => Units; readOnly?: boolean;
}) {
  const { L, lang, loc } = useT();
  const k = by > 0 ? by : 1;
  const used = useMemo(() => new Set(lines.map((l) => l.itemId)), [lines]);
  const total = lines.reduce((a, l) => a + Math.round(l.qty * k * unitCost(l.itemId)), 0);
  const noPrices = moneyHidden();
  return (
    <div className="grid gap-2">
      <div className="flex items-baseline gap-2">
        <h4 className="font-sans text-[14px] font-bold">{title}</h4>
        {hint ? <span className="text-[12.5px] text-muted">{hint}</span> : null}
        {lines.length && !noPrices ? <span className="num ms-auto text-[13px] font-semibold text-ink-2">{formatMoney(total, { lang })}</span> : null}
      </div>
      {lines.length ? (
        <ul className="grid gap-1.5">
          {lines.map((l, i) => {
            const it = itemById.get(l.itemId);
            const price = unitCost(l.itemId);
            return (
              <li key={l.itemId} className="flex items-center gap-2 rounded-xl border border-line bg-surface px-2.5 py-1.5">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-semibold">{it ? loc(it.name) : "—"}</span>
                  {noPrices ? null : (
                    <span className={cn("num block text-[12px]", price > 0 ? "text-muted" : "text-warn")}>
                      {price > 0 ? formatMoney(Math.round(l.qty * k * price), { lang }) : L("بدون سعر", "No price yet")}
                    </span>
                  )}
                </span>
                {readOnly ? (
                  <span className="num text-[14px] font-semibold">{r3(l.qty * k)} {it ? BASE_NAME[it.baseUnit][lang] : ""}</span>
                ) : (
                  <Num className="w-32" value={r3(l.qty * k)} suffix={it ? BASE_NAME[it.baseUnit][lang] : ""} onChange={(v) => onChange(lines.map((x, j) => (j === i ? { ...x, qty: v / k } : x)))} />
                )}
                {readOnly ? null : (
                  <IconButton label={L("حذف", "Remove")} size="sm" onClick={() => onChange(lines.filter((_, j) => j !== i))}>
                    <Trash2 />
                  </IconButton>
                )}
              </li>
            );
          })}
        </ul>
      ) : readOnly ? (
        <p className="rounded-xl border border-dashed border-line px-3 py-3 text-[13.5px] text-muted">{L("لا توجد مكونات", "No ingredients")}</p>
      ) : null}
      {readOnly ? null : <ItemPicker items={items} exclude={used} onPick={(it) => onChange([...lines, { itemId: it.id, qty: 0 }])} />}
    </div>
  );
}

export const ERROR_TEXT: Record<BuildError, { ar: string; en: string }> = {
  product: { ar: "اختر المنتج", en: "Choose the product" },
  meals: { ar: "اكتب عدد الوجبات", en: "Enter the number of meals" },
  net: { ar: "اكتب الوزن الصافي بعد التجهيز", en: "Enter the net weight" },
  count: { ar: "اكتب العدد الناتج", en: "Enter the count produced" },
  portion: { ar: "وزن الحصة غير محدد للمنتج (من صفحة المنتجات)", en: "The product has no portion weight (set it in Products)" },
  chicken: { ar: "اكتب وزن الدجاج", en: "Enter the chicken weight" },
  outputs: { ar: "أضف منتج واحد على الأقل", en: "Add at least one product" },
  meat: { ar: "اكتب وزن اللحم", en: "Enter the meat weight" },
  meatType: { ar: "اختر نوع اللحم", en: "Choose the meat cut" },
  fat: { ar: "اكتب وزن الدهن", en: "Enter the fat weight" },
  chickenItem: { ar: "خامة صدور الدجاج غير محددة في الثوابت", en: "Chicken raw material is not set in Constants" },
  fatItem: { ar: "الدهن في برجر اللحم غير محدد في الثوابت", en: "Fat item is not set in Constants" },
  minceItem: { ar: "خامة دجاج الفرم غير محددة في الثوابت", en: "Minced chicken item is not set in Constants" },
  overweight: { ar: "الوزن الناتج أكبر من وزن الخامة", en: "Output weighs more than the raw material" },
};

export const fmtKg = (kg: number | null | undefined, lang: "ar" | "en") => `${r3(kg ?? 0)} ${lang === "ar" ? "كجم" : "kg"}`;
export const fmtG = (g: number | null | undefined, lang: "ar" | "en") => `${Math.round((g ?? 0) * 10) / 10} ${lang === "ar" ? "جم" : "g"}`;
export const fmtPct = (bp: number | null | undefined) => `${Math.round((bp ?? 0) / 10) / 10}%`;
export const fmtDate = (iso: string, lang: "ar" | "en") => new Date(iso).toLocaleDateString(lang === "ar" ? "ar-EG-u-nu-latn" : "en-GB", { timeZone: "Africa/Cairo", day: "2-digit", month: "2-digit", year: "numeric" });
export const fmtDateTime = (iso: string, lang: "ar" | "en") =>
  new Date(iso).toLocaleString(lang === "ar" ? "ar-EG-u-nu-latn" : "en-GB", { timeZone: "Africa/Cairo", day: "2-digit", month: "2-digit", year: "numeric", hour: "numeric", minute: "2-digit" });
export const outQtyText = (o: Pick<MfgBatchOutput, "unit" | "weightKg" | "count">, lang: "ar" | "en") =>
  o.unit === "pc" ? `${o.count ?? 0} ${lang === "ar" ? "قطعة" : "pcs"}${o.weightKg ? ` · ${fmtKg(o.weightKg, lang)}` : ""}` : fmtKg(o.weightKg, lang);

/** how close a product is to its expiry */
export function expiryTone(expiresAt: string, now = Date.now()): "danger" | "warn" | "ok" {
  const left = Date.parse(expiresAt) - now;
  return left <= 0 ? "danger" : left <= 86_400_000 ? "warn" : "ok";
}
export function ExpiryBadge({ expiresAt }: { expiresAt: string }) {
  const { L, lang } = useT();
  const tone = expiryTone(expiresAt);
  const days = Math.ceil((Date.parse(expiresAt) - Date.now()) / 86_400_000);
  return (
    <Badge tone={tone} size="sm" dot>
      {tone === "danger" ? L("منتهي", "Expired") : tone === "warn" ? L("ينتهي اليوم", "Expires today") : L(`باقي ${days} يوم`, `${days}d left`)}
      <span className="num ms-1 opacity-70">{fmtDate(expiresAt, lang)}</span>
    </Badge>
  );
}

function Row({ label, value, strong, tone }: { label: ReactNode; value: ReactNode; strong?: boolean; tone?: "warn" | "danger" }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5">
      <span className="text-[13.5px] text-muted">{label}</span>
      <span className={cn("num text-[14.5px]", strong ? "text-[17px] font-bold text-ink" : "font-semibold text-ink-2", tone === "warn" && "text-warn", tone === "danger" && "text-danger")}>{value}</span>
    </div>
  );
}

/** The figures of the Cost Control document for the batch being typed — updates on every keystroke. */
export function ResultPanel({ built, footer }: { built: BuiltBatch; footer?: ReactNode }) {
  const { L, lang, loc } = useT();
  const noPrices = moneyHidden();
  const any = built.totalCost > 0 || built.outputs.some((o) => (o.weightKg ?? 0) > 0 || (o.count ?? 0) > 0);
  return (
    <Card className="overflow-hidden">
      {noPrices ? (
        <div className="bg-primary px-5 py-3 text-[14px] font-bold text-primary-ink">{L("ناتج التشغيلة", "Batch output")}</div>
      ) : (
        <div className="bg-primary px-5 py-4 text-primary-ink">
          <div className="text-[12.5px] font-semibold opacity-80">{L("تكلفة التشغيلة", "Batch cost")}</div>
          <div className="num mt-0.5 text-[30px] leading-none font-bold">
            <Money value={built.totalCost} />
          </div>
        </div>
      )}
      <div className="grid gap-1 px-5 py-3">
        {built.outputs.map((o, i) => (
          <div key={i} className="rounded-xl bg-surface-2 px-3 py-2">
            <div className="flex items-baseline justify-between gap-2">
              <span className="truncate text-[14px] font-bold">{loc(o.name)}</span>
              <span className="num text-[13px] text-muted">{outQtyText(o, lang)}</span>
            </div>
            {noPrices ? null : (
              <div className="mt-0.5 flex items-baseline justify-between gap-2">
                <span className="text-[12.5px] text-muted">{o.unit === "kg" ? L("سعر الكيلو", "Price per kg") : L("سعر القطعة", "Price per piece")}</span>
                <span className="num text-[16px] font-bold text-brass-text">{formatMoney(o.unitCost, { lang })}</span>
              </div>
            )}
            {o.scaleDiffG ? <div className="num mt-0.5 text-[12px] text-muted">{L("فرق الميزان", "Scale difference")}: {fmtG(o.scaleDiffG, lang)}</div> : null}
          </div>
        ))}
        <div className="mt-1 divide-y divide-line">
          {built.grossWeightKg != null ? <Row label={L("الوزن الإجمالي للمكونات", "Gross weight of ingredients")} value={fmtKg(built.grossWeightKg, lang)} /> : null}
          {built.mainWeightKg != null && built.method !== "weight" && built.method !== "portion" ? <Row label={L("وزن الخامة الرئيسية", "Main raw weight")} value={fmtKg(built.mainWeightKg, lang)} /> : null}
          {built.netWeightKg != null ? <Row label={L("الوزن الصافي", "Net weight")} value={fmtKg(built.netWeightKg, lang)} /> : null}
          {built.expectedCount != null ? <Row label={L("العدد المتوقع", "Expected count")} value={built.expectedCount} /> : null}
          {built.waste != null ? (
            <Row label={L("الهدر", "Waste")} value={built.method === "portion" ? `${built.waste} ${L("قطعة", "pcs")}` : fmtG(built.waste, lang)} tone={built.waste > 0 ? "danger" : built.waste < 0 ? "warn" : undefined} />
          ) : null}
          {built.debrisKg != null ? <Row label={L("الدوبريه", "Trimmings")} value={`${fmtKg(built.debrisKg, lang)} · ${fmtPct(built.debrisBp)}`} tone={built.debrisKg < 0 ? "danger" : undefined} /> : null}
          {built.suggestedFatKg != null ? <Row label={L("وزن الدهن المقترح", "Suggested fat")} value={fmtKg(built.suggestedFatKg, lang)} /> : null}
          {built.scaleDiffG != null ? <Row label={L("هدر الميزان", "Scale difference")} value={fmtG(built.scaleDiffG, lang)} /> : null}
        </div>
        {built.unpriced.length && !noPrices ? (
          <div className="mt-2 flex gap-2 rounded-xl bg-warn-soft px-3 py-2 text-[12.5px] text-ink-2">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warn" aria-hidden />
            <span>
              {L("مكونات بدون سعر شراء، فالتكلفة أقل من الحقيقية: ", "Ingredients without a purchase price, so the cost is understated: ")}
              {built.unpriced.map((n) => loc(n)).join("، ")}
            </span>
          </div>
        ) : null}
        {any && built.errors.length ? (
          <ul className="mt-2 grid gap-1 text-[13px] text-danger">
            {built.errors.map((e) => (
              <li key={e}>• {ERROR_TEXT[e][lang]}</li>
            ))}
          </ul>
        ) : null}
      </div>
      {footer ? <div className="border-t border-line px-5 py-4">{footer}</div> : null}
    </Card>
  );
}
