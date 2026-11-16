import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, ArrowRight, CupSoda, Disc3, GalleryVerticalEnd, Layers3, Moon, ShoppingBag, Sun, UtensilsCrossed } from "lucide-react";
import { useSession } from "@/auth/session";
import { SushiConveyorMenu as ConveyorMenu, type ConveyorDish, type DishTier } from "@/fx/ConveyorMenu";
import { DishOrbitCarousel, type Dish } from "@/fx/DishOrbit";
import FlavorSlider, { type FlavorSlide } from "@/fx/FlavorSlider";
import { CoffeePourMenu } from "@/fx/PourMenu";
import { StackingCards } from "@/fx/StackingCards";
import { useT } from "@/i18n/i18n";
import { cn } from "@/lib/cn";
import { formatMoney } from "@/lib/money";
import { Mark } from "@/shell/Logo";
import { useTheme } from "@/theme/theme";
import { Skeleton } from "@/ui";
import { FLAVOUR_COLORS, flavourItems, offerItems, platePlaceholder, pourItems, pourRecipe, useShowcase, type ShowCategory, type ShowItem } from "./data";

type View = "dishes" | "belt" | "flavours" | "drinks" | "offers";

/** "كلاسيك بيف برجر" → thin "كلاسيك" over heavy "بيف برجر"; a one-word name sits under its category */
export function splitName(name: string, fallback: string): [string, string] {
  const words = name.replace(/\s*\([^)]*\)\s*/g, " ").trim().split(/\s+/);
  if (words.length < 2) return [fallback, name];
  return [words[0], words.slice(1).join(" ")];
}

export default function ShowcasePage() {
  const { L, lang, loc } = useT();
  const { can } = useSession();
  const nav = useNavigate();
  const theme = useTheme();
  const { loading, categories } = useShowcase();
  const [view, setView] = useState<View>("dishes");
  const [catId, setCatId] = useState<string | null>(null);
  const cat = categories.find((c) => c.cat.id === catId) ?? categories[0];
  const money = (u: number) => formatMoney(u, { lang, whole: true });
  const number = (u: number) => formatMoney(u, { lang, whole: true, bare: true });

  const flavours = useMemo(() => flavourItems(categories), [categories]);
  const drinks = useMemo(() => pourItems(categories), [categories]);
  const offers = useMemo(() => offerItems(categories), [categories]);

  const views: { id: View; label: string; icon: ReactNode; show: boolean }[] = [
    { id: "dishes", label: L("الأطباق", "Dishes"), icon: <UtensilsCrossed />, show: true },
    { id: "belt", label: L("السير", "Conveyor"), icon: <GalleryVerticalEnd />, show: true },
    { id: "flavours", label: L("النكهات", "Flavours"), icon: <Disc3 />, show: flavours.length > 1 },
    { id: "drinks", label: L("المشروبات", "Drinks"), icon: <CupSoda />, show: drinks.length > 0 },
    { id: "offers", label: L("العروض", "Offers"), icon: <Layers3 />, show: offers.length > 1 },
  ];
  // the scroll-driven views start from the top of the page
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [view]);

  // a photo that fails to load (the image host is unreachable, the file was removed) becomes a drawn plate
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const onError = (e: Event) => {
      const img = e.target;
      if (!(img instanceof HTMLImageElement) || img.dataset.fallback) return;
      img.dataset.fallback = "1";
      img.src = platePlaceholder(img.alt || "W");
    };
    el.addEventListener("error", onError, true);
    return () => el.removeEventListener("error", onError, true);
  }, []);

  const order = can("pos.use") ? () => nav("/pos") : undefined;
  const Back = lang === "ar" ? ArrowRight : ArrowLeft;

  return (
    <div ref={root} className="relative min-h-dvh bg-bg text-ink">
      <header className="fixed inset-x-0 top-0 z-50 px-3 pt-3 sm:px-5">
        <div className="mx-auto flex max-w-[1400px] items-center gap-2 rounded-full border border-line/70 bg-surface/70 py-1.5 ps-2 pe-2 shadow-sf backdrop-blur-xl sm:gap-3">
          <Link to="/" aria-label={L("رجوع للنظام", "Back to the system")} className="grid size-10 shrink-0 place-items-center rounded-full text-ink-2 hover:bg-surface-3">
            <Back className="size-5" />
          </Link>
          <Mark className="size-9 max-sm:hidden" />
          <nav className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto [scrollbar-width:none]" aria-label={L("طرق العرض", "Views")}>
            {views.filter((v) => v.show).map((v) => (
              <button
                key={v.id}
                type="button"
                aria-pressed={view === v.id}
                onClick={() => setView(v.id)}
                className={cn(
                  "flex h-10 shrink-0 items-center gap-2 rounded-full px-3.5 text-[13.5px] font-bold transition-colors [&_svg]:size-[17px]",
                  view === v.id ? "bg-brass text-brass-ink shadow-sf-sm" : "text-muted hover:bg-surface-3 hover:text-ink",
                )}
              >
                {v.icon}
                <span className={cn(view !== v.id && "max-sm:hidden")}>{v.label}</span>
              </button>
            ))}
          </nav>
          <button type="button" onClick={theme.toggle} aria-label={L("غيّر المظهر", "Toggle theme")} className="grid size-10 shrink-0 place-items-center rounded-full text-ink-2 hover:bg-surface-3">
            {theme.dark ? <Sun className="size-[18px]" /> : <Moon className="size-[18px]" />}
          </button>
        </div>
        {view === "dishes" || view === "belt" ? (
          <div className="mx-auto mt-2 flex max-w-[1400px] gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none]" role="tablist" aria-label={L("الأقسام", "Categories")}>
            {categories.map((c) => (
              <button
                key={c.cat.id}
                type="button"
                role="tab"
                aria-selected={c === cat}
                onClick={() => setCatId(c.cat.id)}
                className={cn(
                  "flex h-9 shrink-0 items-center gap-2 rounded-full border ps-1 pe-3.5 text-[13px] font-semibold backdrop-blur-xl transition-colors",
                  c === cat ? "border-brass bg-brass-soft text-brass-text" : "border-line/70 bg-surface/70 text-ink-2 hover:border-line-strong",
                )}
              >
                {c.photo ? <img src={c.photo} alt="" loading="lazy" className="size-7 rounded-full object-cover" /> : <span className="size-7 rounded-full" style={{ background: c.cat.color }} />}
                {loc(c.cat.name)}
              </button>
            ))}
          </div>
        ) : null}
      </header>

      {loading ? (
        <div className="p-6 pt-32">
          <Skeleton className="h-[70svh]" rounded="rounded-[28px]" />
        </div>
      ) : !cat ? (
        <p className="grid min-h-dvh place-items-center px-6 text-center text-muted">{L("أضف أصنافا للمنيو أولا لتظهر هنا.", "Add items to the menu first to see them here.")}</p>
      ) : view === "dishes" ? (
        <DishesView key={cat.cat.id} cat={cat} money={number} onOrder={order} />
      ) : view === "belt" ? (
        <BeltView key={cat.cat.id} cat={cat} money={money} onOrder={order} />
      ) : view === "flavours" ? (
        <FlavoursView items={flavours} money={money} />
      ) : view === "drinks" ? (
        <DrinksView items={drinks} money={money} />
      ) : (
        <OffersView items={offers} money={money} />
      )}
    </div>
  );
}

