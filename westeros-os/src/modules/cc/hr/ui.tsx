/** Shared pieces of the HR screens: pickers, the generic record form (with the extra fields management adds), list editor. */
import { useMemo, useState, type ReactNode } from "react";
import { Pencil, Plus, Search, Trash2, ArrowUp, ArrowDown } from "lucide-react";
import { useDb } from "@/data/hooks";
import type { HrDoc } from "@/data/hrDocTypes";
import { Badge, Button, Card, CardHeader, Dialog, Field, IconButton, Input, Select, Switch, Textarea, useToast, type SelectProps, type Tone } from "@/ui";
import { cn } from "@/lib/cn";
import { useArea } from "../useAccess";
import { fmt, fromText, toText, Confirm } from "../finance/ui";
import { activeOpts, newId, type CustomField, type FieldType, type Opt } from "./model";
import { removeDoc, saveDoc } from "./ops";
import type { Hrx } from "./useHrx";

/** Select that hands back the chosen value */
export function Sel({ onChange, ...p }: Omit<SelectProps, "onChange"> & { onChange: (v: string) => void }) {
  return <Select {...p} onChange={(e) => onChange(e.target.value)} />;
}
export const err = (e: unknown) => String((e as Error)?.message ?? e);
export const dmy = (d: string | null | undefined) => (d ? d.split("-").reverse().join("/") : "—");

/** الراتب والمبالغ: hidden without رؤية الرواتب */
export const money = (hrx: Hrx, u: number) => (hrx.may("hr.salary") || hrx.staff?.role === "owner" ? fmt(u) : "••••");

export function MemberSelect({ hrx, value, onChange, label = "الموظف", all, className, filter, disabled }: { hrx: Hrx; value: string; onChange: (id: string) => void; label?: string; all?: string; className?: string; filter?: (m: Hrx["members"][number]) => boolean; disabled?: boolean }) {
  const list = hrx.visible.filter((m) => (filter ? filter(m) : m.active || m.id === value));
  return <Sel label={label} className={className} disabled={disabled} value={value} onChange={(v) => onChange(v)} options={[...(all !== undefined ? [{ value: "", label: all }] : [{ value: "", label: "اختر الموظف" }]), ...list.map((m) => ({ value: m.id, label: m.name }))]} />;
}
export function OptSelect({ opts, value, onChange, label, none, className }: { opts: Opt[]; value: string; onChange: (id: string) => void; label: string; none?: string; className?: string }) {
  return <Sel label={label} className={className} value={value} onChange={(v) => onChange(v)} options={[...(none !== undefined ? [{ value: "", label: none }] : []), ...activeOpts(opts).concat(opts.filter((o) => o.id === value && o.active === false)).map((o) => ({ value: o.id, label: o.name }))]} />;
}
export function StatusBadge({ label, tone }: { label: string; tone: Tone }) {
  return <Badge size="sm" tone={tone}>{label}</Badge>;
}
export function ReadOnlyNote({ show, what }: { show: boolean; what: string }) {
  return show ? <p className="rounded-xl border border-line px-3 py-2 text-[13.5px] text-muted">للمشاهدة بس: الدور بتاعك مالوش صلاحية {what}.</p> : null;
}
export function SearchBox({ value, onChange, placeholder = "بحث" }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return <Input aria-label={placeholder} placeholder={placeholder} icon={<Search />} value={value} onChange={(e) => onChange(e.target.value)} />;
}
export function Kpi({ label, value, sub, tone = "neutral" }: { label: string; value: ReactNode; sub?: ReactNode; tone?: Tone }) {
  return (
    <Card className="grid gap-1 p-4">
      <span className="text-[12.5px] font-semibold text-muted">{label}</span>
      <span className={cn("text-[24px] font-bold tabular-nums", tone === "danger" && "text-danger", tone === "warn" && "text-warn", tone === "ok" && "text-ok")}>{value}</span>
      {sub ? <span className="text-[12.5px] text-muted">{sub}</span> : null}
    </Card>
  );
}

/* ───────── the extra fields management adds to a form ───────── */

