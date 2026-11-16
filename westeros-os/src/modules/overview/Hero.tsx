/** The overview's opening: the sales "peak" card and the system's sections as glass folders. */
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import GlassFolder, { type ArtRecipe, type FolderFile } from "@/fx/GlassFolder";
import { PeakChart } from "@/fx/PeakChart";
import { useT } from "@/i18n/i18n";
import { useNav } from "@/shell/nav";
import { useTheme } from "@/theme/theme";
import type { ModuleDef } from "@/modules/types";

const EGP = 100_000; // units per pound (src/lib/money)
const DAY = 86_400_000;

export interface SalePoint {
  createdAt: string;
  amount: number;
}

/** hourly totals of today and daily totals of the last `days` days, in whole pounds, oldest first */
export function salesSeries(payments: SalePoint[], now: Date, lang: "ar" | "en") {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const today = payments.filter((p) => Date.parse(p.createdAt) >= start.getTime());
  const firstHour = Math.min(12, ...today.map((p) => new Date(p.createdAt).getHours()));
  const lastHour = Math.max(now.getHours(), firstHour + 5);
  const hours: { label: string; value: number }[] = [];
  for (let h = firstHour; h <= lastHour; h++) hours.push({ label: `${String(h % 24).padStart(2, "0")}:00`, value: 0 });
  for (const p of today) {
    const i = new Date(p.createdAt).getHours() - firstHour;
    if (hours[i]) hours[i].value += p.amount / EGP;
  }
  const days = (n: number) => {
    const out = Array.from({ length: n }, (_, i) => {
      const d = new Date(start.getTime() - (n - 1 - i) * DAY);
      return { t: d.getTime(), label: d.toLocaleDateString(lang === "ar" ? "ar-EG-u-nu-latn" : "en-GB", { day: "numeric", month: "short" }), value: 0 };
    });
    for (const p of payments) {
      const i = Math.floor((Date.parse(p.createdAt) - out[0].t) / DAY);
      if (i >= 0 && out[i]) out[i].value += p.amount / EGP;
    }
    return out.map(({ label, value }) => ({ label, value }));
  };
  return { hours, week: days(7), month: days(30) };
}

/** up when the later half of the series sold more than the earlier half */
export function trendOf(values: number[]): "up" | "down" | "none" {
  if (values.length < 2) return "none";
  const mid = Math.floor(values.length / 2);
  const a = values.slice(0, mid).reduce((x, y) => x + y, 0);
  const b = values.slice(values.length - mid).reduce((x, y) => x + y, 0);
  return b > a ? "up" : b < a ? "down" : "none";
}

function useWidth(max: number) {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(max);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fit = () => setW(Math.max(220, Math.min(max, Math.floor(el.clientWidth))));
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [max]);
  return [ref, w] as const;
}

export function SalesPeak({ payments, paidToday }: { payments: SalePoint[]; paidToday: number }) {
  const { L, lang } = useT();
  const periods = [L("اليوم", "Today"), L("7 أيام", "7 days"), L("30 يوم", "30 days")];
  const [period, setPeriod] = useState(periods[0]);
  const series = useMemo(() => salesSeries(payments, new Date(), lang), [payments, lang]);
  const i = Math.max(0, periods.indexOf(period));
  const points = i === 0 ? series.hours : i === 1 ? series.week : series.month;
  const values = points.map((p) => Math.round(p.value));
  const total = values.reduce((a, b) => a + b, 0);
  const [ref, width] = useWidth(360);
  return (
    <div ref={ref} className="flex w-full justify-center" dir="ltr">
      <PeakChart
        width={width}
        accent="#f8bb18"
        font='"Tajawal", "IBM Plex Sans Arabic", system-ui, sans-serif'
        data={values.length > 1 ? values : [0, 0]}
        labels={points.map((p) => p.label)}
        value={total}
        decimals={0}
        valueSuffix=""
        title={i === 0 ? L("مبيعات اليوم بالجنيه", "Today's sales, EGP") : L("المبيعات بالجنيه", "Sales, EGP")}
        caption={i === 0 ? L(`${paidToday} شيك مدفوع`, `${paidToday} paid checks`) : L("إجمالي الفترة", "Total for the period")}
        updatedText={L("مباشر", "Live")}
        trend={trendOf(values)}
        periods={periods}
        period={periods[i]}
        onPeriodChange={setPeriod}
        formatValue={(v) => `${Math.round(v).toLocaleString("en-US")} ${L("ج.م", "EGP")}`}
      />
    </div>
  );
}

