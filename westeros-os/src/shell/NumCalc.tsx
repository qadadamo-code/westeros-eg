/**
 * آلة حاسبة: Ctrl+C on any number field opens a small calculator that starts from the field's value and puts the result back in it.
 * When some of the field's text is selected, Ctrl+C copies as usual.
 */
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Calculator, X } from "lucide-react";
import { cn } from "@/lib/cn";

/** a number field: type=number, or a text field asking for a decimal or numeric keyboard */
export function isNumberField(el: Element | null): el is HTMLInputElement {
  if (!(el instanceof HTMLInputElement) || el.disabled || el.readOnly) return false;
  if (el.type === "number") return true;
  const mode = el.inputMode || el.getAttribute("inputmode") || "";
  return (el.type === "text" || el.type === "tel" || el.type === "") && (mode === "decimal" || mode === "numeric");
}

const OPS: Record<string, [number, (a: number, b: number) => number]> = { "+": [1, (a, b) => a + b], "-": [1, (a, b) => a - b], "×": [2, (a, b) => a * b], "÷": [2, (a, b) => a / b] };
/** Works out "12+3×4" (× ÷ before + −, a leading minus, % of the number before it). No eval. Returns null when it doesn't read. */
export function calc(expr: string): number | null {
  const t = expr.replace(/[*xX]/g, "×").replace(/\//g, "÷").replace(/[٫,]/g, ".").replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))).replace(/\s+/g, "");
  if (!t) return null;
  const tokens = t.match(/\d*\.?\d+%?|[+\-×÷]/g);
  if (!tokens || tokens.join("") !== t) return null;
  const out: number[] = [];
  const ops: string[] = [];
  const apply = () => { const o = ops.pop()!; const b = out.pop(); const a = out.pop(); if (a === undefined || b === undefined) throw new Error(); out.push(OPS[o][1](a, b)); };
  let expectNum = true;
  let neg = false;
  try {
    for (const k of tokens) {
      if (k in OPS) {
        if (expectNum) { if (k === "-") { neg = !neg; continue; } if (k === "+") continue; return null; }
        while (ops.length && OPS[ops[ops.length - 1]][0] >= OPS[k][0]) apply();
        ops.push(k); expectNum = true;
      } else {
        let n = parseFloat(k);
        if (k.endsWith("%")) n = n / 100 * (ops.length && "+-".includes(ops[ops.length - 1]) && out.length ? out[out.length - 1] : 1);
        out.push(neg ? -n : n); neg = false; expectNum = false;
      }
    }
    if (expectNum) { ops.pop(); }
    while (ops.length) apply();
  } catch { return null; }
  const r = out.pop();
  return r === undefined || !Number.isFinite(r) || out.length ? null : Math.round(r * 1e6) / 1e6;
}

/** puts a value in a React-controlled input the way typing would */
function fill(el: HTMLInputElement, value: string) {
  const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  set?.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

const KEYS = ["C", "⌫", "%", "÷", "7", "8", "9", "×", "4", "5", "6", "-", "1", "2", "3", "+", "0", ".", "="];

export function NumCalc() {
  const [field, setField] = useState<HTMLInputElement | null>(null);
  const [expr, setExpr] = useState("");
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.ctrlKey || e.altKey || e.shiftKey || e.metaKey || e.key.toLowerCase() !== "c" && e.code !== "KeyC") return;
      const el = document.activeElement;
      if (!isNumberField(el)) return;
      try { if (el.selectionStart !== el.selectionEnd) return; } catch { /* type=number has no selection */ }
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const w = 264, h = 340;
      setPos({ top: Math.max(8, Math.min(r.bottom + 6, window.innerHeight - h - 8)), left: Math.max(8, Math.min(r.right - w, window.innerWidth - w - 8)) });
      setExpr(el.value.replace(/,/g, "").trim());
      setField(el);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);

  useEffect(() => { if (field) box.current?.focus(); }, [field]);

  if (!field) return null;
  const result = calc(expr);
  const close = (put: boolean) => {
    const el = field;
    setField(null);
    if (put && result !== null) fill(el, String(result));
    el.focus();
  };
  const press = (k: string) => {
    if (k === "C") return setExpr("");
    if (k === "⌫") return setExpr((x) => x.slice(0, -1));
    if (k === "=") return result !== null ? setExpr(String(result)) : undefined;
    setExpr((x) => x + k);
  };
  const onKey = (e: React.KeyboardEvent) => {
    e.stopPropagation();
    const k = e.key;
    if (k === "Escape") { e.preventDefault(); return close(false); }
    if (k === "Enter") { e.preventDefault(); return close(true); }
    if (k === "Backspace") { e.preventDefault(); return press("⌫"); }
    if (k === "Delete") { e.preventDefault(); return press("C"); }
    const map: Record<string, string> = { "*": "×", x: "×", "/": "÷", ",": ".", "٫": "." };
    const v = map[k] ?? k;
    if (/^[0-9.+\-×÷%=]$/.test(v)) { e.preventDefault(); press(v); }
  };

  return createPortal(
    <div className="fixed inset-0 z-[90]" onMouseDown={(e) => { if (e.target === e.currentTarget) close(false); }}>
      <div ref={box} tabIndex={-1} role="dialog" aria-label="آلة حاسبة" onKeyDown={onKey} dir="ltr"
        style={{ top: pos.top, left: pos.left, width: 264 }}
        className="absolute grid gap-2 rounded-2xl border border-line bg-surface p-3 shadow-sf-lg outline-none">
        <div className="flex items-center justify-between" dir="rtl">
          <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-muted [&_svg]:size-4"><Calculator />آلة حاسبة</span>
          <button type="button" aria-label="إغلاق" onClick={() => close(false)} className="grid size-7 place-items-center rounded-lg text-muted hover:bg-surface-2 hover:text-ink [&_svg]:size-4"><X /></button>
        </div>
        <div className="grid gap-0.5 rounded-xl bg-surface-2 px-3 py-2 text-end">
          <span className="num min-h-[20px] truncate text-[13px] text-muted">{expr || "0"}</span>
          <span className="num truncate text-[22px] font-bold">{result === null ? (expr ? "—" : "0") : result.toLocaleString("en-US", { maximumFractionDigits: 6 })}</span>
        </div>
        <div className="grid grid-cols-4 gap-1.5">
          {KEYS.map((k) => (
            <button key={k} type="button" onClick={() => press(k)}
              className={cn("h-10 rounded-xl text-[16px] font-semibold transition-colors",
                k === "=" ? "col-span-1 bg-surface-2 text-ink hover:bg-line" : /[÷×+\-%]/.test(k) ? "bg-brass-soft text-brass-text hover:brightness-95" : k === "C" || k === "⌫" ? "bg-surface-2 text-danger hover:bg-line" : "border border-line bg-surface text-ink hover:bg-surface-2",
                k === "0" && "col-span-2")}>{k}</button>
          ))}
        </div>
        <button type="button" disabled={result === null} onClick={() => close(true)} className="h-10 rounded-xl bg-ink text-[14px] font-bold text-surface disabled:opacity-40" dir="rtl">ضع الناتج في الخانة (Enter)</button>
      </div>
    </div>,
    document.body,
  );
}
