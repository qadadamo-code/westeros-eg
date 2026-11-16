import { useState } from "react";
import { matchPath, useLocation, useNavigate } from "react-router-dom";
import { LayoutGrid } from "lucide-react";
import { useT, type TKey } from "@/i18n/i18n";
import { LiquidNavbar } from "@/fx/LiquidNavbar";
import { useTheme } from "@/theme/theme";
import { Sheet } from "@/ui";
import { NavBadge } from "./NavBadge";
import { useNav } from "./nav";
import { RestaurantSwitcher } from "./Switchers";

/** Phone bottom bar: the role's 4 key screens + "More" (everything else, in a bottom sheet). */
export function BottomNav() {
  const { t, loc } = useT();
  const { mobile, grouped } = useNav();
  const theme = useTheme();
  const [more, setMore] = useState(false);
  const nav = useNavigate();
  const { pathname } = useLocation();
  // the drop rests on the open screen, or on "More" for a screen that is not on the bar
  const at = mobile.findIndex((m) => matchPath({ path: `${m.nav!.path}/*` }, pathname) || (m.nav!.path === "/" && pathname === "/"));
  const current = more || at < 0 ? mobile.length : at;
  return (
    <>
      {/* the liquid dock: a pill of gold water whose drop runs to the screen you pick (src/fx/LiquidNavbar) */}
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-3 pb-[max(10px,env(safe-area-inset-bottom))] md:hidden">
        <LiquidNavbar
          className="wst-dock pointer-events-auto"
          label={t("shell.menu")}
          tone={theme.dark ? "dark" : "light"}
          compact={false}
          active={current}
          onChange={(i) => (i < mobile.length ? nav(mobile[i].nav!.path) : setMore(true))}
          items={[
            ...mobile.map((m) => {
              const Icon = m.icon;
              return {
                label: loc(m.title),
                fx: "pop" as const,
                icon: (
                  <span className="relative">
                    <Icon className="size-[21px]" aria-hidden />
                    <NavBadge module={m} className="absolute -top-1.5 -end-3" />
                  </span>
                ),
              };
            }),
            { label: t("shell.more"), fx: "spin" as const, icon: <LayoutGrid className="size-[21px]" aria-hidden /> },
          ]}
        />
      </div>
      <Sheet open={more} onClose={() => setMore(false)} title={t("shell.more")}>
        <div className="grid gap-5 pb-2">
          <RestaurantSwitcher />
          {grouped.map((g) => (
            <div key={g.group}>
              <p className="mb-2 text-[12px] font-semibold text-faint">{t(`nav.group.${g.group}` as TKey)}</p>
              <div className="grid grid-cols-3 gap-2">
                {g.items.map((m) => {
                  const Icon = m.icon;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => {
                        setMore(false);
                        nav(m.nav!.path);
                      }}
                      className="relative flex aspect-[1.1] flex-col items-center justify-center gap-2 rounded-2xl border border-line bg-surface-2 p-2 text-[13px] font-semibold active:scale-[0.97]"
                    >
                      <Icon className="size-6 text-primary" aria-hidden />
                      <span className="truncate">{loc(m.title)}</span>
                      <NavBadge module={m} className="absolute top-2 end-2" />
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </Sheet>
    </>
  );
}
