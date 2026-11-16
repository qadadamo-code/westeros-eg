/**
 * Digits typed on an Arabic keyboard become ordinary digits (0-9) in every field, as they are typed or pasted, so
 * nobody has to switch the keyboard language to enter a number. The Arabic decimal mark becomes a dot.
 */
const ARABIC = /[٠-٩۰-۹٫]/;
const toLatin = (s: string) =>
  s
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
    .replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
    .replace(/٫/g, ".");

export function initLatinDigits() {
  if (typeof document === "undefined") return;
  // capture phase: the value is already converted when the app's own handlers read it
  document.addEventListener(
    "input",
    (e) => {
      const el = e.target;
      if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) return;
      if ((e as InputEvent).isComposing || !ARABIC.test(el.value)) return;
      const proto = el instanceof HTMLInputElement ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype;
      const set = Object.getOwnPropertyDescriptor(proto, "value")?.set;
      if (!set) return;
      let start: number | null = null;
      let end: number | null = null;
      try {
        start = el.selectionStart;
        end = el.selectionEnd;
      } catch {
        /* some input types have no caret */
      }
      set.call(el, toLatin(el.value));
      try {
        if (start != null && end != null) el.setSelectionRange(start, end);
      } catch {
        /* same */
      }
    },
    true,
  );
}