export function CustomInputs({ fields, values, onChange }: { fields: CustomField[] | undefined; values: Record<string, string>; onChange: (v: Record<string, string>) => void }) {
  if (!fields?.length) return null;
  return (
    <>
      {fields.map((f) => <AnyInput key={f.id} type={f.type} label={f.label + (f.required ? " *" : "")} options={f.options} value={values[f.id] ?? ""} onChange={(v) => onChange({ ...values, [f.id]: v })} />)}
    </>
  );
}
export function AnyInput({ type, label, value, onChange, options, className }: { type: FieldType; label: string; value: string; onChange: (v: string) => void; options?: string[]; className?: string }) {
  if (type === "select") return <Sel label={label} className={className} value={value} onChange={onChange} options={[{ value: "", label: "—" }, ...(options ?? []).map((x) => ({ value: x, label: x }))]} />;
  if (type === "yesno") return <Sel label={label} className={className} value={value} onChange={onChange} options={[{ value: "", label: "—" }, { value: "نعم", label: "نعم" }, { value: "لا", label: "لا" }]} />;
  if (type === "textarea") return <div className={cn("sm:col-span-2", className)}><Textarea label={label} rows={2} value={value} onChange={(e) => onChange(e.target.value)} /></div>;
  return <Input label={label} className={className} type={type === "number" ? "text" : type === "date" ? "date" : "text"} inputMode={type === "number" ? "decimal" : undefined} dir={type === "number" || type === "date" ? "ltr" : undefined} value={value} onChange={(e) => onChange(e.target.value)} />;
}
export const missingCustom = (fields: CustomField[] | undefined, values: Record<string, string>) => (fields ?? []).find((f) => f.required && !String(values[f.id] ?? "").trim())?.label ?? "";

/* ───────── generic record screens ───────── */

export type FSpec =
  | { key: string; label: string; type: "text" | "textarea" | "date" | "number" | "money"; span?: boolean; hint?: string; required?: boolean }
  | { key: string; label: string; type: "select"; options: { value: string; label: string }[]; span?: boolean; required?: boolean; hint?: string }
  | { key: string; label: string; type: "member"; required?: boolean; span?: boolean; hint?: string }
  | { key: string; label: string; type: "switch"; span?: boolean; hint?: string; required?: boolean }
  | { key: string; label: string; type: "multi"; options: { value: string; label: string }[]; span?: boolean; hint?: string; required?: boolean };

/** the top-level columns a form may set; every other key goes into data */
const TOP = new Set(["name", "date", "memberId", "status", "branchId", "code"]);
export type Vals = Record<string, unknown>;
export const valsOf = (d: HrDoc | null, defaults: Vals): Vals => (d ? { ...defaults, ...d.data, name: d.name, date: d.date, memberId: d.memberId, status: d.status, branchId: d.branchId, code: d.code } : { ...defaults });

