/** Shared pieces of the finance screens: amounts, the period picker, the account picker, printing a table. */
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ChevronDown, Ellipsis, ListFilter, Printer } from "lucide-react";
import { cn } from "@/lib/cn";
import { useLive } from "@/data/hooks";
import { major, MONEY_MASK, moneyHidden, UNITS_PER_MAJOR, type Units } from "@/lib/money";
import { Button, Dialog, Input, Select } from "@/ui";
import type { Fin } from "./useFinance";
import { useFinPerms } from "./perms";

/**
 * رصيد الحساب جنب اختياره (Mohammed 2026-11-24): the posted balance of the picked account, for users given
 * "عرض رصيد الحساب" in المستخدمين ← الأدوار; nothing for the others.
 */
export function useBalanceHint(fin: Fin, accountId: string | null | undefined): ReactNode {
  const perms = useFinPerms();
  const show = perms.has("balances") && !!accountId;
  const bal = useMemo(() => {
    if (!show) return null;
    let n = 0;
    for (const e of fin.entries) if (e.status === "posted") for (const l of e.lines) if (l.account === accountId) n += l.debit - l.credit;
    return n;
  }, [show, fin.entries, accountId]);
  if (bal == null) return undefined;
  return <span className="num" dir="rtl">الرصيد: <b dir="ltr">{fmt(Math.abs(bal))}</b> {bal > 0 ? "مدين" : bal < 0 ? "دائن" : ""}</span>;
}

/** 1,250.00 (no currency: tables carry it in the header) */
export const fmt = (u: Units, zero = "0.00") => (moneyHidden() ? MONEY_MASK : u === 0 ? zero : new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(u / UNITS_PER_MAJOR));
/** what a number box shows for an amount */
export const toText = (u: Units | null | undefined) => (u == null || u === 0 ? "" : String(Math.round((u / UNITS_PER_MAJOR) * 100) / 100));
export const fromText = (s: string): Units => { const n = Number(String(s).replace(/,/g, "").trim()); return Number.isFinite(n) && s.trim() !== "" ? major(n) : 0; };

export function Amount({ value, className, tone, zero = "—" }: { value: Units; className?: string; tone?: "auto"; zero?: string }) {
  return <span dir="ltr" className={cn("num whitespace-nowrap", tone === "auto" && value < 0 && "text-danger", className)}>{fmt(value, zero)}</span>;
}

const pad = (n: number) => String(n).padStart(2, "0");
export const dayOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
/** today in Cairo */
export const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Cairo" }).format(new Date());

export interface Period { preset: string; from: string | null; to: string | null }
export const PRESETS: { id: string; label: string }[] = [
  { id: "all", label: "كل الفترات" }, { id: "today", label: "اليوم" }, { id: "month", label: "هذا الشهر" }, { id: "last_month", label: "الشهر الماضي" },
  { id: "quarter", label: "هذا الربع" }, { id: "year", label: "هذه السنة" }, { id: "last_year", label: "السنة الماضية" }, { id: "custom", label: "من تاريخ إلى تاريخ" },
];
/** The days a preset covers. The financial year starts on `startMonth` (1 = January). */
export function periodOf(preset: string, startMonth = 1, now = today()): Period {
  const [y, m] = now.split("-").map(Number);
  const last = (yy: number, mm: number) => new Date(yy, mm, 0).getDate();
  const fy = m >= startMonth ? y : y - 1;
  const yearRange = (start: number): [string, string] => {
    const endM = ((startMonth + 10) % 12) + 1;
    const endY = startMonth === 1 ? start : start + 1;
    return [`${start}-${pad(startMonth)}-01`, `${endY}-${pad(endM)}-${pad(last(endY, endM))}`];
  };
  switch (preset) {
    case "today": return { preset, from: now, to: now };
    case "month": return { preset, from: `${y}-${pad(m)}-01`, to: `${y}-${pad(m)}-${pad(last(y, m))}` };
    case "last_month": { const d = new Date(y, m - 2, 1); const yy = d.getFullYear(), mm = d.getMonth() + 1; return { preset, from: `${yy}-${pad(mm)}-01`, to: `${yy}-${pad(mm)}-${pad(last(yy, mm))}` }; }
    case "quarter": { const q = Math.floor((m - 1) / 3) * 3 + 1; return { preset, from: `${y}-${pad(q)}-01`, to: `${y}-${pad(q + 2)}-${pad(last(y, q + 2))}` }; }
    case "year": { const [f, t] = yearRange(fy); return { preset, from: f, to: t }; }
    case "last_year": { const [f, t] = yearRange(fy - 1); return { preset, from: f, to: t }; }
    default: return { preset: "all", from: null, to: null };
  }
}

