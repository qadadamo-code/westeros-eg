/**
 * The dropdown list of the whole system. Same props as before (value, onChange with `e.target.value`, options),
 * so every screen gets it: a panel with roomy rows, a tick on the chosen one, and, on a long list, a search box
 * that finds by any part of the name, the first letters of its words, or a shortened word (lib/search).
 */
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ChangeEvent, type CSSProperties, type ReactNode, type SelectHTMLAttributes } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Search } from "lucide-react";
import { cn } from "@/lib/cn";
import { searchFilter } from "@/lib/search";
import { FIELD, Field } from "./Input";

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}
export interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, "size" | "onChange" | "value"> {
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  options: SelectOption[];
  size?: "md" | "lg";
  value?: string;
  onChange?: (e: ChangeEvent<HTMLSelectElement>) => void;
}

/** a list longer than this gets the search box */
const SEARCH_FROM = 8;
const rtl = () => typeof document !== "undefined" && document.documentElement.dir === "rtl";

export function Select({ label, hint, error, options, size = "md", className, id, value = "", onChange, disabled, title, autoFocus, "aria-label": ariaLabel }: SelectProps) {
  const auto = useId();
  const fid = id ?? auto;
  const listId = `${fid}-list`;
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const [pos, setPos] = useState<CSSProperties | null>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const current = options.find((o) => o.value === value);
  const searchable = options.length > SEARCH_FROM;
  const shown = useMemo(() => (searchable ? searchFilter(options, q, (o) => o.label) : options), [options, q, searchable]);

  const close = (focus = true) => {
    setOpen(false);
    setQ("");
    if (focus) btn.current?.focus({ preventScroll: true });
  };
  const pick = (o: SelectOption) => {
    if (o.disabled) return;
    close();
    if (o.value !== value) onChange?.({ target: { value: o.value }, currentTarget: { value: o.value } } as ChangeEvent<HTMLSelectElement>);
  };
  const show = () => {
    if (disabled) return;
    setActive(Math.max(0, options.findIndex((o) => o.value === value)));
    setOpen(true);
  };

  // the panel hangs under the field (or above it when there is no room), as wide as the field
  useLayoutEffect(() => {
    if (!open) return setPos(null);
    const place = () => {
      const r = btn.current?.getBoundingClientRect();
      if (!r) return;
      const vh = window.innerHeight;
      const vw = document.documentElement.clientWidth;
      const below = vh - r.bottom - 12;
      const above = r.top - 12;
      const up = below < 220 && above > below;
      const width = Math.min(Math.max(r.width, 230), vw - 16);
      const left = Math.min(Math.max(8, rtl() ? r.right - width : r.left), vw - width - 8);
      setPos({ left, width, maxHeight: Math.max(160, Math.min(380, up ? above : below)), ...(up ? { bottom: vh - r.top + 6 } : { top: r.bottom + 6 }) });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const out = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!panel.current?.contains(t) && !btn.current?.contains(t)) close(false);
    };
    // Escape closes the list only, not the dialog the field sits in
    const key = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      e.preventDefault();
      close();
    };
    document.addEventListener("pointerdown", out, true);
    window.addEventListener("keydown", key, true);
    return () => {
      document.removeEventListener("pointerdown", out, true);
      window.removeEventListener("keydown", key, true);
    };
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  // typing goes straight to the search box once the panel is placed (not on touch screens: the keyboard would cover the list)
  const placed = !!pos;
  useEffect(() => {
    if (placed && !matchMedia("(pointer: coarse)").matches) search.current?.focus({ preventScroll: true });
  }, [placed]);
  useEffect(() => {
    if (open) list.current?.querySelector<HTMLElement>('[data-active="true"]')?.scrollIntoView({ block: "nearest" });
  }, [open, active, pos]);

  const onKey = (e: React.KeyboardEvent) => {
    if (!open) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Enter" || e.key === " ") (e.preventDefault(), show());
      return;
    }
    const step = (d: number) => {
      if (!shown.length) return;
      let i = active;
      for (let n = 0; n < shown.length; n++) {
        i = (i + d + shown.length) % shown.length;
        if (!shown[i].disabled) break;
      }
      setActive(i);
    };
    if (e.key === "ArrowDown") (e.preventDefault(), step(1));
    else if (e.key === "ArrowUp") (e.preventDefault(), step(-1));
    else if (e.key === "Home") (e.preventDefault(), setActive(0));
    else if (e.key === "End") (e.preventDefault(), setActive(shown.length - 1));
    else if (e.key === "Enter") (e.preventDefault(), shown[active] && pick(shown[active]));
    else if (e.key === "Tab") close(false);
  };

  return (
    <Field label={label} hint={hint} error={error} htmlFor={fid}>
      <button
        ref={btn}
        id={fid}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-label={ariaLabel}
        aria-invalid={error ? true : undefined}
        title={title}
        disabled={disabled}
        autoFocus={autoFocus}
        onClick={() => (open ? close() : show())}
        onKeyDown={onKey}
        className={cn(FIELD, "flex items-center gap-2 ps-3.5 pe-3 text-start", size === "lg" ? "h-13 text-[16px]" : "h-11 text-[15px]", open && "border-primary shadow-[var(--sf-glow)]", disabled ? "cursor-not-allowed" : "cursor-pointer", className)}
      >
        <span className={cn("min-w-0 flex-1 truncate", !current && "text-faint")}>{current?.label ?? "—"}</span>
        <ChevronDown className={cn("size-4 shrink-0 text-muted transition-transform duration-150", open && "rotate-180")} aria-hidden />
      </button>
      {open && typeof document !== "undefined"
        ? createPortal(
            <div ref={panel} dir={rtl() ? "rtl" : "ltr"} style={{ position: "fixed", visibility: pos ? "visible" : "hidden", ...pos }} className="sf-select-pop z-[95] flex flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-sf-lg" onKeyDown={onKey}>
              {searchable ? (
                <label className="flex h-11 shrink-0 items-center gap-2 border-b border-line px-3">
                  <Search className="size-4 shrink-0 text-muted" aria-hidden />
                  <input
                    ref={search}
                    className="w-0 flex-1 bg-transparent text-[14.5px] outline-none placeholder:text-faint"
                    placeholder={rtl() ? "ابحث بالاسم أو أول الحروف" : "Search by name or initials"}
                    value={q}
                    onChange={(e) => (setQ(e.target.value), setActive(0))}
                    aria-controls={listId}
                  />
                </label>
              ) : null}
              <ul ref={list} id={listId} role="listbox" className="thin-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-contain p-1.5">
                {shown.map((o, i) => {
                  const on = o.value === value;
                  return (
                    <li key={o.value} role="option" aria-selected={on} aria-disabled={o.disabled || undefined} data-active={i === active}
                      onPointerMove={() => i !== active && setActive(i)}
                      onClick={() => pick(o)}
                      className={cn(
                        "flex min-h-10 cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-[14.5px] leading-snug",
                        i === active && "bg-surface-2",
                        on && "bg-primary-soft font-semibold text-ink",
                        o.disabled && "cursor-not-allowed opacity-45",
                      )}>
                      <span className="min-w-0 flex-1 break-words">{o.label || "—"}</span>
                      {on ? <Check className="size-4 shrink-0 text-primary" aria-hidden /> : null}
                    </li>
                  );
                })}
                {shown.length ? null : <li className="px-3 py-3 text-center text-[13.5px] text-muted">{rtl() ? "لا توجد نتيجة" : "No match"}</li>}
              </ul>
            </div>,
            document.body,
          )
        : null}
    </Field>
  );
}