export function DocDialog({ hrx, kind, row, title, fields, defaults, onClose, check, after, size = "lg", extra }: {
  hrx: Hrx; kind: string; row: HrDoc | null; title: string; fields: FSpec[]; defaults: Vals; onClose: () => void;
  check?: (v: Vals) => string; after?: (saved: HrDoc, v: Vals, db: ReturnType<typeof useDb>) => Promise<void> | void; size?: "md" | "lg" | "xl"; extra?: (v: Vals, set: (p: Vals) => void) => ReactNode;
}) {
  const db = useDb();
  const { toast } = useToast();
  const [v, setV] = useState<Vals>(() => valsOf(row, defaults));
  const [busy, setBusy] = useState(false);
  const set = (p: Vals) => setV((x) => ({ ...x, ...p }));
  const custom = hrx.settings.customFields[kind];
  const save = async () => {
    const miss = fields.find((f) => f.required && (v[f.key] == null || v[f.key] === "" || (Array.isArray(v[f.key]) && !(v[f.key] as unknown[]).length)));
    if (miss) return toast({ tone: "error", title: `اكتب ${miss.label}` });
    const c = missingCustom(custom, (v.custom as Record<string, string>) ?? {});
    if (c) return toast({ tone: "error", title: `اكتب ${c}` });
    const problem = check?.(v);
    if (problem) return toast({ tone: "error", title: problem });
    setBusy(true);
    try {
      const top: Record<string, unknown> = {}, data: Record<string, unknown> = {};
      for (const [k, x] of Object.entries(v)) (TOP.has(k) ? top : data)[k] = x;
      const name = String(top.name ?? "") || (top.memberId ? hrx.name(String(top.memberId)) : "");
      const saved = await saveDoc(db, row, { kind, name, date: (top.date as string) || null, memberId: (top.memberId as string) || null, status: (top.status as string) || row?.status || "active", branchId: (top.branchId as string) ?? (top.memberId ? hrx.memberById.get(String(top.memberId))?.branchIds[0] ?? null : null), data });
      await after?.(saved, v, db);
      toast({ tone: "success", title: "تم الحفظ" });
      onClose();
    } catch (e) { toast({ tone: "error", title: "تعذر الحفظ", description: err(e) }); } finally { setBusy(false); }
  };
  return (
    <Dialog open onClose={onClose} size={size} title={title} footer={<div className="flex justify-end gap-2"><Button variant="ghost" onClick={onClose}>إلغاء</Button><Button loading={busy} onClick={save}>حفظ</Button></div>}>
      <div className="grid gap-3 sm:grid-cols-2">
        {fields.map((f) => <SpecInput key={f.key} hrx={hrx} f={f} v={v} set={set} />)}
        <CustomInputs fields={custom} values={(v.custom as Record<string, string>) ?? {}} onChange={(c) => set({ custom: c })} />
        {extra?.(v, set)}
      </div>
    </Dialog>
  );
}

function SpecInput({ hrx, f, v, set }: { hrx: Hrx; f: FSpec; v: Vals; set: (p: Vals) => void }) {
  const span = f.span || f.type === "textarea" || f.type === "multi" ? "sm:col-span-2" : "";
  const label = f.label + (f.required ? " *" : "");
  const s = (x: unknown) => (x == null ? "" : String(x));
  switch (f.type) {
    case "text": return <div className={span}><Input label={label} hint={f.hint} value={s(v[f.key])} onChange={(e) => set({ [f.key]: e.target.value })} /></div>;
    case "number": return <div className={span}><Input label={label} hint={f.hint} dir="ltr" inputMode="decimal" value={s(v[f.key])} onChange={(e) => set({ [f.key]: e.target.value === "" ? "" : Number(e.target.value) || 0 })} /></div>;
    case "money": return <div className={span}><Input label={label} hint={f.hint} dir="ltr" inputMode="decimal" placeholder="0" defaultValue={toText(Number(v[f.key] ?? 0))} onChange={(e) => set({ [f.key]: fromText(e.target.value) })} /></div>;
    case "date": return <div className={span}><Input label={label} hint={f.hint} type="date" dir="ltr" value={s(v[f.key])} onChange={(e) => set({ [f.key]: e.target.value || null })} /></div>;
    case "textarea": return <div className={span}><Textarea label={label} hint={f.hint} rows={3} value={s(v[f.key])} onChange={(e) => set({ [f.key]: e.target.value })} /></div>;
    case "select": return <div className={span}><Sel label={label} hint={f.hint} value={s(v[f.key])} onChange={(x) => set({ [f.key]: x || null })} options={f.options} /></div>;
    case "member": return <div className={span}><MemberSelect hrx={hrx} label={label} value={s(v[f.key])} onChange={(x) => set({ [f.key]: x || null })} /></div>;
    case "switch": return <div className={cn("sm:col-span-2")}><Switch checked={!!v[f.key]} onChange={(x) => set({ [f.key]: x })} label={f.label} description={f.hint} /></div>;
    case "multi": {
      const cur = new Set((v[f.key] as string[]) ?? []);
      return (
        <Field label={label} hint={f.hint} className={span}>
          <div className="flex flex-wrap gap-1.5">
            {f.options.map((o) => (
              <button key={o.value} type="button" onClick={() => { const n = new Set(cur); if (n.has(o.value)) n.delete(o.value); else n.add(o.value); set({ [f.key]: [...n] }); }}
                className={cn("rounded-full border px-3 py-1 text-[13px]", cur.has(o.value) ? "border-primary bg-primary/15 font-semibold" : "border-line text-muted")}>{o.label}</button>
            ))}
            {f.options.length ? null : <span className="text-[13px] text-muted">مفيش اختيارات لسه.</span>}
          </div>
        </Field>
      );
    }
  }
}

