/**
 * "استيراد من ملف اكسل" in three steps, nothing is written before the last one:
 * 1. ربط الأعمدة: each field of the system is tied to a column of the file (a field left untied is not read);
 * 2. المراجعة: how many items are new and how many are edited (matched by the code), with their names;
 * 3. الاعتماد: only then the rows are saved. Cancelling at any step changes nothing.
 */
import { useRef, useState } from "react";
import { FileSpreadsheet } from "lucide-react";
import { Button, Dialog, Select, useToast } from "@/ui";
import { readTable } from "../xlsx";

export interface ImportField {
  /** the name the importer reads the value by */
  key: string;
  /** other names the file may give this column, for the first guess */
  aliases?: string[];
}
export interface ImportEntry {
  code: string;
  name: string;
}
export interface ImportPlan {
  added: ImportEntry[];
  updated: ImportEntry[];
  /** rows left out: no code, or a new code without a name */
  skipped: number;
}

const norm = (s: string) => s.replace(/[أإآ]/g, "ا").replace(/ة/g, "ه").replace(/\s+/g, " ").trim().toLowerCase();

export function ExcelImport({ fields, run, skipNote = "من غير كود، أو كود جديد من غير اسم." }: { /** the first field is the code the rows are matched on */ fields: ImportField[]; run: (rows: Record<string, string>[], dry: boolean) => Promise<ImportPlan>; /** which rows the importer leaves out */ skipNote?: string }) {
  const file = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [sheet, setSheet] = useState<{ name: string; head: string[]; body: string[][] } | null>(null);
  const [map, setMap] = useState<Record<string, string>>({});
  const [plan, setPlan] = useState<ImportPlan | null>(null);
  const code = fields[0].key;
  const close = () => {
    setSheet(null);
    setPlan(null);
    setMap({});
  };
  const fail = (err: unknown) => toast({ tone: "error", title: "تعذر استيراد الملف", description: String((err as Error).message ?? err), duration: 9000 });
  // the rows as the importer reads them: only the tied columns, by the system's field names
  const rows = () => (sheet ? sheet.body.map((r) => Object.fromEntries(fields.filter((f) => map[f.key] !== undefined && map[f.key] !== "").map((f) => [f.key, r[Number(map[f.key])] ?? ""]))) : []);
  const review = async () => {
    setBusy(true);
    try {
      setPlan(await run(rows(), true));
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  };
  const approve = async () => {
    setBusy(true);
    try {
      const r = await run(rows(), false);
      toast({ tone: "success", title: "تم الاستيراد", description: `أضيف ${r.added.length} جديد، وتعدل ${r.updated.length} موجود` });
      close();
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  };
  const options = sheet ? [{ value: "", label: "— لا يُسحب —" }, ...sheet.head.map((h, i) => ({ value: String(i), label: `${h || `عمود ${i + 1}`}${sheet.body[0]?.[i] ? ` (مثال: ${sheet.body[0][i].slice(0, 24)})` : ""}` }))] : [];
  return (
    <>
      <input ref={file} type="file" accept=".xlsx,.csv" className="hidden" onChange={async (e) => {
        const f = e.target.files?.[0];
        e.target.value = "";
        if (!f) return;
        setBusy(true);
        try {
          const t = await readTable(f);
          if (!t.head.length || !t.body.length) throw new Error("الملف فاضي أو مفيهوش صف أسماء الأعمدة");
          // first guess: a column named like the field; everything stays editable
          const guess: Record<string, string> = {};
          for (const fl of fields) {
            const names = [fl.key, ...(fl.aliases ?? [])].map(norm);
            const i = t.head.findIndex((h) => names.includes(norm(h)));
            if (i >= 0) guess[fl.key] = String(i);
          }
          setMap(guess);
          setPlan(null);
          setSheet({ name: f.name, ...t });
        } catch (err) {
          fail(err);
        } finally {
          setBusy(false);
        }
      }} />
      <Button variant="secondary" icon={<FileSpreadsheet />} loading={busy && !sheet} title="تختار أعمدة الملف، وتراجع الجديد والمعدل قبل الاعتماد" onClick={() => file.current?.click()}>استيراد من ملف اكسل</Button>
      {sheet && !plan ? (
        <Dialog open onClose={close} size="lg" title="ربط أعمدة الملف" description={`${sheet.name} · ${sheet.body.length} صف. اختر قدام كل خانة العمود اللي تتاخد منه بياناتها. الخانة اللي تسيبها "لا يُسحب" مش هتتغير.`}
          footer={<div className="flex justify-end gap-2"><Button variant="ghost" onClick={close}>إلغاء</Button><Button loading={busy} disabled={!map[code]} onClick={review}>متابعة للمراجعة</Button></div>}>
          <ul className="grid gap-2">
            {fields.map((f, i) => (
              <li key={f.key} className="grid items-center gap-2 rounded-xl border border-line p-3 sm:grid-cols-[minmax(0,200px)_minmax(0,1fr)]">
                <span className="text-[14.5px] font-semibold">{f.key}{i === 0 ? <span className="ms-2 text-[12.5px] font-medium text-muted">(الربط بيه، لازم يتحدد)</span> : null}</span>
                <Select aria-label={f.key} value={map[f.key] ?? ""} onChange={(e) => setMap((m) => ({ ...m, [f.key]: e.target.value }))} options={options} />
              </li>
            ))}
          </ul>
        </Dialog>
      ) : null}
      {sheet && plan ? (
        <Dialog open onClose={close} size="lg" title="مراجعة قبل الاعتماد" description="لسه مفيش حاجة اتحفظت. راجع الأعداد والأسماء، وبعدها اعتمد أو الغي."
          footer={<div className="flex flex-wrap justify-end gap-2"><Button variant="ghost" onClick={close}>إلغاء الاستيراد</Button><Button variant="outline" disabled={busy} onClick={() => setPlan(null)}>رجوع لربط الأعمدة</Button><Button loading={busy} disabled={!plan.added.length && !plan.updated.length} onClick={approve}>اعتماد الاستيراد</Button></div>}>
          <div className="grid gap-4">
            <div className="grid grid-cols-3 gap-2">
              {([["أصناف جديدة", plan.added.length], ["أصناف معدلة", plan.updated.length], ["صفوف متروكة", plan.skipped]] as const).map(([k, n]) => (
                <div key={k} className="rounded-xl bg-surface-2 px-3 py-2.5">
                  <div className="text-[12.5px] text-muted">{k}</div>
                  <div className="num mt-0.5 text-[22px] font-bold">{n}</div>
                </div>
              ))}
            </div>
            {plan.skipped ? <p className="text-[13px] text-muted">الصفوف المتروكة: {skipNote}</p> : null}
            <div className="grid gap-3 sm:grid-cols-2">
              <EntryList title="الجديد (هيتضاف)" rows={plan.added} />
              <EntryList title="المعدل (كوده موجود)" rows={plan.updated} />
            </div>
          </div>
        </Dialog>
      ) : null}
    </>
  );
}

function EntryList({ title, rows }: { title: string; rows: ImportEntry[] }) {
  return (
    <div className="grid content-start gap-1.5">
      <span className="text-[13px] font-semibold text-ink-2">{title}</span>
      <ul className="thin-scrollbar max-h-64 overflow-y-auto rounded-xl border border-line text-[13.5px]">
        {rows.slice(0, 500).map((r, i) => (
          <li key={i} className="flex items-baseline gap-2 border-b border-line px-3 py-1.5 last:border-b-0">
            <span className="num shrink-0 text-muted" dir="ltr">{r.code}</span>
            <span className="min-w-0 truncate font-medium">{r.name || "—"}</span>
          </li>
        ))}
        {rows.length ? null : <li className="px-3 py-2 text-muted">لا يوجد</li>}
        {rows.length > 500 ? <li className="px-3 py-1.5 text-muted">و {rows.length - 500} غيرهم</li> : null}
      </ul>
    </div>
  );
}
