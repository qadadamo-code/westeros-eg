/** القيود اليومية: the journal, the entry form, and what can be done to an entry (approve, reject, reverse, copy, print). */
import { STOCK_REF_LABEL, STOCK_SOURCE } from "./sync";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { BookOpen, Check, Copy, FilePlus2, Paperclip, Plus, Repeat, RotateCcw, Scale, Search, Trash2, X } from "lucide-react";
import { useDb, useLive } from "@/data/hooks";
import type { FinDoc, FinEntry, FinEntryKind, FinLine } from "@/data/financeTypes";
import { cn } from "@/lib/cn";
import { readImage } from "@/modules/inventory/bits";
import { Badge, Button, Card, Dialog, EmptyState, IconButton, Input, Select, Table, Textarea, useToast, type Column, type Tone } from "@/ui";
import { ExportButton } from "../ui";
import { fmtAt, fmtDay } from "../lib";
import { amountOf, entryProblem, entryRef, KIND_LABEL, STATUS_LABEL, totalsOf } from "./journal";
import { approveEntry, RECURRING, rejectEntry, removeDraft, reverseEntry, runRecurring, saveDraft, saveRecurring, saveTemplate, submitEntry, TEMPLATE, type RecurringData, type TemplateData } from "./journalOps";
import { useActor, useFinPerms } from "./perms";
import { AccountSelect, Amount, BranchSelect, fmt, fromText, periodLabel, periodOf, PeriodPicker, PrintButton, printTable, toText, today, type Period } from "./ui";
import { useFinance, type Fin } from "./useFinance";

const err = (e: unknown) => String((e as Error).message ?? e);
const TONE: Record<FinEntry["status"], Tone> = { draft: "neutral", pending: "warn", posted: "ok", rejected: "danger" };
/** where an automatic entry came from, in words */
export const SOURCE_LABEL: Record<string, string> = {
  "mfg-batch": "تشغيلة تصنيع", "stock-move": "حركة مخزنية", "stock-count": "جرد مخزن", "stock-request": "طلب توريد", "stock-waste": "هالك مخزن",
  ...Object.fromEntries(Object.entries(STOCK_REF_LABEL).map(([k, v]) => [`${STOCK_SOURCE}${k}`, v])),
  "opening-balance": "أرصدة افتتاحية", prepaid: "مصروف مقدم", "cash-count": "جرد خزينة", [RECURRING]: "قيد متكرر", voucher: "سند", expense: "مصروف", depreciation: "إهلاك", "year-close": "إقفال سنة", purchase: "فاتورة شراء", "purchase-return": "مرتجع مشتريات", allocation: "توزيع مصروف", "kitchen-allocation": "توزيع المطبخ المركزي", "asset-buy": "شراء أصل", "asset-sale": "بيع أو استبعاد أصل", "sales-day": "مبيعات يوم", settlement: "تسوية تحصيل", payroll: "رواتب", "payroll-pay": "صرف رواتب", "vat-settle": "تسوية ضريبة",
};

type Draft = { key: number; account: string; debit: string; credit: string; memo: string; centreId: string; branchId: string };
let seq = 0;
const blankLine = (): Draft => ({ key: ++seq, account: "", debit: "", credit: "", memo: "", centreId: "", branchId: "" });
const toDraft = (l: FinLine): Draft => ({ key: ++seq, account: l.account, debit: toText(l.debit), credit: toText(l.credit), memo: l.memo ?? "", centreId: l.centreId ?? "", branchId: l.branchId ?? "" });
const toLines = (d: Draft[]): FinLine[] => d.map((l) => ({ account: l.account, debit: fromText(l.debit), credit: fromText(l.credit), ...(l.memo.trim() ? { memo: l.memo.trim() } : {}), ...(l.centreId ? { centreId: l.centreId } : {}), ...(l.branchId ? { branchId: l.branchId } : {}) }));

