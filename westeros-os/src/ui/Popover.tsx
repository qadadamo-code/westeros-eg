import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { cn } from "@/lib/cn";
import { HotkeyScope, useHotkeys } from "./hotkeys";
import { spring, useReduced } from "./motion";

/**
 * Anchored popover (menus, switchers). Closes on outside click and Escape.
 * `trigger` receives the open state and the props to spread on the trigger button.
 */
export function Popover({ trigger, children, align = "start", side = "bottom", className, width = "w-72" }: {
  trigger: (p: { open: boolean; props: { "aria-expanded": boolean; "aria-haspopup": "menu"; "aria-controls": string; onClick: () => void } }) => ReactNode;
  children: ReactNode | ((close: () => void) => ReactNode);
  align?: "start" | "end";
  side?: "bottom" | "top";
  className?: string;
  width?: string;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const reduced = useReduced();
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const on = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!root.current?.contains(t) && !panel.current?.contains(t)) setOpen(false);
    };
    document.addEventListener("pointerdown", on);
    return () => document.removeEventListener("pointerdown", on);
  }, [open]);
  const close = () => setOpen(false);
  // The panel floats over the page (never cut by a card, a dialog or a scrolling side bar), anchored to the trigger
  // and kept inside the screen.
  const [pos, setPos] = useState<CSSProperties | null>(null);
  useLayoutEffect(() => {
    if (!open) return setPos(null);
    const fit = () => {
      const r = root.current?.getBoundingClientRect();
      const el = panel.current;
      if (!r || !el) return;
      const vw = document.documentElement.clientWidth;
      const vh = window.innerHeight;
      const w = el.offsetWidth;
      const rtl = getComputedStyle(root.current!).direction === "rtl";
      // "start" hugs the trigger's leading edge: its right edge in Arabic
      const fromRight = (align === "start") === rtl;
      const left = Math.min(Math.max(12, fromRight ? r.right - w : r.left), Math.max(12, vw - w - 12));
      const room = side === "bottom" ? vh - r.bottom - 20 : r.top - 20;
      setPos({ left, maxHeight: Math.max(160, room), ...(side === "bottom" ? { top: r.bottom + 8 } : { bottom: vh - r.top + 8 }) });
    };
    fit();
    window.addEventListener("resize", fit);
    window.addEventListener("scroll", fit, true);
    return () => {
      window.removeEventListener("resize", fit);
      window.removeEventListener("scroll", fit, true);
    };
  }, [open, align, side]);
  return (
    <div ref={root} className="relative">
      {trigger({ open, props: { "aria-expanded": open, "aria-haspopup": "menu", "aria-controls": id, onClick: () => setOpen((v) => !v) } })}
      {typeof document === "undefined"
        ? null
        : createPortal(
            <AnimatePresence>
              {open ? (
                <HotkeyScope>
                  <PopEsc onClose={close} />
                  <motion.div
                    id={id}
                    ref={panel}
                    dir={root.current ? getComputedStyle(root.current).direction : undefined}
                    initial={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: side === "bottom" ? -6 : 6 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.97, transition: { duration: 0.12 } }}
                    transition={spring.snappy}
                    style={{ position: "fixed", transformOrigin: side === "bottom" ? "top" : "bottom", visibility: pos ? "visible" : "hidden", ...pos }}
                    className={cn("z-[95] max-w-[calc(100vw-24px)] overflow-y-auto rounded-2xl border border-line bg-surface p-1.5 shadow-sf-lg thin-scrollbar", width, className)}
                  >
                    {typeof children === "function" ? children(close) : children}
                  </motion.div>
                </HotkeyScope>
              ) : null}
            </AnimatePresence>,
            document.body,
          )}
    </div>
  );
}

function PopEsc({ onClose }: { onClose: () => void }) {
  useHotkeys({ escape: onClose });
  return null;
}

export function MenuItem({ icon, children, onClick, active, danger, end, disabled }: { icon?: ReactNode; children: ReactNode; onClick?: () => void; active?: boolean; danger?: boolean; end?: ReactNode; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-start text-[14.5px] font-medium transition-colors [&_svg]:size-[18px] [&_svg]:shrink-0",
        danger ? "text-danger hover:bg-danger-soft" : "hover:bg-surface-3",
        active && "bg-primary-soft text-primary hover:bg-primary-soft",
        disabled && "opacity-50",
      )}
    >
      {icon ? <span className={cn(active ? "text-primary" : danger ? "text-danger" : "text-muted")}>{icon}</span> : null}
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {end}
    </button>
  );
}

export function MenuLabel({ children }: { children: ReactNode }) {
  return <p className="px-3 pt-2 pb-1 text-[11.5px] font-semibold tracking-wide text-faint">{children}</p>;
}
export function MenuSeparator() {
  return <div className="my-1.5 h-px bg-line" role="separator" />;
}