/** a delete button that asks first; a row that other records point at is stopped instead */
export function useRemove() {
  const db = useDb();
  const { toast } = useToast();
  const [drop, setDrop] = useState<HrDoc | null>(null);
  const [busy, setBusy] = useState(false);
  const node = (
    <Confirm open={!!drop} onClose={() => setDrop(null)} danger loading={busy} title="حذف" confirmLabel="حذف" description={`هيتحذف "${drop?.name || drop?.code}" نهائياً. تقدر ترجعه من السجل والاسترجاع.`}
      onConfirm={async () => { if (!drop) return; setBusy(true); try { await removeDoc(db, drop.id); toast({ tone: "success", title: "تم الحذف" }); setDrop(null); } catch (e) { toast({ tone: "error", title: "تعذر الحذف", description: err(e) }); } finally { setBusy(false); } }} />
  );
  return { ask: setDrop, node };
}

export function RowActions({ onEdit, onDelete, children }: { onEdit?: () => void; onDelete?: () => void; children?: ReactNode }) {
  const r = useArea();
  return (
    <span className="flex items-center justify-end gap-0.5">
      {children}
      {onEdit && r.edit ? <IconButton label="تعديل" size="sm" onClick={onEdit}><Pencil /></IconButton> : null}
      {onDelete && r.delete ? <IconButton label="حذف" size="sm" onClick={onDelete}><Trash2 /></IconButton> : null}
    </span>
  );
}

/* ───────── list editor (settings): add, rename, stop, reorder, delete ───────── */