const GOLD: ArtRecipe[] = [
  { style: "marble", colors: ["#0d0d0d", "#2a2108", "#8a6508", "#f8bb18", "#3a2c05", "#ffe08a"], scale: 0.68, warp: 3.1, angle: -0.5, gloss: 0.55, veins: 0.55 },
  { style: "streak", colors: ["#fff6dc", "#f8bb18", "#a87400", "#1a1408", "#0d0d0d", "#f8bb18", "#fff2cc"], scale: 0.7, warp: 1.5, angle: -0.6, gloss: 0.22, veins: 0 },
  { style: "marble", colors: ["#141414", "#3b3b3b", "#0d0d0d", "#f8bb18", "#5c4306", "#d9d6cf"], scale: 0.8, warp: 3.6, angle: 0.8, gloss: 0.5, veins: 0.45 },
  { style: "streak", colors: ["#0d0d0d", "#3a2c05", "#f8bb18", "#ffe9a8", "#8a6508", "#0d0d0d"], scale: 0.65, warp: 1.7, angle: 0.35, gloss: 0.3, veins: 0 },
];

/** the screens of the system, sorted into folders by what they are for */
const SHELVES: { ar: string; en: string; ids: string[] }[] = [
  { ar: "الخدمة", en: "Service", ids: ["pos", "waiter", "floor", "orders", "delivery", "reservations"] },
  { ar: "المطبخ والمخزن", en: "Kitchen & stock", ids: ["kitchen", "production", "checklists", "inventory", "menu", "showcase"] },
  { ar: "الفلوس", en: "Money", ids: ["accounting", "payments", "reports"] },
  { ar: "الفريق والعملاء", en: "People", ids: ["staff", "customers", "marketing", "messaging", "settings"] },
];

export function SectionFolders() {
  const { L, loc } = useT();
  const { items } = useNav();
  const nav = useNavigate();
  const theme = useTheme();
  const shelves = useMemo(
    () =>
      SHELVES.map((s) => ({ ...s, mods: s.ids.map((id) => items.find((m) => m.id === id)).filter((m): m is ModuleDef => !!m).slice(0, 5) })).filter((s) => s.mods.length),
    [items],
  );
  const [ref, width] = useWidth(1400);
  if (shelves.length < 2) return null;
  const per = width < 520 ? 2 : Math.min(4, shelves.length);
  const size = Math.max(150, Math.min(250, Math.floor((width - (per - 1) * 28) / per)));
  return (
    <section ref={ref} aria-label={L("الأقسام", "Sections")} className="grid gap-3">
      <div className="flex items-baseline gap-3">
        <h2 className="text-[19px] font-bold">{L("الأقسام", "Sections")}</h2>
        <p className="text-[13px] text-muted">{L("اضغط المجلد يفتح، واختار الشاشة", "Open a folder and pick a screen")}</p>
      </div>
      <div className="flex flex-wrap items-end justify-center gap-x-7 gap-y-8 pt-16 pb-2 sm:justify-between" dir="ltr">
        {shelves.map((s, i) => {
          const files: FolderFile[] = s.mods.map((m) => ({ name: loc(m.title), meta: loc(m.description).split(/[،,:]/)[0].slice(0, 34) }));
          return (
            <GlassFolder
              key={s.en}
              label={L(s.ar, s.en)}
              meta={L(`${s.mods.length} شاشات`, `${s.mods.length} screens`)}
              tone={theme.dark ? "dark" : "light"}
              art={GOLD[i % GOLD.length]}
              seed={3 + i * 4}
              files={files}
              action="none"
              labelPlacement="bottom-left"
              appearDelay={i * 120}
              width={size}
              onFileSelect={(_f, n) => s.mods[n] && nav(s.mods[n].nav!.path)}
            />
          );
        })}
      </div>
    </section>
  );
}
