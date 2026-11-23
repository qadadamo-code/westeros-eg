/** Modifiers, notes and qty for one item before it goes on the ticket. */
import { useEffect, useMemo, useState } from "react";
import { motion } from "motion/react";
import { Check, CircleAlert } from "lucide-react";
import type { MenuItem, Modifier, ModifierGroup, OrderItem } from "@/data/types";
import { useT } from "@/i18n/i18n";
import { cn } from "@/lib/cn";
import { formatMoney } from "@/lib/money";
import { AnimatedMoney, Badge, Button, Dialog, spring, useHotkeys, useReduced } from "@/ui";
import { Stepper } from "./bits";

export interface ModifierChoice {
  modifiers: Modifier[];
  qty: number;
  notes: string;
  seat: number | null;
  course: number;
}


export function ModifierSheet({ item, groups, mods, guests: _guests, seat: seat0, course: course0, edit, quickNotes, onClose, onAdd }: {
  item: MenuItem | null;
  /** quick-note buttons: the notes cashiers type most (Mohammed 2026-11-23), not a fixed list */
  quickNotes?: string[];
  /** a line already on the ticket: the sheet opens with its options, qty and notes, and saves over it */
  edit?: OrderItem | null;
  groups: ModifierGroup[];
  mods: Modifier[];
  guests: number;
  seat: number | null;
  course: number;
  onClose: () => void;
  onAdd: (c: ModifierChoice) => void;
}) {
  const { L, loc, lang } = useT();
  const reduced = useReduced();
  const itemGroups = useMemo(() => (item ? item.modifierGroupIds.map((id) => groups.find((g) => g.id === id)).filter((g): g is ModifierGroup => !!g) : []), [item, groups]);
  const [picked, setPicked] = useState<Record<string, string[]>>({});
  const [qty, setQty] = useState(1);
  const [notes, setNotes] = useState("");
  // seat and course are not asked any more (Mohammed 2026-11-23); an edited line keeps its own
  const [seat, setSeat] = useState<number | null>(seat0);
  const [course, setCourse] = useState(course0);
  const quick = quickNotes ?? [];
  const [tried, setTried] = useState(false);

  useEffect(() => {
    if (!item) return;
    const init: Record<string, string[]> = {};
    for (const g of itemGroups)
      init[g.id] = edit
        ? edit.modifiers.filter((m) => m.groupId === g.id && mods.some((x) => x.id === m.modifierId)).map((m) => m.modifierId)
        : mods.filter((m) => m.groupId === g.id && m.isDefault && m.available).map((m) => m.id).slice(0, g.max);
    setPicked(init);
    setQty(edit?.qty ?? 1);
    setNotes(edit?.notes ?? "");
    setSeat(edit ? edit.seat : seat0);
    setCourse(edit?.course ?? course0);
    setTried(false);
  }, [item?.id, edit?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const chosen = useMemo(() => Object.values(picked).flat().map((id) => mods.find((m) => m.id === id)).filter((m): m is Modifier => !!m), [picked, mods]);
  const missing = itemGroups.filter((g) => (picked[g.id]?.length ?? 0) < g.min || mods.some((m) => { const n = (picked[g.id] ?? []).filter((x) => x === m.id).length; return m.groupId === g.id && n > 0 && n < (m.minQty ?? 0); }));
  const unit = (item?.price ?? 0) + chosen.reduce((a, m) => a + m.price, 0);

  // how many times an option may be picked (المنيو، زي Bonbell): 1 = on/off, more = a counter, 0 = no limit
  const limitOf = (m: Modifier) => m.maxQty ?? 1;
  const countOf = (g: ModifierGroup, m: Modifier) => (picked[g.id] ?? []).filter((x) => x === m.id).length;
  const toggle = (g: ModifierGroup, m: Modifier) =>
    setPicked((p) => {
      const cur = p[g.id] ?? [];
      const lim = limitOf(m);
      if (g.max === 1 && lim === 1) return { ...p, [g.id]: cur[0] === m.id && g.min === 0 ? [] : [m.id] };
      const n = cur.filter((x) => x === m.id).length;
      if (lim === 1 && n) return { ...p, [g.id]: cur.filter((x) => x !== m.id) };
      if (lim !== 0 && n >= lim) return p;
      if (cur.length >= g.max) return g.max === 1 ? { ...p, [g.id]: [m.id] } : p;
      return { ...p, [g.id]: [...cur, m.id] };
    });
  const less = (g: ModifierGroup, m: Modifier) =>
    setPicked((p) => {
      const cur = [...(p[g.id] ?? [])];
      const i = cur.lastIndexOf(m.id);
      if (i >= 0) cur.splice(i, 1);
      return { ...p, [g.id]: cur };
    });

  const submit = () => {
    setTried(true);
    if (missing.length) return;
    onAdd({ modifiers: chosen, qty, notes: notes.trim(), seat, course });
  };
  useHotkeys({ "mod+enter": submit }, { enabled: !!item, inInputs: true });

  return (
    <Dialog
      open={!!item}
      onClose={onClose}
      size="lg"
      title={item ? loc(item.name) : ""}
      description={item ? loc(item.description) : undefined}
      footer={
        <div className="flex w-full flex-wrap items-center gap-3">
          <Stepper value={qty} onChange={setQty} min={1} label={L("الكمية", "Quantity")} />
          <div className="flex-1" />
          <Button size="lg" onClick={submit} className="min-w-52" data-autofocus>
            {edit ? L("حفظ التعديل", "Save changes") : L("ضيف", "Add")} · <AnimatedMoney value={unit * qty} />
          </Button>
        </div>
      }
    >
      <div className="grid gap-5">
        {itemGroups.map((g) => {
          const opts = mods.filter((m) => m.groupId === g.id);
          const n = picked[g.id]?.length ?? 0;
          const bad = tried && n < g.min;
          return (
            <fieldset key={g.id} className={cn("-mx-2 rounded-2xl p-2 transition-colors", bad && "bg-danger-soft/50 ring-2 ring-danger/40")}>
              <legend className="contents">
                <span className="flex w-full items-center gap-2 text-[15px] font-semibold">
                {loc(g.name)}
                {g.min > 0 ? <Badge tone={bad ? "danger" : "brass"} size="sm">{L("مطلوب", "Required")}</Badge> : <Badge size="sm">{L("اختياري", "Optional")}</Badge>}
                <span className="text-[12.5px] font-medium text-muted">
                  {g.max === 1 ? L("اختار واحد", "Pick one") : L(`لحد ${g.max}`, `Up to ${g.max}`)}
                </span>
                </span>
              </legend>
              <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3" role={g.max === 1 ? "radiogroup" : "group"} aria-label={loc(g.name)}>
                {opts.map((m) => {
                  const c = countOf(g, m);
                  const on = c > 0;
                  const lim = limitOf(m);
                  const counter = lim !== 1;
                  const full = (!on || counter) && g.max > 1 && n >= g.max;
                  return (
                    <div key={m.id} className="relative">
                    <motion.button
                      type="button"
                      role={g.max === 1 && !counter ? "radio" : "checkbox"}
                      aria-checked={on}
                      disabled={!m.available || full || (counter && lim !== 0 && c >= lim)}
                      whileTap={reduced ? undefined : { scale: 0.96 }}
                      transition={spring.snappy}
                      onClick={() => toggle(g, m)}
                      className={cn(
                        "flex min-h-14 w-full items-center gap-2.5 rounded-xl border px-3 py-2 text-start transition-colors disabled:opacity-40",
                        on ? "border-primary bg-primary-soft text-ink" : "border-line bg-surface hover:border-line-strong",
                        counter && on && "disabled:opacity-100",
                      )}
                    >
                      <span className={cn("num grid size-5 shrink-0 place-items-center border-2 text-[11px] font-bold transition-colors", g.max === 1 && !counter ? "rounded-full" : "rounded-md", on ? "border-primary bg-primary text-primary-ink" : "border-line-strong")}>
                        {on ? (counter ? c : <Check className="size-3.5" strokeWidth={3} />) : null}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[14.5px] font-semibold leading-tight">{loc(m.name)}</span>
                        {m.price ? (
                          <span className="num text-[12.5px] text-muted" dir="ltr">
                            +{formatMoney(m.price, { lang, compact: true, bare: true })}
                          </span>
                        ) : null}
                      </span>
                    </motion.button>
                    {counter && on ? (
                      <button type="button" onClick={() => less(g, m)} aria-label={L("شيل واحد", "Remove one")} className="absolute end-1.5 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-lg border border-line bg-surface text-[18px] font-bold hover:bg-surface-2">−</button>
                    ) : null}
                    </div>
                  );
                })}
              </div>
            </fieldset>
          );
        })}

        <div>
          <label htmlFor="mod-notes" className="mb-2 block text-[13px] font-semibold text-ink-2">
            {L("ملاحظات للمطبخ", "Kitchen notes")}
          </label>
          <div className="mb-2 flex flex-wrap gap-1.5">
            {quick.map((n) => (
              <button key={n} type="button" onClick={() => setNotes((v) => (v.includes(n) ? v : v ? `${v}، ${n}` : n))} className="h-9 rounded-full border border-line bg-surface-2 px-3 text-[13px] font-medium hover:bg-surface-3">
                {n}
              </button>
            ))}
          </div>
          <textarea id="mod-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} maxLength={140} className="w-full rounded-xl border border-line bg-surface px-3.5 py-2.5 text-[15px] outline-none focus:border-primary focus:shadow-[var(--sf-glow)]" placeholder={L("مثلاً: الصوص على جنب", "e.g. sauce on the side")} />
        </div>
        {tried && missing.length ? (
          <p className="flex items-center gap-2 text-[14px] font-semibold text-danger" role="alert">
            <CircleAlert className="size-4" /> {L("اختار", "Choose")}: {missing.map((g) => loc(g.name)).join("، ")}
          </p>
        ) : null}
      </div>
    </Dialog>
  );
}
