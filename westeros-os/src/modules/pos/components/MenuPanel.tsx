/** Category rail + search + item grid. Tap = add (or open modifiers), long-press/right-click = always open the sheet. */
import { forwardRef, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Ban, Leaf, Percent, Search, Sparkles, Star, X, TrendingUp } from "lucide-react";
import type { Fame } from "@/modules/menu/sold";
import type { MenuCategory, MenuItem } from "@/data/types";
import { useT } from "@/i18n/i18n";
import { matches } from "@/lib/arabic";
import { cn } from "@/lib/cn";
import { formatMoney } from "@/lib/money";
import { spring, useReduced } from "@/ui";
import { menuPhoto } from "@/data/westeros/menuImages";
import { catIcon, Chip } from "./bits";

export interface MenuPanelProps {
  cats: MenuCategory[];
  items: MenuItem[];
  counts: Map<string, number>;
  onPick: (item: MenuItem, opts: { forceSheet: boolean }) => void;
  /** الأكثر طلباً / تريند, from the last 30 days of sales */
  fame?: Map<string, Fame>;
}

export const MenuPanel = forwardRef<HTMLInputElement, MenuPanelProps>(function MenuPanel({ cats, items, counts, onPick, fame }, searchRef) {
  const { L, loc, lang } = useT();
  const reduced = useReduced();
  const [cat, setCat] = useState<string | "all" | "discounts">("all");
  const discounted = useMemo(() => items.filter((i) => (i.discount ?? 0) > 0), [items]);
  const [q, setQ] = useState("");
  const catById = useMemo(() => new Map(cats.map((c) => [c.id, c])), [cats]);
  const shown = useMemo(() => {
    const list = q.trim() ? items.filter((i) => matches(`${i.name.ar} ${i.name.en} ${i.sku ?? ""} ${catById.get(i.categoryId)?.name.ar ?? ""}`, q)) : cat === "all" ? items : cat === "discounts" ? discounted : items.filter((i) => i.categoryId === cat);
    return cat === "all" && !q.trim() ? [...list].sort((a, b) => (catById.get(a.categoryId)?.sort ?? 0) - (catById.get(b.categoryId)?.sort ?? 0) || a.sort - b.sort) : list;
  }, [items, cat, q, catById, discounted]);
  const inCat = useMemo(() => {
    const m = new Map<string, number>();
    for (const [itemId, n] of counts) {
      const c = items.find((i) => i.id === itemId)?.categoryId;
      if (c) m.set(c, (m.get(c) ?? 0) + n);
    }
    return m;
  }, [counts, items]);

  return (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col" aria-label={L("المنيو", "Menu")}>
      <div className="flex items-center gap-2 px-3 pt-3 pb-2 @3xl:px-4">
        <label className="relative flex-1">
          <Search className="pointer-events-none absolute start-3.5 top-1/2 size-[18px] -translate-y-1/2 text-muted" aria-hidden />
          <input
            ref={searchRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && shown[0]) {
                onPick(shown[0], { forceSheet: false });
                setQ("");
              }
              if (e.key === "Escape") (setQ(""), (e.target as HTMLInputElement).blur());
            }}
            placeholder={L("دوّر على صنف أو كود… (S)", "Search item or code… (S)")}
            aria-label={L("بحث في المنيو", "Search menu")}
            className="h-12 w-full rounded-2xl border border-line bg-surface ps-11 pe-10 text-[15.5px] shadow-sf-sm outline-none placeholder:text-faint focus:border-primary focus:shadow-[var(--sf-glow)]"
          />
          {q ? (
            <button type="button" onClick={() => setQ("")} className="absolute end-2 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-lg text-muted hover:bg-surface-3" aria-label={L("امسح", "Clear")}>
              <X className="size-4" />
            </button>
          ) : null}
        </label>
      </div>
      <div className="flex gap-2 overflow-x-auto px-3 pb-2 no-scrollbar @3xl:px-4" role="tablist" aria-label={L("الأقسام", "Categories")}>
        <Chip active={cat === "all" && !q} onClick={() => (setCat("all"), setQ(""))}>
          {L("الكل", "All")}
        </Chip>
        {discounted.length ? (
          <Chip active={cat === "discounts" && !q} color="var(--sf-danger)" onClick={() => (setCat("discounts"), setQ(""))} count={discounted.length}>
            <Percent aria-hidden />
            {L("الخصومات", "Discounts")}
          </Chip>
        ) : null}
        {cats.map((c) => {
          const Icon = catIcon(c.icon);
          return (
            <Chip key={c.id} active={cat === c.id && !q} color={c.color} onClick={() => (setCat(c.id), setQ(""))} count={inCat.get(c.id) ?? null}>
              <Icon aria-hidden />
              {loc(c.name)}
            </Chip>
          );
        })}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 pt-1 pb-4 thin-scrollbar @3xl:px-4">
        {shown.length === 0 ? (
          <p className="py-16 text-center text-muted">{L("مفيش أصناف بالاسم ده", "No items match")}</p>
        ) : (
          <motion.ul layout={!reduced} className="grid grid-cols-2 gap-2.5 @lg:grid-cols-3 @3xl:grid-cols-4 @6xl:grid-cols-5" aria-label={L("الأصناف", "Items")}>
            <AnimatePresence initial={false}>
              {shown.map((it) => (
                <ItemTile key={it.id} item={it} cat={catById.get(it.categoryId)} count={counts.get(it.id) ?? 0} onPick={onPick} lang={lang} fame={fame?.get(it.id)} />
              ))}
            </AnimatePresence>
          </motion.ul>
        )}
      </div>
    </section>
  );
});

