/**
 * التحديد في قوائم المنتجات والخامات: a checkbox on every row and one on the header (تحديد الكل for the rows shown),
 * then the action on what is ticked: تعديل (one row), نقل لفئة, حذف (one row or a group, after a confirmation).
 */
import { useMemo, useState } from "react";
import { FolderInput, Pencil, Trash2, X } from "lucide-react";
import { Button, Dialog, Select, useToast, type Column } from "@/ui";

export interface DeleteResult {
  deleted: number;
  /** the rows left in place, each with the reason */
  refused: { name: string; why: string }[];
}

const BOX = "size-4.5 cursor-pointer accent-[var(--color-brand,#F8BB18)]";

/** The ticked rows among the rows the list shows now (a row hidden by the search or the filter is not acted on). */
export function useSelection<T>(rows: T[], key: (r: T) => string) {
  const [keys, setKeys] = useState<Set<string>>(() => new Set());
  const picked = useMemo(() => rows.filter((r) => keys.has(key(r))), [rows, keys]); // eslint-disable-line react-hooks/exhaustive-deps
  const all = rows.length > 0 && picked.length === rows.length;
  const toggle = (k: string) => setKeys((s) => {
    const n = new Set(s);
    if (!n.delete(k)) n.add(k);
    return n;
  });
  const column: Column<T> = {
    key: "_select",
    width: "44px",
    header: <input type="checkbox" aria-label="تحديد الكل" className={BOX} checked={all} ref={(el) => { if (el) el.indeterminate = !all && picked.length > 0; }} onChange={() => setKeys(all ? new Set() : new Set(rows.map(key)))} />,
    cell: (r) => (
      // the row itself opens the card: the tick must not
      <span className="grid place-items-center" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
        <input type="checkbox" aria-label="تحديد" className={BOX} checked={keys.has(key(r))} onChange={() => toggle(key(r))} />
      </span>
    ),
  };
  return { rows: picked, column, clear: () => setKeys(new Set()) };
}

export function BulkBar({ count, noun, categories, onClear, onEdit, onMove, onDelete }: {
  count: number;
  /** what one row is called: خام، منتج، صنف */
  noun: string;
  categories: { value: string; label: string }[];
  onClear: () => void;
  onEdit: () => void;
  /** resolves with how many rows moved */
  onMove: (category: string) => Promise<number>;
  onDelete: () => Promise<DeleteResult>;
}) {
  const { toast } = useToast();
  const [dialog, setDialog] = useState<"move" | "delete" | null>(null);
  const [to, setTo] = useState("");
  const [busy, setBusy] = useState(false);
  const [refused, setRefused] = useState<DeleteResult["refused"] | null>(null);
  if (!count && !refused) return null;
  const fail = (e: unknown) => toast({ tone: "error", title: "تعذر تنفيذ الإجراء", description: String((e as Error).message ?? e) });
  const move = async () => {
    setBusy(true);
    try {
      const n = await onMove(to);
      toast({ tone: "success", title: `تم نقل ${n} ${noun}` });
      setDialog(null);
      onClear();
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    setBusy(true);
    try {
      const r = await onDelete();
      if (r.deleted) toast({ tone: "success", title: `تم حذف ${r.deleted} ${noun}` });
      setDialog(null);
      onClear();
      if (r.refused.length) setRefused(r.refused);
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      {count ? (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-primary/40 bg-primary-soft/40 px-3 py-2">
          <span className="me-auto text-[14.5px] font-semibold">المحدد: <b className="num">{count}</b> {noun}</span>
          {count === 1 ? <Button size="sm" variant="outline" icon={<Pencil />} onClick={onEdit}>تعديل</Button> : null}
          <Button size="sm" variant="outline" icon={<FolderInput />} disabled={!categories.length} onClick={() => (setTo(categories[0]?.value ?? ""), setDialog("move"))}>نقل لفئة</Button>
          <Button size="sm" variant="danger" icon={<Trash2 />} onClick={() => setDialog("delete")}>حذف</Button>
          <Button size="sm" variant="ghost" icon={<X />} onClick={onClear}>إلغاء التحديد</Button>
        </div>
      ) : null}
      {dialog === "move" ? (
        <Dialog open onClose={() => (busy ? undefined : setDialog(null))} size="sm" title={`نقل ${count} ${noun} لفئة`} description="الفئة فقط هي اللي تتغير، والكود وباقي البيانات زي ما هي."
          footer={<div className="flex justify-end gap-2"><Button variant="ghost" disabled={busy} onClick={() => setDialog(null)}>إلغاء</Button><Button loading={busy} disabled={!to} onClick={move}>نقل</Button></div>}>
          <Select label="الفئة" value={to} onChange={(e) => setTo(e.target.value)} options={categories} />
        </Dialog>
      ) : null}
      {dialog === "delete" ? (
        <Dialog open onClose={() => (busy ? undefined : setDialog(null))} size="sm" title={`حذف ${count} ${noun}؟`}
          description="اللي له رصيد أو حركات أو داخل في وصفة أو تشغيلة مش هيتحذف، وهيظهر لك بالسبب. الحذف تقدر ترجع عنه من السجل والاسترجاع."
          footer={<div className="flex justify-end gap-2"><Button variant="ghost" disabled={busy} onClick={() => setDialog(null)}>إلغاء</Button><Button variant="danger" loading={busy} icon={<Trash2 />} onClick={remove}>حذف</Button></div>}>
          {null}
        </Dialog>
      ) : null}
      {refused ? (
        <Dialog open onClose={() => setRefused(null)} size="md" title={`${refused.length} ${noun} لم يتحذف`} description="دول مستخدمين في السيستم، فضلوا زي ما هم."
          footer={<div className="flex justify-end"><Button onClick={() => setRefused(null)}>تمام</Button></div>}>
          <ul className="thin-scrollbar max-h-72 overflow-y-auto rounded-xl border border-line text-[14px]">
            {refused.map((r, i) => (
              <li key={i} className="flex flex-wrap items-baseline justify-between gap-x-3 border-b border-line px-3 py-2 last:border-b-0">
                <span className="font-semibold">{r.name}</span>
                <span className="text-[13px] text-muted">{r.why}</span>
              </li>
            ))}
          </ul>
        </Dialog>
      ) : null}
    </>
  );
}