function facts(i: ShowItem, L: (ar: string, en: string) => string): string[] {
  const out: string[] = [];
  if (i.item.prepMinutes) out.push(L(`${i.item.prepMinutes} دقيقة`, `${i.item.prepMinutes} min`));
  if (i.item.calories) out.push(L(`${i.item.calories} سعرة`, `${i.item.calories} kcal`));
  if (i.item.tags.includes("spicy")) out.push(L("حار", "Spicy"));
  if (i.item.tags.includes("new")) out.push(L("جديد", "New"));
  if (i.item.tags.includes("popular")) out.push(L("الأكثر طلبا", "Popular"));
  if (!i.item.available) out.push(L("خلص اليوم", "Sold out today"));
  return out;
}

function DishesView({ cat, money, onOrder }: { cat: ShowCategory; money: (u: number) => string; onOrder?: () => void }) {
  const { L, lang, loc } = useT();
  const dishes = useMemo<Dish[]>(
    () =>
      cat.items.map((i, n) => {
        const name = loc(i.item.name);
        const [title, subtitle] = splitName(name, loc(cat.cat.name));
        return {
          title,
          subtitle,
          label: name,
          image: i.photo,
          alt: name,
          eyebrow: L(`${n + 1} من ${cat.items.length} · ${loc(cat.cat.name)}`, `${n + 1} of ${cat.items.length} · ${loc(cat.cat.name)}`),
          badge: money(i.item.price),
          badgeUnit: L("ج.م", "EGP"),
          heading: name,
          note: loc(cat.cat.name),
          description: loc(i.item.description) || L("من منيو وستروس.", "From the Westeros menu."),
          chips: facts(i, L),
          accent: "#f8bb18",
        };
      }),
    [cat, lang], // eslint-disable-line react-hooks/exhaustive-deps
  );
  return (
    <DishOrbitCarousel
      dishes={dishes}
      height="100svh"
      className="[--dsh-top:128px]"
      backdrop={cat.photo ?? undefined}
      dir={lang === "ar" ? "rtl" : "ltr"}
      onOrder={onOrder}
      labels={{ overview: L("الوصف", "Overview"), ingredients: L("المكونات", "Ingredients"), order: L("اطلب من الكاشير", "Order at the POS"), previous: L("الطبق السابق", "Previous dish"), next: L("الطبق التالي", "Next dish"), region: L("أطباق القسم", "Dishes") }}
    />
  );
}

