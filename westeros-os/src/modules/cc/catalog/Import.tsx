/** "استيراد من ملف اكسل": pick a file, rows are matched to the database by the code column. */
import { useRef, useState } from "react";
import { FileSpreadsheet } from "lucide-react";
import { Button, useToast } from "@/ui";
import { readSheet } from "../xlsx";

export function ExcelImport({ columns, onRows }: { columns: string[]; onRows: (rows: Record<string, string>[]) => Promise<{ added: number; updated: number }> }) {
  const file = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  return (
    <>
      <input ref={file} type="file" accept=".xlsx,.csv" className="hidden" onChange={async (e) => {
        const f = e.target.files?.[0];
        e.target.value = "";
        if (!f) return;
        setBusy(true);
        try {
          const rows = await readSheet(f);
          if (!rows.length || !(columns[0] in rows[0])) throw new Error(`أول صف في الملف لازم يكون أسماء الأعمدة: ${columns.join("، ")}`);
          const r = await onRows(rows);
          toast({ tone: "success", title: "تم الاستيراد", description: `أضيف ${r.added} وتحدّث ${r.updated}` });
        } catch (err) {
          toast({ tone: "error", title: "تعذر استيراد الملف", description: String((err as Error).message ?? err), duration: 9000 });
        } finally {
          setBusy(false);
        }
      }} />
      <Button variant="secondary" icon={<FileSpreadsheet />} loading={busy} title={`الأعمدة: ${columns.join("، ")}`} onClick={() => file.current?.click()}>استيراد من ملف اكسل</Button>
    </>
  );
}
