import { useEffect, useState, useSyncExternalStore } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { AnimatePresence, motion } from "motion/react";
import { ChevronDown, PanelLeftClose, PanelLeftOpen, X } from "lucide-react";
import type { ModuleDef } from "@/modules/types";
import { useT, type TKey } from "@/i18n/i18n";
import { cn } from "@/lib/cn";
import { IconButton, spring, useReduced } from "@/ui";
import { Logo } from "./Logo";
import { NavBadge } from "./NavBadge";
import { useNav } from "./nav";
import { RestaurantSwitcher } from "./Switchers";
import { SyncIndicator } from "./SyncIndicator";
import { UserMenu } from "./UserMenu";

export function Sidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const { t, dir } = useT();
  const reduced = useReduced();
  const ToggleIcon = collapsed ? (dir === "rtl" ? PanelLeftClose : PanelLeftOpen) : dir === "rtl" ? PanelLeftOpen : PanelLeftClose;
  return (
    <motion.aside
      initial={false}
      animate={{ width: collapsed ? 84 : 268 }}
      transition={reduced ? { duration: 0 } : spring.soft}
      className="sf-glass sticky top-3 z-30 my-3 ms-3 hidden h-[calc(100dvh-24px)] shrink-0 flex-col overflow-hidden rounded-[28px] md:flex"
      aria-label={t("shell.menu")}
    >
      <div className={cn("flex h-16 shrink-0 items-center gap-2 px-4", collapsed && "justify-center px-0")}>
        {!collapsed ? <Logo className="flex-1" /> : null}
        <IconButton label={collapsed ? t("shell.expand") : t("shell.collapse")} size="sm" onClick={onToggle}>
          <ToggleIcon />
        </IconButton>
      </div>
      <div className={cn("px-3 pb-3", collapsed && "px-2")}>
        <RestaurantSwitcher collapsed={collapsed} />
      </div>
      <NavList collapsed={collapsed} />
      <div className={cn("grid shrink-0 gap-2 border-t border-line p-3", collapsed && "justify-items-center px-2")}>
        <SyncIndicator compact={collapsed} side="top" align="start" className={cn(!collapsed && "w-full justify-start")} />
        <UserMenu side="top" align="start" full={!collapsed} />
      </div>
    </motion.aside>
  );
}