export default function Journal() {
  const fin = useFinance();
  const db = useDb();
  const { toast } = useToast();
  const perms = useFinPerms();
  const actor = useActor();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState("");
  const [period, setPeriod] = useState<Period>(periodOf("all"));
  const [kind, setKind] = useState("");
  const [status, setStatus] = useState("");
  const [account, setAccount] = useState("");
  const [branch, setBranch] = useState("");
  const [user, setUser] = useState("");
  const [form, setForm] = useState<{ row: FinEntry | null; seed?: Partial<FinEntry> } | null>(null);
  const [tools, setTools] = useState<"templates" | "recurring" | null>(null);
  const viewId = params.get("entry");
  const view = fin.entries.find((e) => e.id === viewId) ?? null;
  const canEnter = perms.has("journal.enter");

  // the monthly drafts of the recurring entries are made when the journal is opened
  const ran = useRef(false);
  useEffect(() => {
    if (ran.current || !canEnter) return;
    ran.current = true;
    void runRecurring(db, today(), actor).then((n) => n && toast({ title: `تم تجهيز ${n} قيد متكرر كمسودة`, description: "راجعها ورحلها من قائمة القيود" })).catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canEnter]);

  const users = useMemo(() => [...new Set(fin.entries.map((e) => e.createdByName).filter(Boolean))], [fin.entries]);
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const amount = Number(needle.replace(/,/g, ""));
    return fin.entries.filter((e) =>
      (!period.from || e.date >= period.from) && (!period.to || e.date <= period.to) && (!kind || e.kind === kind) && (!status || e.status === status) &&
      (!account || e.lines.some((l) => l.account === account)) && (!branch || e.branchId === branch || e.lines.some((l) => l.branchId === branch)) && (!user || e.createdByName === user) &&
      (!needle || entryRef(e).includes(needle) || e.memo.toLowerCase().includes(needle) || (SOURCE_LABEL[e.sourceType ?? ""] ?? "").includes(needle) || (Number.isFinite(amount) && amount > 0 && Math.round(amountOf(e) / 1000) === Math.round(amount * 100))),
    ).sort((a, b) => b.date.localeCompare(a.date) || b.year - a.year || (b.no || 1e9) - (a.no || 1e9) || b.createdAt.localeCompare(a.createdAt));
  }, [fin.entries, q, period, kind, status, account, branch, user]);
  const pending = fin.entries.filter((e) => e.status === "pending").length;

  const open = (e: FinEntry) => setParams((p) => { p.set("entry", e.id); return p; }, { replace: true });
  const close = () => setParams((p) => { p.delete("entry"); return p; }, { replace: true });
  const columns: Column<FinEntry>[] = [
    { key: "no", header: "رقم القيد", cell: (e) => <span className="num font-semibold" dir="ltr">{entryRef(e)}</span> },
    { key: "date", header: "التاريخ", cell: (e) => <span className="num">{fmtDay(e.date)}</span> },
    { key: "kind", header: "النوع", hideOnMobile: true, cell: (e) => <span className="text-muted">{KIND_LABEL[e.kind]}{e.sourceType && SOURCE_LABEL[e.sourceType] ? ` · ${SOURCE_LABEL[e.sourceType]}` : ""}</span> },
    { key: "memo", header: "البيان", cell: (e) => <span className="line-clamp-1 max-w-[26rem]">{e.memo || "—"}</span> },
    { key: "amount", header: "المبلغ (ج.م)", align: "end", cell: (e) => <Amount value={amountOf(e)} /> },
    { key: "status", header: "الحالة", cell: (e) => <span className="inline-flex gap-1"><Badge size="sm" tone={TONE[e.status]}>{STATUS_LABEL[e.status]}</Badge>{e.reversedBy ? <Badge size="sm" tone="neutral">معكوس</Badge> : null}</span> },
    { key: "by", header: "المستخدم", hideOnMobile: true, cell: (e) => <span className="text-muted">{e.createdByName || "—"}</span> },
  ];
  const exportRows = () => rows.flatMap((e) => e.lines.map((l) => [entryRef(e), e.date, KIND_LABEL[e.kind], STATUS_LABEL[e.status], e.memo, fin.byId.get(l.account)?.code ?? "", fin.byId.get(l.account)?.name.ar ?? "", Math.round(l.debit / 1000) / 100, Math.round(l.credit / 1000) / 100, l.memo ?? "", fin.branchName(l.branchId ?? e.branchId), e.createdByName]));
  const print = () => printTable("دفتر اليومية", periodLabel(period), ["رقم القيد", "التاريخ", "البيان", "الحساب", "مدين", "دائن"],
    rows.flatMap((e) => e.lines.map((l, i) => [i ? "" : entryRef(e), i ? "" : fmtDay(e.date), i ? (l.memo ?? "") : e.memo, fin.label(l.account), { text: l.debit ? fmt(l.debit) : "", align: "end" as const }, { text: l.credit ? fmt(l.credit) : "", align: "end" as const }])));

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-end gap-2">
        <Input label="بحث" className="w-52" icon={<Search />} placeholder="رقم، بيان أو مبلغ" value={q} onChange={(e) => setQ(e.target.value)} />
        <PeriodPicker value={period} onChange={setPeriod} startMonth={fin.settings.yearStartMonth} />
        <Select label="النوع" className="w-36" value={kind} onChange={(e) => setKind(e.target.value)} options={[{ value: "", label: "كل الأنواع" }, ...Object.entries(KIND_LABEL).map(([value, label]) => ({ value, label }))]} />
        <Select label="الحالة" className="w-40" value={status} onChange={(e) => setStatus(e.target.value)} options={[{ value: "", label: "كل الحالات" }, ...Object.entries(STATUS_LABEL).map(([value, label]) => ({ value, label }))]} />
        <AccountSelect fin={fin} label="الحساب" className="w-56" value={account} onChange={setAccount} placeholder="كل الحسابات" />
        <BranchSelect fin={fin} value={branch} onChange={setBranch} />
        {users.length > 1 ? <Select label="المستخدم" className="w-40" value={user} onChange={(e) => setUser(e.target.value)} options={[{ value: "", label: "الكل" }, ...users.map((u) => ({ value: u, label: u }))]} /> : null}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {canEnter ? <Button icon={<Plus />} onClick={() => setForm({ row: null })}>قيد جديد</Button> : null}
        {canEnter ? <Button variant="secondary" icon={<FilePlus2 />} onClick={() => setTools("templates")}>قوالب القيود</Button> : null}
        {canEnter ? <Button variant="secondary" icon={<Repeat />} onClick={() => setTools("recurring")}>قيود متكررة</Button> : null}
        {pending ? <Button variant="soft" onClick={() => setStatus("pending")}>ينتظر الاعتماد: <span className="num">{pending}</span></Button> : null}
        <span className="flex-1" />
        <ExportButton file="دفتر-اليومية" head={["رقم القيد", "التاريخ", "النوع", "الحالة", "البيان", "كود الحساب", "اسم الحساب", "مدين", "دائن", "بيان السطر", "الفرع", "المستخدم"]} rows={exportRows} />
        <PrintButton onClick={print} />
      </div>
      <Card className="overflow-hidden">
        <Table columns={columns} rows={rows} rowKey={(e) => e.id} onRowClick={open} empty={<EmptyState compact icon={<BookOpen />} title="لا توجد قيود" body="القيود التلقائية تظهر هنا مع أول حركة، والقيود اليدوية من زر قيد جديد." />} />
      </Card>
      <p className="text-[12.5px] text-muted">عدد القيود: <span className="num">{rows.length}</span></p>

      {form ? <EntryForm key={form.row?.id ?? "new"} fin={fin} row={form.row} seed={form.seed} onClose={() => setForm(null)} /> : null}
      {view ? <EntryView key={view.id} fin={fin} entry={view} onClose={close} onEdit={() => { close(); setForm({ row: view }); }} onCopy={() => { close(); setForm({ row: null, seed: { memo: view.memo, lines: view.lines, branchId: view.branchId } }); }} onOpen={open} /> : null}
      {tools ? <ToolsDialog fin={fin} mode={tools} onClose={() => setTools(null)} onUse={(t) => { setTools(null); setForm({ row: null, seed: { memo: t.memo, lines: t.lines, branchId: t.branchId } }); }} /> : null}
    </div>
  );
}