export function PeriodPicker({ value, onChange, startMonth = 1, className }: { value: Period; onChange: (p: Period) => void; startMonth?: number; className?: string }) {
  return (
    <div className={cn("flex flex-wrap items-end gap-2 max-sm:contents", className)}>
      <Select label="الفترة" className="w-44" value={value.preset} options={PRESETS.map((p) => ({ value: p.id, label: p.label }))}
        onChange={(e) => onChange(e.target.value === "custom" ? { preset: "custom", from: value.from ?? today(), to: value.to ?? today() } : periodOf(e.target.value, startMonth))} />
      {value.preset === "custom" ? (
        <>
          <Input label="من" type="date" dir="ltr" className="w-40" value={value.from ?? ""} onChange={(e) => onChange({ ...value, from: e.target.value || null })} />
          <Input label="إلى" type="date" dir="ltr" className="w-40" value={value.to ?? ""} onChange={(e) => onChange({ ...value, to: e.target.value || null })} />
        </>
      ) : null}
    </div>
  );
}
/**
 * صف الأدوات فوق كل شاشة: the filters lead and the buttons close the row, both on one baseline.
 * On a phone the filters sit two to a row and the secondary buttons (`more`) fold under one button, so the list is never pushed off the screen.
 * `fold` keeps `more` folded on a wide screen too, for a screen with many buttons. `collapse` folds a long row of filters
 * on a phone under one button, leaving the search box (`fin-wide`) in sight.
 */
export function Toolbar({ lead, children, actions, more, fold, collapse, note, className }: { lead?: ReactNode; children?: ReactNode; collapse?: boolean; actions?: ReactNode; more?: ReactNode; fold?: boolean; note?: ReactNode; className?: string }) {
  const [open, setOpen] = useState(false);
  const [filters, setFilters] = useState(false);
  return (
    <div className={cn("flex flex-wrap items-end gap-x-3 gap-y-2.5", className)}>
      {lead ? <div className="min-w-0 max-w-full max-sm:order-0 max-sm:w-full">{lead}</div> : null}
      {children ? <div className={cn("fin-filters grid min-w-0 grid-cols-2 items-end gap-2 max-sm:order-2 max-sm:w-full sm:flex sm:flex-wrap", collapse && !filters && "fin-closed")}>{children}</div> : null}
      {note ? <div className="pb-2.5 text-[13px] text-muted max-sm:order-3 max-sm:w-full max-sm:pb-0">{note}</div> : null}
      {actions || more || (children && collapse) ? (
        <div className={cn("ms-auto flex flex-wrap items-center justify-end gap-2 max-sm:w-full max-sm:justify-start", actions ? "max-sm:order-1" : "max-sm:order-3", !actions && !more && "sm:hidden")}>
          {actions}
          {children && collapse ? <Button type="button" variant={filters ? "soft" : "secondary"} icon={<ListFilter />} aria-expanded={filters} className="sm:hidden" onClick={() => setFilters((v) => !v)}>تصفية</Button> : null}
          {more ? <Button type="button" variant="secondary" icon={<Ellipsis />} aria-expanded={open} className={cn(!fold && "sm:hidden")} onClick={() => setOpen((v) => !v)}>المزيد<ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} /></Button> : null}
          {more ? <div className={cn("flex-wrap items-center justify-end gap-2 max-sm:justify-start", open ? "flex w-full" : "hidden", !fold && "sm:contents")}>{more}</div> : null}
        </div>
      ) : null}
    </div>
  );
}
/** a small heading over a group of cards or fields */
export function GroupTitle({ children, className }: { children: ReactNode; className?: string }) {
  return <h2 className={cn("flex items-center gap-2 text-[13px] font-bold text-muted after:h-px after:flex-1 after:bg-line", className)}>{children}</h2>;
}
export const periodLabel = (p: Period) => (p.from || p.to ? `${p.from ? p.from.split("-").reverse().join("/") : "البداية"} إلى ${p.to ? p.to.split("-").reverse().join("/") : "اليوم"}` : "كل الفترات");