/** the menus and their sub-menus: the desktop sidebar and the phone drawer show the same list */
function NavList({ collapsed, onPick }: { collapsed: boolean; onPick?: () => void }) {
  const { t, loc } = useT();
  const { grouped } = useNav();
  const reduced = useReduced();
  const { pathname } = useLocation();
  const under = (m: ModuleDef) => !!m.nav!.activePaths?.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  return (
    <nav className="min-h-0 flex-1 overflow-y-auto px-3 pb-4 thin-scrollbar" aria-label={t("shell.menu")} onClick={(e) => { if (onPick && (e.target as HTMLElement).closest("a")) onPick(); }}>
      {grouped.map((g) => (
        <div key={g.group} className="mt-3 first:mt-1">
          {!collapsed ? <p className="px-3 pb-1.5 text-[11.5px] font-semibold tracking-wide text-faint">{t(`nav.group.${g.group}` as TKey)}</p> : <div className="mx-auto mb-2 h-px w-8 bg-line" />}
          <ul className="grid gap-0.5">
            {g.items.map((m) => {
              const Icon = m.icon;
              return (
                <li key={m.id} className="relative">
                  <NavLink
                    to={m.nav!.path}
                    title={collapsed ? loc(m.title) : undefined}
                    className={({ isActive: hit }) => {
                      const isActive = hit || under(m);
                      return cn(
                        "group relative flex h-11 items-center gap-3 rounded-xl px-3 text-[14.5px] font-semibold transition-colors",
                        collapsed && "justify-center px-0",
                        isActive ? "text-ink" : "text-ink-2 hover:bg-surface-3/70 hover:text-ink",
                      );
                    }}
                  >
                    {({ isActive: hit }) => { const isActive = hit || under(m); return (
                      <>
                        {isActive ? (
                          <motion.span layoutId="nav-active" className="absolute inset-0 rounded-xl bg-[linear-gradient(100deg,color-mix(in_srgb,var(--sf-brass)_26%,transparent),color-mix(in_srgb,var(--sf-brass)_8%,transparent))] ring-1 ring-brass/30" transition={reduced ? { duration: 0 } : spring.layout}>
                            <span className="absolute inset-y-2.5 -start-3 w-1 rounded-e-full bg-brass shadow-[0_0_12px_var(--sf-brass)]" />
                          </motion.span>
                        ) : null}
                        <Icon className="relative size-5 shrink-0" strokeWidth={isActive ? 2.25 : 1.9} aria-hidden />
                        {!collapsed ? <span className="relative min-w-0 flex-1 truncate">{loc(m.title)}</span> : null}
                        <NavBadge module={m} className={cn("relative", collapsed && "absolute -top-0.5 end-2")} />
                      </>
                    ); }}
                  </NavLink>
                  {m.nav!.useSub && !collapsed ? <SubNav m={m} /> : null}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

/* ───── phone: a side menu that opens from ☰ and hides again (Saqr 2026-11-24, instead of the bottom bar) ───── */
let drawerOpen = false;
const drawerSubs = new Set<() => void>();
const setDrawer = (v: boolean) => { drawerOpen = v; drawerSubs.forEach((f) => f()); };
export const openMobileMenu = () => setDrawer(true);
function useDrawer() {
  return useSyncExternalStore((cb) => (drawerSubs.add(cb), () => void drawerSubs.delete(cb)), () => drawerOpen, () => false);
}

export function MobileMenu() {
  const { t, dir } = useT();
  const open = useDrawer();
  const reduced = useReduced();
  const { pathname } = useLocation();
  useEffect(() => setDrawer(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") setDrawer(false); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [open]);
  const from = dir === "rtl" ? "100%" : "-100%";
  return (
    <AnimatePresence>
      {open ? (
        <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true" aria-label={t("shell.menu")}>
          <motion.button type="button" aria-label="إغلاق القائمة" className="absolute inset-0 bg-black/50 backdrop-blur-[2px]" onClick={() => setDrawer(false)}
            initial={reduced ? false : { opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
          <motion.aside className="sf-glass absolute inset-y-0 start-0 flex w-[min(84vw,320px)] flex-col overflow-hidden rounded-e-[28px] pt-[env(safe-area-inset-top)]"
            initial={reduced ? false : { x: from }} animate={{ x: 0 }} exit={{ x: from }} transition={reduced ? { duration: 0 } : spring.soft}>
            <div className="flex h-16 shrink-0 items-center gap-2 px-4">
              <Logo className="flex-1" />
              <IconButton label="إغلاق القائمة" size="sm" onClick={() => setDrawer(false)}><X /></IconButton>
            </div>
            <div className="px-3 pb-3"><RestaurantSwitcher /></div>
            <NavList collapsed={false} onPick={() => setDrawer(false)} />
            <div className="grid shrink-0 gap-2 border-t border-line p-3 pb-[max(12px,env(safe-area-inset-bottom))]">
              <UserMenu side="top" align="start" full />
            </div>
          </motion.aside>
        </div>
      ) : null}
    </AnimatePresence>
  );
}

/** القائمة الفرعية المنسدلة تحت عنصر (الحسابات ← أقسامها): open while you are inside it, and the arrow opens or folds it. */
function SubNav({ m }: { m: ModuleDef }) {
  const items = m.nav!.useSub!();
  const { pathname } = useLocation();
  const here = [m.nav!.path, ...(m.nav!.activePaths ?? [])].some((p) => pathname === p || pathname.startsWith(`${p}/`));
  const [open, setOpen] = useState<boolean | null>(null);
  const shown = open ?? here;
  const lit = (p: { to: string; end: boolean }) => (p.end ? pathname.replace(/\/$/, "") === p.to : pathname === p.to || pathname.startsWith(`${p.to}/`));
  if (!items.length) return null;
  return (
    <>
      <button type="button" aria-label={shown ? "طي القائمة الفرعية" : "فتح القائمة الفرعية"} aria-expanded={shown} onClick={() => setOpen(!shown)}
        className="absolute end-1.5 top-1.5 grid size-8 place-items-center rounded-lg text-muted transition-colors hover:bg-surface-3/70 hover:text-ink">
        <ChevronDown className={cn("size-4 transition-transform", shown && "rotate-180")} aria-hidden />
      </button>
      {shown ? (
        <ul className="mt-0.5 grid gap-0.5 border-s border-line ps-2 ms-5">
          {items.map((it) => {
            const on = it.paths.some(lit);
            const Icon = it.Icon;
            return (
              <li key={it.to}>
                <NavLink to={it.to} end className={cn("flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-[13.5px] font-semibold transition-colors", on ? "bg-brass-soft text-ink" : "text-ink-2 hover:bg-surface-3/70 hover:text-ink")} aria-current={on ? "page" : undefined}>
                  <Icon className={cn("size-4 shrink-0", on && "text-brass-text")} aria-hidden />
                  <span className="min-w-0 flex-1 truncate">{it.label}</span>
                  {it.module ? <NavBadge module={it.module} /> : null}
                </NavLink>
              </li>
            );
          })}
        </ul>
      ) : null}
    </>
  );
}
