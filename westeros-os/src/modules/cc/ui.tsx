/** Shared pieces of the Cost Control screens. */
import { useAreaOrNull } from "./useAccess";
import { useRef, type ReactNode } from "react";
import { Camera, Download, Trash2 } from "lucide-react";
import type { StockItem } from "@/data/types";
import { Button, Field, useToast } from "@/ui";
import { readImage } from "@/modules/inventory/bits";
import { ItemPicker, Num } from "@/modules/production/ui";
import { lineUnit, num, toLine } from "./lib";
import { downloadXlsx, type Cell } from "./xlsx";

export interface QtyLine { itemId: string; qty: number }

/**
 * "جدول يضاف فيه المخزون": pick stock, type the quantity, see what the warehouse holds now.
 * Quantities are in the item's own unit (storage unit of a raw material, kilo or piece of a product).
 */
export function StockLines({ items, itemById, lines, onChange, available, qtyLabel, placeholder }: {
  items: StockItem[]; itemById: Map<string, StockItem>; lines: QtyLine[]; onChange: (l: QtyLine[]) => void;
  available?: (itemId: string) => number; qtyLabel: string; placeholder: string;
}) {
  const used = new Set(lines.map((l) => l.itemId));
  return (
    <div className="grid gap-2">
      {lines.length ? (
        <div className="overflow-x-auto rounded-2xl border border-line">
          <table className="w-full min-w-[520px] text-[14px]">
            <thead className="bg-surface-2 text-[12.5px] text-muted">
              <tr>
                <th className="px-3 py-2 text-start font-semibold">الكود</th>
                <th className="px-3 py-2 text-start font-semibold">الصنف</th>
                {available ? <th className="px-3 py-2 text-end font-semibold">المتوفر حالياً</th> : null}
                <th className="px-3 py-2 text-end font-semibold">{qtyLabel}</th>
                <th className="px-3 py-2 text-start font-semibold">الوحدة</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody>
              {lines.map((l, i) => {
                const it = itemById.get(l.itemId);
                if (!it) return null;
                return (
                  <tr key={l.itemId} className="border-t border-line">
                    <td className="num px-3 py-1.5 text-muted">{it.sku}</td>
                    <td className="px-3 py-1.5 font-semibold">{it.name.ar}</td>
                    {available ? <td className="num px-3 py-1.5 text-end">{num(toLine(available(l.itemId), it))}</td> : null}
                    <td className="px-3 py-1.5"><Num className="ms-auto w-28" value={l.qty} onChange={(qty) => onChange(lines.map((x, j) => (j === i ? { ...x, qty } : x)))} /></td>
                    <td className="px-3 py-1.5 text-muted">{lineUnit(it).label}</td>
                    <td className="px-1"><button type="button" aria-label="حذف" className="grid size-9 place-items-center rounded-lg text-danger hover:bg-danger-soft" onClick={() => onChange(lines.filter((_, j) => j !== i))}><Trash2 className="size-4" /></button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
      <ItemPicker items={items} exclude={used} placeholder={placeholder} onPick={(it) => onChange([...lines, { itemId: it.id, qty: 0 }])} />
    </div>
  );
}

/** تحميل صورة 500 KB */
export function ImageField({ value, onChange }: { value: string | null | undefined; onChange: (v: string | null) => void }) {
  const file = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  return (
    <Field label="تحميل صورة (حتى 500 KB)">
      <div className="flex items-center gap-3">
        <span className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-xl border border-line bg-surface-2 text-muted">
          {value ? <img src={value} alt="" className="size-full object-cover" /> : <Camera className="size-5" />}
        </span>
        <input ref={file} type="file" accept="image/*" className="hidden" onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (!f) return;
          if (f.size > 500 * 1024) return toast({ tone: "error", title: "الصورة أكبر من 500 KB" });
          onChange(await readImage(f, 640));
        }} />
        <Button type="button" variant="secondary" size="sm" onClick={() => file.current?.click()}>اختيار صورة</Button>
        {value ? <Button type="button" variant="ghost" size="sm" onClick={() => onChange(null)}>حذف الصورة</Button> : null}
      </div>
    </Field>
  );
}

/** A value the system works out ("نتيجة"): shown, never typed. */
export function Result({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <Field label={<span>{label} <span className="text-brass-text">(نتيجة)</span></span>}>
      <div className="num flex h-11 items-center rounded-xl border border-dashed border-line-strong bg-surface-2 px-3 font-semibold">{children}</div>
    </Field>
  );
}

export function ReadOnly({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <Field label={label}>
      <div className="flex h-11 items-center rounded-xl border border-line bg-surface-2 px-3 text-muted">{children}</div>
    </Field>
  );
}

/** تصدير اكسل: saves what the table shows now as an Excel file. */
export function ExportButton({ file, head, rows, size, disabled }: { file: string; head: string[]; rows: () => Cell[][]; size?: "sm" | "md"; disabled?: boolean }) {
  const { toast } = useToast();
  // inside a tab that checks permissions: shown only with تصدير
  const area = useAreaOrNull();
  if (area && !area.export) return null;
  return (
    <Button type="button" variant="secondary" size={size} icon={<Download />} disabled={disabled} onClick={() => {
      const r = rows();
      if (!r.length) return toast({ tone: "error", title: "لا توجد بيانات للتصدير" });
      downloadXlsx(file, head, r);
      toast({ tone: "success", title: `تم تصدير ${r.length} صف إلى اكسل` });
    }}>تصدير اكسل</Button>
  );
}