export function BranchSelect({ fin, value, onChange, label = "الفرع", all = "كل الفروع", className }: { fin: Fin; value: string; onChange: (id: string) => void; label?: string; all?: string | null; className?: string }) {
  // a user held to their own branches never gets "all branches", and a screen that starts on it is moved to their branch
  const only = fin.onlyBranches;
  const list = only ? fin.branches.filter((b) => only.includes(b.id)) : fin.branches;
  const forced = only && !only.includes(value) ? list[0]?.id ?? "" : null;
  useEffect(() => { if (forced != null && forced !== value) onChange(forced); }, [forced, value, onChange]);
  return <Select label={label} className={className ?? "w-44"} value={forced ?? value} onChange={(e) => onChange(e.target.value)} options={[...(all && !only ? [{ value: "", label: all }] : []), ...list.map((b) => ({ value: b.id, label: b.name.ar }))]} />;
}

/** اختيار حساب: by code or name; the list floats over the page. `leaf` shows only the accounts that take entries. */
export function AccountSelect({ fin, value, onChange, label, leaf = true, filter, placeholder = "اختر الحساب", className, manualOnly }: {
  fin: Fin; value: string; onChange: (id: string) => void; label?: ReactNode; leaf?: boolean; filter?: (a: Fin["accounts"][number]) => boolean; placeholder?: string; className?: string; manualOnly?: boolean;
}) {
  const options = useMemo(() => [
    { value: "", label: placeholder },
    ...fin.ix.ordered().filter((a) => (a.active || a.id === value) && (!leaf || a.postable) && (!manualOnly || a.allowManual || a.id === value) && (!filter || filter(a))).map((a) => ({ value: a.id, label: `${a.code} · ${a.name.ar}` })),
  ], [fin.ix, value, leaf, filter, placeholder, manualOnly]);
  const hint = useBalanceHint(fin, leaf ? value : null);
  return <Select label={label} aria-label={typeof label === "string" ? label : placeholder} className={className} value={value} onChange={(e) => onChange(e.target.value)} options={options} hint={hint} />;
}

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
export interface PrintCell { text: string | number; align?: "start" | "end"; bold?: boolean; indent?: number }
/** طباعة: opens the print dialog on a clean right-to-left page holding only this table. */
export function printTable(title: string, subtitle: string, head: string[], rows: (PrintCell | string | number)[][], foot?: (PrintCell | string | number)[]) {
  const cell = (c: PrintCell | string | number, tag = "td") => {
    const x: PrintCell = typeof c === "object" ? c : { text: c };
    return `<${tag} style="text-align:${x.align === "end" ? "left" : "right"};${x.bold ? "font-weight:700;" : ""}${x.indent ? `padding-right:${8 + x.indent * 14}px;` : ""}">${esc(x.text)}</${tag}>`;
  };
  const html = `<!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8"><title>${esc(title)}</title><style>
    @page{size:A4;margin:14mm}body{font-family:Tajawal,Arial,sans-serif;color:#000;font-size:12px}h1{font-size:18px;margin:0 0 2px}p{margin:0 0 10px;color:#444}
    table{width:100%;border-collapse:collapse}th,td{border:1px solid #999;padding:4px 8px}th{background:#eee;text-align:right}tfoot td{font-weight:700;background:#f5f5f5}
  </style></head><body><h1>${esc(title)}</h1><p>${esc(subtitle)}</p><table><thead><tr>${head.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => cell(c)).join("")}</tr>`).join("")}</tbody>${foot ? `<tfoot><tr>${foot.map((c) => cell(c)).join("")}</tr></tfoot>` : ""}</table></body></html>`;
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.style.cssText = "position:fixed;inset-inline-end:0;bottom:0;width:0;height:0;border:0";
  document.body.appendChild(frame);
  const doc = frame.contentDocument!;
  doc.open();
  doc.write(html);
  doc.close();
  setTimeout(() => {
    frame.contentWindow?.focus();
    frame.contentWindow?.print();
    setTimeout(() => frame.remove(), 60_000);
  }, 150);
}
export function PrintButton({ onClick, size }: { onClick: () => void; size?: "sm" | "md" }) {
  return <Button type="button" variant="secondary" size={size} icon={<Printer />} onClick={onClick}>طباعة</Button>;
}

/** تأكيد قبل أي حركة لا ترجع بضغطة */
export function Confirm({ open, onClose, onConfirm, title, description, confirmLabel = "تأكيد", loading, danger, children }: { open: boolean; onClose: () => void; onConfirm: () => void; title: string; description?: ReactNode; confirmLabel?: string; loading?: boolean; danger?: boolean; children?: ReactNode }) {
  return (
    <Dialog open={open} onClose={onClose} size="sm" title={title}
      footer={<div className="flex justify-end gap-2"><Button variant="ghost" onClick={onClose}>إلغاء</Button><Button variant={danger ? "danger" : "primary"} loading={loading} onClick={onConfirm}>{confirmLabel}</Button></div>}>
      {description ? <p className="text-[14.5px]">{description}</p> : null}
      {children}
    </Dialog>
  );
}

/** Prints a free page (a voucher, a statement): right-to-left, black on white. */
export function printDoc(title: string, body: string) {
  const html = `<!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8"><title>${esc(title)}</title><style>
    @page{size:A5 landscape;margin:12mm}body{font-family:Tajawal,Arial,sans-serif;color:#000;font-size:13px}h1{font-size:20px;margin:0;text-align:center}
    .row{display:flex;justify-content:space-between;gap:16px;margin:8px 0}.box{border:1px solid #000;padding:6px 10px;border-radius:4px}.lbl{color:#444}.sign{margin-top:36px;display:flex;justify-content:space-between}
    .sign span{border-top:1px solid #000;padding-top:4px;min-width:140px;text-align:center}
  </style></head><body>${body}</body></html>`;
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.style.cssText = "position:fixed;inset-inline-end:0;bottom:0;width:0;height:0;border:0";
  document.body.appendChild(frame);
  const doc = frame.contentDocument!;
  doc.open();
  doc.write(html);
  doc.close();
  setTimeout(() => { frame.contentWindow?.focus(); frame.contentWindow?.print(); setTimeout(() => frame.remove(), 60_000); }, 150);
}
export { esc };
/** a day typed in a sheet: 2026-11-18, 18/11/2026 or an Excel serial */
export function sheetDay(s: string | undefined): string | null {
  const t = String(s ?? "").trim();
  if (/^\d{4}-\d{1,2}-\d{1,2}/.test(t)) { const [y, m, d] = t.split(/[-T ]/); return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`; }
  const m = t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  const n = Number(t);
  if (Number.isFinite(n) && n > 30000 && n < 80000) return new Date(Math.round((n - 25569) * 86400000)).toISOString().slice(0, 10);
  return null;
}

/** الفروع اللي الإعداد شغال فيها (Saqr 2026-11-24): a toggle per branch (not the central kitchen); writes the branches it's off in */
export function BranchChips({ off, onChange, disabled }: { off?: string[]; onChange: (off: string[]) => void; disabled?: boolean }) {
  const branches = useLive("branches").data.filter((b) => !b.isCentral);
  if (branches.length < 2) return <span className="text-[12.5px] text-muted">كل الفروع</span>;
  const o = off ?? [];
  return (
    <div className="flex flex-wrap gap-1">
      {branches.map((b) => {
        const on = !o.includes(b.id);
        return (
          <button key={b.id} type="button" disabled={disabled} aria-pressed={on} onClick={() => onChange(on ? [...o, b.id] : o.filter((x) => x !== b.id))}
            className={on ? "h-8 rounded-lg border border-primary bg-primary-soft px-2.5 text-[12.5px] font-semibold" : "h-8 rounded-lg border border-line px-2.5 text-[12.5px] text-muted"}>
            {on ? "✓ " : ""}{b.name.ar}
          </button>
        );
      })}
    </div>
  );
}