export interface ColSpec<T> { key: keyof T & string; label: string; type: "text" | "number" | "switch" | "select"; options?: { value: string; label: string }[]; width?: string }
export function ListEditor<T extends { id: string; name?: string; active?: boolean }>({ title, subtitle, items, onSave, cols, blank, readOnly, render }: {
  title: string; subtitle?: string; items: T[]; onSave: (items: T[]) => Promise<void>; cols: ColSpec<T>[]; blank: () => T; readOnly?: boolean;
  /** an extra editor under a row (e.g. a ladder or a task list) */
  render?: (row: T, set: (row: T) => void) => ReactNode;
}) {
  const { toast } = useToast();
  const [rows, setRows] = useState<T[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const list = rows ?? items;
  const dirty = rows !== null;
  const setRow = (i: number, r: T) => setRows(list.map((x, j) => (j === i ? r : x)));
  const move = (i: number, d: number) => { const n = [...list]; const j = i + d; if (j < 0 || j >= n.length) return; [n[i], n[j]] = [n[j], n[i]]; setRows(n); };
  const save = async () => {
    if (list.some((r) => "name" in r && !String(r.name ?? "").trim())) return toast({ tone: "error", title: "في سطر من غير اسم" });
    setBusy(true);
    try { await onSave(list); setRows(null); toast({ tone: "success", title: "تم الحفظ" }); } catch (e) { toast({ tone: "error", title: "تعذر الحفظ", description: err(e) }); } finally { setBusy(false); }
  };
  return (
    <Card>
      <CardHeader title={title} subtitle={subtitle} action={dirty ? <div className="flex gap-2"><Button size="sm" variant="ghost" onClick={() => setRows(null)}>تراجع</Button><Button size="sm" loading={busy} onClick={save}>حفظ</Button></div> : null} />
      <div className="grid gap-2 px-5 pb-5">
        {list.map((r, i) => (
          <div key={r.id} className={cn("grid gap-2 rounded-xl border border-line p-2.5", r.active === false && "opacity-60")}>
            <div className="flex flex-wrap items-end gap-2">
              {cols.map((c) => {
                const val = r[c.key] as unknown;
                if (c.type === "switch") return <label key={c.key} className="flex h-11 items-center gap-1.5 text-[13px]"><input type="checkbox" disabled={readOnly} checked={!!val} onChange={(e) => setRow(i, { ...r, [c.key]: e.target.checked })} />{c.label}</label>;
                if (c.type === "select") return <Sel key={c.key} label={c.label} className={c.width ?? "w-40"} disabled={readOnly} value={String(val ?? "")} onChange={(x) => setRow(i, { ...r, [c.key]: x })} options={c.options ?? []} />;
                return <Input key={c.key} label={c.label} wrapClassName={c.width ?? (c.type === "number" ? "w-24" : "min-w-40 flex-1")} disabled={readOnly} dir={c.type === "number" ? "ltr" : undefined} inputMode={c.type === "number" ? "decimal" : undefined}
                  value={String(val ?? "")} onChange={(e) => setRow(i, { ...r, [c.key]: c.type === "number" ? (e.target.value === "" ? 0 : Number(e.target.value) || 0) : e.target.value })} />;
              })}
              <span className="ms-auto flex items-center">
                {"active" in r || r.active !== undefined ? <label className="flex h-11 items-center gap-1.5 px-1 text-[13px]"><input type="checkbox" disabled={readOnly} checked={r.active !== false} onChange={(e) => setRow(i, { ...r, active: e.target.checked })} />شغال</label> : null}
                {render ? <Button size="sm" variant="ghost" onClick={() => setOpen(open === r.id ? null : r.id)}>{open === r.id ? "إخفاء التفاصيل" : "التفاصيل"}</Button> : null}
                <IconButton label="لفوق" size="sm" disabled={readOnly || i === 0} onClick={() => move(i, -1)}><ArrowUp /></IconButton>
                <IconButton label="لتحت" size="sm" disabled={readOnly || i === list.length - 1} onClick={() => move(i, 1)}><ArrowDown /></IconButton>
                <IconButton label="حذف" size="sm" disabled={readOnly} onClick={() => setRows(list.filter((_, j) => j !== i))}><Trash2 /></IconButton>
              </span>
            </div>
            {render && open === r.id ? <div className="rounded-lg bg-surface-2 p-2.5">{render(r, (x) => setRow(i, x))}</div> : null}
          </div>
        ))}
        {list.length ? null : <p className="rounded-xl border border-dashed border-line px-3 py-4 text-center text-[13.5px] text-muted">القائمة فاضية.</p>}
        {readOnly ? null : <div><Button size="sm" variant="outline" icon={<Plus />} onClick={() => setRows([...list, { ...blank(), id: newId() }])}>إضافة</Button></div>}
      </div>
    </Card>
  );
}

/** a free list of short texts (options of a field, tasks …) */
export function TextList({ items, onChange, placeholder, readOnly }: { items: string[]; onChange: (x: string[]) => void; placeholder?: string; readOnly?: boolean }) {
  const [t, setT] = useState("");
  return (
    <div className="grid gap-1.5">
      <div className="flex flex-wrap gap-1.5">{items.map((x, i) => <span key={i} className="inline-flex items-center gap-1 rounded-full border border-line px-2.5 py-0.5 text-[13px]">{x}{readOnly ? null : <button type="button" aria-label="حذف" className="text-muted" onClick={() => onChange(items.filter((_, j) => j !== i))}>×</button>}</span>)}</div>
      {readOnly ? null : <div className="flex gap-2"><Input aria-label={placeholder} placeholder={placeholder} value={t} onChange={(e) => setT(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && t.trim()) { e.preventDefault(); onChange([...items, t.trim()]); setT(""); } }} /><Button size="sm" variant="secondary" disabled={!t.trim()} onClick={() => { onChange([...items, t.trim()]); setT(""); }}>إضافة</Button></div>}
    </div>
  );
}

export const useSorted = <T,>(rows: T[], key: (r: T) => string, desc = true) => useMemo(() => [...rows].sort((a, b) => (desc ? key(b).localeCompare(key(a)) : key(a).localeCompare(key(b)))), [rows, key, desc]);