function ItemTile({ item, cat, count, onPick, lang, fame }: { item: MenuItem; cat?: MenuCategory; count: number; onPick: MenuPanelProps["onPick"]; lang: "ar" | "en"; fame?: Fame }) {
  const { L, loc } = useT();
  const reduced = useReduced();
  const Icon = catIcon(cat?.icon);
  const color = cat?.color ?? "var(--sf-primary)";
  const press = useRef<ReturnType<typeof setTimeout> | null>(null);
  const long = useRef(false);
  const off = !item.available;
  const [broken, setBroken] = useState(false);
  const photo = broken ? undefined : item.imageUrl ?? menuPhoto(item.name.ar);
  const start = () => {
    long.current = false;
    press.current = setTimeout(() => {
      long.current = true;
      onPick(item, { forceSheet: true });
    }, 480);
  };
  const end = () => press.current && clearTimeout(press.current);
  return (
    <motion.li layout={!reduced} initial={reduced ? false : { opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.96 }} transition={spring.snappy}>
      <motion.button
        type="button"
        disabled={off}
        whileTap={reduced || off ? undefined : { scale: 0.96 }}
        transition={spring.snappy}
        onPointerDown={start}
        onPointerUp={end}
        onPointerLeave={end}
        onClick={() => {
          if (long.current) return;
          onPick(item, { forceSheet: false });
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          end();
          onPick(item, { forceSheet: true });
        }}
        className={cn(
          "group relative flex h-full w-full flex-col overflow-hidden rounded-[18px] border border-line bg-surface text-start shadow-sf-sm transition-[border-color,box-shadow] hover:border-line-strong hover:shadow-sf focus-visible:outline-2",
          off && "opacity-55",
          count > 0 && "border-transparent ring-2",
        )}
        style={count > 0 ? { ["--tw-ring-color" as string]: color } : undefined}
        aria-label={`${loc(item.name)} ${formatMoney(Math.max(0, item.price - (item.discount ?? 0)), { lang })}${off ? ` — ${L("خلصان", "sold out")}` : ""}`}
      >
        {/* الصورة كبيرة، والعلامات فوقها زي الإشعار (Mohammed 2026-11-24) */}
        <span className="relative block aspect-[4/3] w-full overflow-hidden" style={{ background: `radial-gradient(circle at 50% 60%, color-mix(in srgb, ${color} 22%, transparent), color-mix(in srgb, ${color} 6%, transparent) 70%)` }}>
          {photo ? (
            <img src={photo} alt="" loading="lazy" decoding="async" onError={() => setBroken(true)} className="absolute inset-0 size-full object-cover transition-transform duration-200 group-hover:scale-[1.04]" />
          ) : (
            <span className="absolute inset-0 grid place-items-center" style={{ color }}>
              <Icon className="size-12 opacity-80" aria-hidden />
            </span>
          )}
          <span className="absolute inset-x-1.5 top-1.5 flex flex-wrap items-start gap-1 pe-8 [&>span]:shadow-sf-sm">
            {/* Saqr 2026-11-24: the discount mark is just %, no value; no spicy mark */}
            {item.discount && item.price ? <span className="num rounded-full bg-danger px-2 py-0.5 text-[11.5px] font-bold leading-4 text-white" aria-label={L("عليه خصم", "Discounted")}>%</span> : null}
            {fame ? (
              <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold leading-4 [&_svg]:size-3", fame === "top" ? "bg-brass text-black" : "bg-info text-white")}>
                {fame === "top" ? null : <TrendingUp />} {fame === "top" ? L("الأكثر طلباً", "Best seller") : L("تريند", "Trending")}
              </span>
            ) : null}
            {item.tags.includes("popular") && !fame ? <span className="inline-flex items-center gap-1 rounded-full bg-brass px-2 py-0.5 text-[11px] font-bold leading-4 text-black [&_svg]:size-3"><Star className="fill-current" /> {L("مميز", "Popular")}</span> : null}
            {item.tags.includes("chef") ? <span className="inline-flex items-center rounded-full bg-surface/90 px-1.5 py-0.5 text-brass-text [&_svg]:size-3.5"><Sparkles aria-label={L("اختيار الشيف", "Chef's pick")} /></span> : null}
            {item.tags.includes("veg") ? <span className="inline-flex items-center rounded-full bg-surface/90 px-1.5 py-0.5 text-ok [&_svg]:size-3.5"><Leaf aria-label={L("نباتي", "Vegetarian")} /></span> : null}
          </span>
          {off ? (
            <span className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-1 bg-danger py-0.5 text-[12px] font-bold text-white">
              <Ban className="size-3.5" /> {L("خلصان", "86'd")}
            </span>
          ) : null}
        </span>
        <span className="flex flex-1 flex-col gap-1 p-2.5">
          <span className="line-clamp-2 text-[15px] font-semibold leading-snug">{loc(item.name)}</span>
          <span className="mt-auto flex items-center justify-between gap-2">
            <span className="flex items-baseline gap-1.5" dir="ltr">
              <span className="num text-[16px] font-bold text-ink">{formatMoney(Math.max(0, item.price - (item.discount ?? 0)), { lang, compact: true, bare: true })}</span>
              {item.discount ? <span className="num text-[12px] text-muted line-through">{formatMoney(item.price, { lang, compact: true, bare: true })}</span> : null}
            </span>
            {item.modifierGroupIds.length ? <span className="rounded-full bg-surface-3 px-2 py-0.5 text-[11px] font-semibold text-muted">{L("اختيارات", "options")}</span> : null}
          </span>
        </span>
        <AnimatePresence>
          {count > 0 ? (
            <motion.span
              key={count}
              initial={reduced ? false : { scale: 0.4, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.4, opacity: 0 }}
              transition={spring.snappy}
              className="num absolute top-2 end-2 grid min-w-7 place-items-center rounded-full px-1.5 text-[13px] font-bold leading-7 text-white shadow-sf"
              style={{ background: color }}
            >
              {count}
            </motion.span>
          ) : null}
        </AnimatePresence>
      </motion.button>
    </motion.li>
  );
}