function BeltView({ cat, money, onOrder }: { cat: ShowCategory; money: (u: number) => string; onOrder?: () => void }) {
  const { L, lang, loc } = useT();
  const items = useMemo<ConveyorDish[]>(() => {
    const prices = [...new Set(cat.items.map((i) => i.item.price))].sort((a, b) => a - b);
    return cat.items.map((i) => ({
      id: i.item.id,
      name: loc(i.item.name),
      description: loc(i.item.description) || undefined,
      price: money(i.item.price),
      tier: (Math.min(4, Math.floor((prices.indexOf(i.item.price) / Math.max(1, prices.length)) * 5)) + 1) as DishTier,
      image: i.photo,
      details: facts(i, L),
    }));
  }, [cat, lang]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="grid min-h-dvh place-items-center px-3 pt-32 pb-10 sm:px-6" dir={lang === "ar" ? "rtl" : "ltr"}>
      <ConveyorMenu
        className="w-full max-w-[1200px]"
        items={items}
        eyebrow={L("منيو وستروس", "Westeros menu")}
        heading={loc(cat.cat.name)}
        caption={L("اسحب السير أو اضغط على أي طبق لتشوف تفاصيله.", "Drag the belt or tap a plate to see it.")}
        autoplay
        onAdd={onOrder ? () => onOrder() : undefined}
        labels={{ add: L("اطلب من الكاشير", "Order at the POS"), close: L("إغلاق", "Close"), previous: L("الطبق السابق", "Previous plate"), next: L("الطبق التالي", "Next plate"), pause: L("أوقف السير", "Pause belt") }}
      />
    </div>
  );
}

function FlavoursView({ items, money }: { items: ShowItem[]; money: (u: number) => string }) {
  const { L, lang, loc } = useT();
  const slides = useMemo<FlavorSlide[]>(
    () =>
      items.map((i, n) => {
        const name = loc(i.item.name);
        return { name: name.split(/\s+/).slice(0, 2).join(" "), title: name, description: [loc(i.item.description), money(i.item.price)].filter(Boolean).join(" · "), image: i.photo, alt: name, color: FLAVOUR_COLORS[n % FLAVOUR_COLORS.length] };
      }),
    [items, lang], // eslint-disable-line react-hooks/exhaustive-deps
  );
  return <FlavorSlider slides={slides} height="100svh" label={L("النكهات", "Flavours")} previousLabel={L("السابق", "Previous")} nextLabel={L("التالي", "Next")} />;
}

function DrinksView({ items, money }: { items: ShowItem[]; money: (u: number) => string }) {
  const { L, lang, loc } = useT();
  const drinks = useMemo(() => items.map((i, n) => pourRecipe(i, loc(i.item.name), money(i.item.price), n)), [items, lang]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="grid min-h-dvh place-items-center px-3 pt-24 pb-10 sm:px-6">
      <div className="w-full max-w-5xl">
        <p className="mb-1 text-center text-[13px] font-bold text-brass-text">{L("ركن المشروبات", "The drinks corner")}</p>
        <h1 className="mb-5 text-center text-[28px] sm:text-[36px]">{L("اختار مشروبك وشوفه بيتصب", "Pick a drink and watch it pour")}</h1>
        <CoffeePourMenu items={drinks} label={L("المشروبات", "Drinks")} />
      </div>
    </div>
  );
}

function OffersView({ items, money }: { items: ShowItem[]; money: (u: number) => string }) {
  const { L, lang, loc } = useT();
  const cards = useMemo(
    () => items.map((i, n) => ({ key: i.item.id, title: loc(i.item.name), subtitle: money(i.item.price), tag: L(`عرض ${n + 1} من ${items.length}`, `Offer ${n + 1} of ${items.length}`), description: loc(i.item.description) || undefined, image: i.photo })),
    [items, lang], // eslint-disable-line react-hooks/exhaustive-deps
  );
  return <StackingCards cards={cards} label={L("العروض", "Offers")} mark={<ShoppingBag />} />;
}