/** The lines grid shared by the entry form, the templates and the opening balances. */
export function LinesEditor({ fin, lines, onChange, manualOnly = true }: { fin: Fin; lines: Draft[]; onChange: (l: Draft[]) => void; manualOnly?: boolean }) {
  const set = (key: number, patch: Partial<Draft>) => onChange(lines.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const t = totalsOf(toLines(lines));
  const diff = t.debit - t.credit;
  const balance = (key: number) => {
    const rest = totalsOf(toLines(lines.filter((l) => l.key !== key)));
    const d = rest.credit - rest.debit;
    set(key, d >= 0 ? { debit: toText(d), credit: "" } : { debit: "", credit: toText(-d) });
  };
  const multi = fin.branches.length > 1;
  const centres = fin.centres.filter((c) => c.active);
  return (
    <div className="grid gap-2">
      <div className="hidden grid-cols-[minmax(0,2.2fr)_110px_110px_minmax(0,1.4fr)_auto] gap-2 px-1 text-[12.5px] font-semibold text-muted md:grid"><span>الحساب</span><span>مدين</span><span>دائن</span><span>بيان السطر</span><span className="w-[76px]" /></div>
      {lines.map((l) => {
        const acc = fin.byId.get(l.account);
        return (
          <div key={l.key} className="grid gap-2 rounded-xl border border-line p-2 md:grid-cols-[minmax(0,2.2fr)_110px_110px_minmax(0,1.4fr)_auto] md:items-start md:border-0 md:p-0">
            <div className="grid gap-1.5">
              <AccountSelect fin={fin} value={l.account} onChange={(v) => set(l.key, { account: v })} manualOnly={manualOnly} />
              {(multi || centres.length || acc?.requireCentre) ? (
                <div className="flex flex-wrap gap-1.5">
                  {multi ? <Select aria-label="فرع السطر" className="w-40" value={l.branchId} onChange={(e) => set(l.key, { branchId: e.target.value })} options={[{ value: "", label: "فرع القيد" }, ...fin.branches.map((b) => ({ value: b.id, label: b.name.ar }))]} /> : null}
                  {centres.length || acc?.requireCentre ? <Select aria-label="مركز التكلفة" className="w-44" value={l.centreId} onChange={(e) => set(l.key, { centreId: e.target.value })} options={[{ value: "", label: acc?.requireCentre ? "مركز التكلفة (إلزامي)" : "بدون مركز تكلفة" }, ...centres.map((c) => ({ value: c.id, label: c.name.ar }))]} /> : null}
                </div>
              ) : null}
            </div>
            <Input aria-label="مدين" placeholder="مدين" dir="ltr" inputMode="decimal" value={l.debit} onChange={(e) => set(l.key, { debit: e.target.value, credit: e.target.value ? "" : l.credit })} />
            <Input aria-label="دائن" placeholder="دائن" dir="ltr" inputMode="decimal" value={l.credit} onChange={(e) => set(l.key, { credit: e.target.value, debit: e.target.value ? "" : l.debit })} />
            <Input aria-label="بيان السطر" placeholder="بيان السطر" value={l.memo} onChange={(e) => set(l.key, { memo: e.target.value })} />
            <span className="flex gap-1">
              <IconButton label="موازنة السطر" title="يضع الفرق في هذا السطر" onClick={() => balance(l.key)}><Scale /></IconButton>
              <IconButton label="حذف السطر" disabled={lines.length <= 2} onClick={() => onChange(lines.filter((x) => x.key !== l.key))}><Trash2 /></IconButton>
            </span>
          </div>
        );
      })}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-xl bg-surface-2 px-3 py-2.5 text-[14px]">
        <Button type="button" size="sm" variant="outline" icon={<Plus />} onClick={() => onChange([...lines, blankLine()])}>سطر جديد</Button>
        <span className="flex-1" />
        <span>مجموع المدين <b className="num" dir="ltr">{fmt(t.debit)}</b></span>
        <span>مجموع الدائن <b className="num" dir="ltr">{fmt(t.credit)}</b></span>
        <span className={cn("font-bold", diff ? "text-danger" : "text-ok")}>{diff ? <>الفرق <span className="num" dir="ltr">{fmt(Math.abs(diff))}</span></> : "القيد متوازن"}</span>
      </div>
    </div>
  );
}
export { blankLine, toDraft, toLines, type Draft };

function EntryForm({ fin, row, seed, onClose }: { fin: Fin; row: FinEntry | null; seed?: Partial<FinEntry>; onClose: () => void }) {
  const db = useDb();
  const { toast } = useToast();
  const actor = useActor();
  const src = row ?? seed;
  const [d, setD] = useState({ date: row?.date ?? today(), memo: src?.memo ?? "", branchId: src?.branchId ?? fin.branchId ?? "", kind: (row?.kind === "adjust" ? "adjust" : "manual") as FinEntryKind });
  const [lines, setLines] = useState<Draft[]>(() => (src?.lines?.length ? src.lines.map(toDraft) : [blankLine(), blankLine()]));
  const [files, setFiles] = useState(row?.attachments ?? []);
  const [busy, setBusy] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const input = { date: d.date, memo: d.memo, lines: toLines(lines), branchId: d.branchId || null, kind: d.kind, attachments: files };
  const problem = entryProblem(input, fin.byId, fin.settings, { manual: true });
  const limit = fin.settings.approvalLimit;
  const waits = limit != null && totalsOf(input.lines).debit > limit && !actor.canApprove;
  const run = async (post: boolean) => {
    setBusy(true);
    try {
      const saved = post ? await submitEntry(db, row, input, actor) : await saveDraft(db, row, input, actor);
      toast({ tone: "success", title: saved.status === "posted" ? `تم ترحيل القيد ${entryRef(saved)}` : saved.status === "pending" ? "القيد في انتظار الاعتماد" : "تم حفظ المسودة" });
      onClose();
    } catch (e) { toast({ tone: "error", title: "تعذر الحفظ", description: err(e), duration: 9000 }); } finally { setBusy(false); }
  };
  return (
    <Dialog open onClose={onClose} size="xl" title={row ? "تعديل مسودة قيد" : "قيد جديد"}
      footer={<div className="flex flex-wrap items-center justify-end gap-2">
        {problem ? <span className="me-auto text-[13px] font-semibold text-danger">{problem}</span> : waits ? <span className="me-auto text-[13px] text-muted">المبلغ فوق حد الاعتماد، القيد يذهب للمدير</span> : null}
        <Button variant="ghost" onClick={onClose}>إلغاء</Button>
        <Button variant="secondary" loading={busy} disabled={!d.date} onClick={() => run(false)}>حفظ كمسودة</Button>
        <Button loading={busy} disabled={!!problem} onClick={() => run(true)}>{waits ? "إرسال للاعتماد" : "ترحيل"}</Button>
      </div>}>
      <div className="grid gap-4">
        <div className="grid gap-3 sm:grid-cols-4">
          <Input label="التاريخ" type="date" dir="ltr" value={d.date} onChange={(e) => setD({ ...d, date: e.target.value })} />
          <Select label="نوع القيد" value={d.kind} onChange={(e) => setD({ ...d, kind: e.target.value as FinEntryKind })} options={[{ value: "manual", label: "قيد يدوي" }, { value: "adjust", label: "قيد تسوية" }]} />
          <BranchSelect fin={fin} label="الفرع" className="w-full" all={null} value={d.branchId} onChange={(v) => setD({ ...d, branchId: v })} />
          <div className="flex items-end gap-2">
            <input ref={file} type="file" accept="image/*" className="hidden" onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (!f) return;
              if (f.size > 2 * 1024 * 1024) return toast({ tone: "error", title: "الملف أكبر من 2 ميجا" });
              setFiles([...files, { name: f.name, url: await readImage(f, 1200) }]);
            }} />
            <Button type="button" variant="outline" icon={<Paperclip />} onClick={() => file.current?.click()}>إرفاق صورة مستند</Button>
          </div>
        </div>
        <Textarea label="البيان" rows={2} value={d.memo} onChange={(e) => setD({ ...d, memo: e.target.value })} />
        {files.length ? <div className="flex flex-wrap gap-2">{files.map((f, i) => <span key={i} className="inline-flex items-center gap-1.5 rounded-lg border border-line px-2 py-1 text-[13px]"><Paperclip className="size-3.5" />{f.name}<button type="button" aria-label="حذف المرفق" onClick={() => setFiles(files.filter((_, j) => j !== i))}><X className="size-3.5" /></button></span>)}</div> : null}
        <LinesEditor fin={fin} lines={lines} onChange={setLines} />
      </div>
    </Dialog>
  );
}

export function EntryView({ fin, entry: e, onClose, onEdit, onCopy, onOpen }: { fin: Fin; entry: FinEntry; onClose: () => void; onEdit?: () => void; onCopy?: () => void; onOpen?: (e: FinEntry) => void }) {
  const db = useDb();
  const { toast } = useToast();
  const actor = useActor();
  const perms = useFinPerms();
  const [busy, setBusy] = useState(false);
  const [ask, setAsk] = useState<"reverse" | "reject" | "template" | null>(null);
  const [text, setText] = useState("");
  const [date, setDate] = useState(today());
  const t = totalsOf(e.lines);
  const other = fin.entries.find((x) => x.id === (e.reversedBy ?? e.reverses));
  const run = async (fn: () => Promise<unknown>, ok: string, shut = true) => {
    setBusy(true);
    try { await fn(); toast({ tone: "success", title: ok }); setAsk(null); if (shut) onClose(); } catch (x) { toast({ tone: "error", title: "تعذر التنفيذ", description: err(x), duration: 9000 }); } finally { setBusy(false); }
  };
  const print = () => printTable(`${KIND_LABEL[e.kind]} رقم ${entryRef(e)}`, `التاريخ ${fmtDay(e.date)} · ${fin.branchName(e.branchId)} · ${e.memo}`, ["الحساب", "بيان السطر", "مدين", "دائن"],
    e.lines.map((l) => [fin.label(l.account), l.memo ?? "", { text: l.debit ? fmt(l.debit) : "", align: "end" as const }, { text: l.credit ? fmt(l.credit) : "", align: "end" as const }]), ["الإجمالي", "", { text: fmt(t.debit), align: "end" }, { text: fmt(t.credit), align: "end" }]);
  const editable = e.status === "draft" || e.status === "rejected";
  // an entry a warehouse movement made is corrected from the movement itself (void the batch, count again …)
  const fromStock = !!e.sourceType?.startsWith(STOCK_SOURCE) && e.sourceType !== `${STOCK_SOURCE}revalue`;
  return (
    <Dialog open onClose={onClose} size="xl" title={<span className="flex flex-wrap items-center gap-2">{KIND_LABEL[e.kind]} <span className="num" dir="ltr">{entryRef(e)}</span><Badge tone={TONE[e.status]}>{STATUS_LABEL[e.status]}</Badge>{e.reversedBy ? <Badge tone="neutral">معكوس</Badge> : null}</span>}
      footer={<div className="flex flex-wrap justify-end gap-2">
        <PrintButton onClick={print} />
        {onCopy && perms.has("journal.enter") ? <Button variant="secondary" icon={<Copy />} onClick={onCopy}>نسخ في قيد جديد</Button> : null}
        {perms.has("journal.enter") ? <Button variant="secondary" icon={<FilePlus2 />} onClick={() => { setText(e.memo); setAsk("template"); }}>حفظ كقالب</Button> : null}
        {editable && onEdit && perms.has("journal.enter") ? <Button variant="secondary" onClick={onEdit}>تعديل</Button> : null}
        {editable && perms.has("journal.enter") ? <Button variant="danger-soft" icon={<Trash2 />} loading={busy} onClick={() => run(() => removeDraft(db, e.id), "تم حذف المسودة")}>حذف</Button> : null}
        {e.status === "pending" && actor.canApprove ? <><Button variant="danger-soft" onClick={() => { setText(""); setAsk("reject"); }}>رفض</Button><Button icon={<Check />} loading={busy} onClick={() => run(() => approveEntry(db, e.id, actor), "تم اعتماد وترحيل القيد")}>اعتماد وترحيل</Button></> : null}
        {e.status === "posted" && !e.reversedBy && e.kind !== "reversal" && !fromStock && actor.canApprove ? <Button variant="danger-soft" icon={<RotateCcw />} onClick={() => { setText(""); setDate(today()); setAsk("reverse"); }}>قيد عكسي</Button> : null}
      </div>}>
      <div className="grid gap-4">
        <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-[14px] sm:grid-cols-4">
          <div><dt className="text-[12.5px] text-muted">التاريخ</dt><dd className="num">{fmtDay(e.date)}</dd></div>
          <div><dt className="text-[12.5px] text-muted">الفرع</dt><dd>{fin.branchName(e.branchId)}</dd></div>
          <div><dt className="text-[12.5px] text-muted">المستخدم</dt><dd>{e.createdByName || "—"}</dd></div>
          <div><dt className="text-[12.5px] text-muted">وقت التسجيل</dt><dd className="num">{fmtAt(e.postedAt ?? e.createdAt)}</dd></div>
          {e.sourceType && SOURCE_LABEL[e.sourceType] ? <div><dt className="text-[12.5px] text-muted">المصدر</dt><dd>{SOURCE_LABEL[e.sourceType]}</dd></div> : null}
          <div className="col-span-2 sm:col-span-3"><dt className="text-[12.5px] text-muted">البيان</dt><dd>{e.memo || "—"}</dd></div>
          {fromStock ? <div className="col-span-2 text-[13px] text-muted sm:col-span-4">قيد تلقائي من حركة مخزنية. لا يعكس من هنا، يتصحح من مصدره (إلغاء التشغيلة، جرد جديد، حركة عكسية).</div> : null}
          {e.reason ? <div className="col-span-2 sm:col-span-4"><dt className="text-[12.5px] text-muted">سبب الرفض</dt><dd className="text-danger">{e.reason}</dd></div> : null}
        </dl>
        {other ? <button type="button" className="w-fit text-[13.5px] font-semibold text-primary underline-offset-2 hover:underline" onClick={() => onOpen?.(other)}>{e.reversedBy ? "القيد العكسي" : "القيد الأصلي"}: <span className="num" dir="ltr">{entryRef(other)}</span></button> : null}
        <div className="overflow-x-auto rounded-xl border border-line">
          <table className="w-full text-[14px]">
            <thead><tr className="bg-surface-2 text-[12.5px] text-muted"><th className="px-3 py-2 text-start">الحساب</th><th className="px-3 py-2 text-start">بيان السطر</th><th className="px-3 py-2 text-end">مدين</th><th className="px-3 py-2 text-end">دائن</th></tr></thead>
            <tbody>
              {e.lines.map((l, i) => (
                <tr key={i} className="border-t border-line/60">
                  <td className="px-3 py-2">{fin.label(l.account)}{l.centreId || l.branchId ? <span className="block text-[12px] text-muted">{[l.branchId ? fin.branchName(l.branchId) : "", fin.centres.find((c) => c.id === l.centreId)?.name.ar ?? ""].filter(Boolean).join(" · ")}</span> : null}</td>
                  <td className="px-3 py-2 text-muted">{l.memo ?? ""}</td>
                  <td className="px-3 py-2 text-end"><Amount value={l.debit} zero="" /></td>
                  <td className="px-3 py-2 text-end"><Amount value={l.credit} zero="" /></td>
                </tr>
              ))}
              <tr className="border-t border-line bg-surface-2 font-bold"><td className="px-3 py-2" colSpan={2}>الإجمالي</td><td className="px-3 py-2 text-end"><Amount value={t.debit} /></td><td className="px-3 py-2 text-end"><Amount value={t.credit} /></td></tr>
            </tbody>
          </table>
        </div>
        {e.attachments.length ? <div className="flex flex-wrap gap-2">{e.attachments.map((f, i) => <a key={i} href={f.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-lg border border-line px-2 py-1 text-[13px] font-semibold text-primary"><Paperclip className="size-3.5" />{f.name}</a>)}</div> : null}
        {ask === "reverse" ? (
          <div className="grid gap-2 rounded-xl border border-danger/40 p-3 sm:grid-cols-[160px_minmax(0,1fr)_auto] sm:items-end">
            <Input label="تاريخ القيد العكسي" type="date" dir="ltr" value={date} onChange={(x) => setDate(x.target.value)} />
            <Input label="السبب" value={text} onChange={(x) => setText(x.target.value)} />
            <Button variant="danger" loading={busy} onClick={() => run(() => reverseEntry(db, e.id, { date, memo: text.trim() ? `عكس القيد ${entryRef(e)}: ${text.trim()}` : undefined }, actor), "تم عمل القيد العكسي")}>تأكيد العكس</Button>
          </div>
        ) : null}
        {ask === "reject" ? (
          <div className="grid gap-2 rounded-xl border border-danger/40 p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
            <Input label="سبب الرفض" value={text} onChange={(x) => setText(x.target.value)} />
            <Button variant="danger" loading={busy} disabled={!text.trim()} onClick={() => run(() => rejectEntry(db, e.id, text, actor), "تم رفض القيد")}>تأكيد الرفض</Button>
          </div>
        ) : null}
        {ask === "template" ? (
          <div className="grid gap-2 rounded-xl border border-line p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
            <Input label="اسم القالب" value={text} onChange={(x) => setText(x.target.value)} />
            <Button loading={busy} disabled={!text.trim()} onClick={() => run(() => saveTemplate(db, null, text, { memo: e.memo, lines: e.lines, branchId: e.branchId }), "تم حفظ القالب", false)}>حفظ القالب</Button>
          </div>
        ) : null}
      </div>
    </Dialog>
  );
}

/** قوالب القيود والقيود المتكررة: saved shapes of entries; a recurring one makes a draft every month on its day. */
export function ToolsDialog({ fin, mode, onClose, onUse }: { fin: Fin; mode: "templates" | "recurring"; onClose: () => void; onUse: (t: TemplateData) => void }) {
  const db = useDb();
  const { toast } = useToast();
  const docs = useLive("finDocs", { where: { kind: mode === "templates" ? TEMPLATE : RECURRING } }).data;
  const [edit, setEdit] = useState<FinDoc | "new" | null>(null);
  const [name, setName] = useState("");
  const [memo, setMemo] = useState("");
  const [day, setDay] = useState("1");
  const [lines, setLines] = useState<Draft[]>([blankLine(), blankLine()]);
  const start = (doc: FinDoc | "new") => {
    const data = doc === "new" ? null : (doc.data as unknown as RecurringData);
    setName(doc === "new" ? "" : doc.name);
    setMemo(data?.memo ?? "");
    setDay(String(data?.day ?? 1));
    setLines(data?.lines?.length ? data.lines.map(toDraft) : [blankLine(), blankLine()]);
    setEdit(doc);
  };
  const save = async () => {
    try {
      const row = edit === "new" ? null : edit;
      const data = { memo, lines: toLines(lines), branchId: null };
      if (mode === "templates") await saveTemplate(db, row, name, data);
      else await saveRecurring(db, row, name, { ...data, day: Math.min(28, Math.max(1, Number(day) || 1)), lastRun: (row?.data as unknown as RecurringData | undefined)?.lastRun ?? null, until: null }, row ? row.status === "active" : true);
      toast({ tone: "success", title: "تم الحفظ" });
      setEdit(null);
    } catch (e) { toast({ tone: "error", title: "تعذر الحفظ", description: err(e) }); }
  };
  const title = mode === "templates" ? "قوالب القيود" : "قيود متكررة";
  return (
    <Dialog open onClose={onClose} size="xl" title={title} footer={edit ? <div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => setEdit(null)}>رجوع</Button><Button disabled={!name.trim()} onClick={save}>حفظ</Button></div> : <div className="flex justify-end gap-2"><Button variant="ghost" onClick={onClose}>إغلاق</Button><Button icon={<Plus />} onClick={() => start("new")}>{mode === "templates" ? "قالب جديد" : "قيد متكرر جديد"}</Button></div>}>
      {edit ? (
        <div className="grid gap-3">
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_160px]">
            <Input label="الاسم" value={name} onChange={(e) => setName(e.target.value)} />
            {mode === "recurring" ? <Input label="يوم الشهر (1 إلى 28)" dir="ltr" inputMode="numeric" value={day} onChange={(e) => setDay(e.target.value)} /> : <span />}
          </div>
          <Input label="البيان" value={memo} onChange={(e) => setMemo(e.target.value)} />
          <LinesEditor fin={fin} lines={lines} onChange={setLines} />
        </div>
      ) : docs.length ? (
        <ul className="grid gap-2">
          {docs.map((d) => {
            const data = d.data as unknown as RecurringData;
            return (
              <li key={d.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-line p-3">
                <span className="min-w-0 flex-1"><b>{d.name}</b><span className="block text-[13px] text-muted">{data.lines.length} سطر · <span className="num" dir="ltr">{fmt(totalsOf(data.lines).debit)}</span>{mode === "recurring" ? ` · يوم ${data.day} من كل شهر${d.status === "active" ? "" : " · موقوف"}` : ""}</span></span>
                {mode === "templates" ? <Button size="sm" onClick={() => onUse(data)}>استخدام</Button> : <Button size="sm" variant="secondary" onClick={() => void db.update("finDocs", d.id, { status: d.status === "active" ? "stopped" : "active" })}>{d.status === "active" ? "إيقاف" : "تفعيل"}</Button>}
                <Button size="sm" variant="outline" onClick={() => start(d)}>تعديل</Button>
                <IconButton label="حذف" onClick={() => void db.remove("finDocs", d.id)}><Trash2 /></IconButton>
              </li>
            );
          })}
        </ul>
      ) : <EmptyState compact icon={mode === "templates" ? <FilePlus2 /> : <Repeat />} title={mode === "templates" ? "لا توجد قوالب" : "لا توجد قيود متكررة"} body={mode === "templates" ? "احفظ قيد يتكرر كقالب واستدعيه بضغطة." : "قيد يتجهز كل شهر كمسودة في يومه، وتراجعه قبل الترحيل."} />}
    </Dialog>
  );
}
