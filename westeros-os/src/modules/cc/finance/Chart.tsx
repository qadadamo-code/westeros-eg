/** شجرة الحسابات: the tree with balances, and everything that can be done to an account. */
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeftRight, ChevronDown, ChevronLeft, ChevronsDownUp, ChevronsUpDown, FileText, ListTree, Lock, Merge, MoreVertical, Pencil, Plus, Power, Search, Sparkles, Trash2 } from "lucide-react";
import { useDb } from "@/data/hooks";
import type { FinAccount } from "@/data/financeTypes";
import { cn } from "@/lib/cn";
import { Badge, Button, Card, Dialog, EmptyState, IconButton, Input, MenuItem, MenuSeparator, Popover, Select, Switch, Textarea, useToast } from "@/ui";
import { ExcelImport } from "../catalog/Import";
import { ExportButton, ReadOnly } from "../ui";
import { IMPORT_FIELDS, importAccounts, loadDefaultChart, mergeAccounts, moveAccount, removeAccount, saveAccount, type AccountFields } from "./ops";
import { useFinPerms } from "./perms";
import { balanceOf, CASHFLOWS, deleteProblem, isDebit, KINDS, MAX_LEVEL, movement, moveProblem, nextCode, rollup, typeInfo, TYPES, usageOf } from "./tree";
import { AccountSelect, Amount, BranchSelect, fmt, fromText, periodLabel, periodOf, PeriodPicker, PrintButton, printTable, toText, type Period, Toolbar } from "./ui";
import { useFinance, type Fin } from "./useFinance";
import { baseOf, currencyName, isForeign } from "./currency";

const err = (e: unknown) => String((e as Error).message ?? e);

export default function Chart() {
  const fin = useFinance();
  const db = useDb();
  const nav = useNavigate();
  const { toast } = useToast();
  const perms = useFinPerms();
  const canEdit = perms.has("chart.edit");
  const canShape = perms.has("chart.restructure");
  const [q, setQ] = useState("");
  const [type, setType] = useState("");
  const [status, setStatus] = useState("active");
  const [branch, setBranch] = useState("");
  const [period, setPeriod] = useState<Period>(periodOf("all"));
  const [open, setOpen] = useState<Set<string> | null>(null);
  const [edit, setEdit] = useState<{ row: FinAccount | null; parent: string | null } | null>(null);
  const [move, setMove] = useState<FinAccount | null>(null);
  const [merge, setMerge] = useState<FinAccount | null>(null);
  const [del, setDel] = useState<FinAccount | null>(null);
  const [busy, setBusy] = useState(false);

  const { ix, accounts } = fin;
  // first view: the first two levels are open
  const expanded = useMemo(() => open ?? new Set(accounts.filter((a) => ix.level(a.code) < 2).map((a) => a.code)), [open, accounts, ix]);
  const toLevel = (lvl: number) => setOpen(new Set(accounts.filter((a) => ix.level(a.code) < lvl).map((a) => a.code)));
  const rolled = useMemo(() => rollup(accounts, movement(fin.entries, { from: period.from, to: period.to, branchId: branch || null })), [accounts, fin.entries, period, branch]);

  const needle = q.trim().toLowerCase();
  const filtering = !!needle || !!type || status !== "active" || !!branch;
  const rows = useMemo(() => {
    const match = (a: FinAccount) =>
      (!needle || a.code.startsWith(needle) || a.name.ar.toLowerCase().includes(needle) || a.name.en.toLowerCase().includes(needle)) &&
      (!type || a.type === type) && (status === "all" || (status === "active" ? a.active : !a.active)) && (!branch || !a.branchId || a.branchId === branch);
    if (!filtering) return ix.ordered().filter((a) => ix.path(a.code).slice(0, -1).every((p) => expanded.has(p.code)));
    const keep = new Set<string>();
    for (const a of accounts) if (match(a)) for (const p of ix.path(a.code)) keep.add(p.code);
    return ix.ordered().filter((a) => keep.has(a.code));
  }, [accounts, ix, expanded, needle, type, status, branch, filtering]);

  const toggle = (code: string) => { const n = new Set(expanded); if (n.has(code)) n.delete(code); else n.add(code); setOpen(n); };
  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try { await fn(); toast({ tone: "success", title: ok }); } catch (e) { toast({ tone: "error", title: "تعذر التنفيذ", description: err(e), duration: 9000 }); } finally { setBusy(false); }
  };
  const loadReady = () => run(async () => { const n = await loadDefaultChart(db); if (!n) throw new Error("كل حسابات الشجرة الجاهزة موجودة بالفعل"); }, "تم تحميل الشجرة الجاهزة");
  const alertOf = (a: FinAccount, bal: number): string | null =>
    bal < 0 && a.postable ? "الرصيد عكس طبيعة الحساب" : a.alertMax != null && bal > a.alertMax ? `تجاوز الحد ${fmt(a.alertMax)}` : a.alertMin != null && bal < a.alertMin ? `أقل من الحد ${fmt(a.alertMin)}` : null;

  const exportRows = () => ix.ordered().map((a) => [a.code, a.name.ar, a.name.en, a.parentCode ?? "", ix.level(a.code), typeInfo(a.type).ar, isDebit(a.type) ? "مدين" : "دائن", a.postable ? "نهائي" : "تجميعي", a.active ? "نشط" : "موقوف", Math.round(balanceOf(a.type, rolled.get(a.code)) / 1000) / 100]);
  const print = () => printTable("شجرة الحسابات", `${periodLabel(period)} · ${branch ? fin.branchName(branch) : "كل الفروع"}`, ["الكود", "اسم الحساب", "النوع", "الرصيد"],
    rows.map((a) => [a.code, { text: a.name.ar, indent: ix.level(a.code) - 1, bold: !a.postable }, typeInfo(a.type).ar, { text: fmt(balanceOf(a.type, rolled.get(a.code))), align: "end" as const, bold: !a.postable }]));

  if (!fin.loading && !accounts.length) {
    return (
      <Card className="p-6">
        <EmptyState icon={<ListTree />} title="لا توجد شجرة حسابات بعد" body="حمّل الشجرة الجاهزة المقترحة لمطعم بمطبخ مركزي وفروع، أو استورد شجرتك من ملف اكسل. تقدر تعدل وتضيف أي حساب بعد كده."
          action={canEdit ? (
            <div className="flex flex-wrap justify-center gap-2">
              <Button icon={<Sparkles />} loading={busy} onClick={loadReady}>تحميل الشجرة الجاهزة</Button>
              <ExcelImport fields={IMPORT_FIELDS} run={(sheet, dry) => importAccounts(db, sheet, dry)} skipNote="من غير كود صحيح، أو كود جديد من غير اسم أو من غير أب." />
            </div>
          ) : undefined} />
      </Card>
    );
  }

  return (
    <div className="grid gap-4">
      <Toolbar collapse fold actions={<>{canEdit ? <Button icon={<Plus />} onClick={() => setEdit({ row: null, parent: null })}>إضافة حساب</Button> : null}</>} more={<><Button variant="secondary" icon={<ChevronsUpDown />} onClick={() => toLevel(MAX_LEVEL)}>فتح الكل</Button><Button variant="secondary" icon={<ChevronsDownUp />} onClick={() => toLevel(1)}>قفل الكل</Button>{canEdit ? <ExcelImport fields={IMPORT_FIELDS} run={(sheet, dry) => importAccounts(db, sheet, dry)} skipNote="من غير كود صحيح، أو كود جديد من غير اسم أو من غير أب." /> : null}<ExportButton file="شجرة-الحسابات" head={["الكود", "اسم الحساب", "الاسم بالإنجليزية", "كود الأب", "المستوى", "النوع", "الطبيعة", "تجميعي أو نهائي", "الحالة", "الرصيد"]} rows={exportRows} /><PrintButton onClick={print} />{canEdit ? <Button variant="secondary" icon={<Sparkles />} loading={busy} onClick={loadReady}>تحميل الشجرة الجاهزة</Button> : null}</>}>
        <Input label="بحث" wrapClassName="fin-wide" className="w-52" icon={<Search />} placeholder="كود أو اسم" value={q} onChange={(e) => setQ(e.target.value)} />
        <Select label="النوع" className="w-40" value={type} onChange={(e) => setType(e.target.value)} options={[{ value: "", label: "كل الأنواع" }, ...TYPES.map((t) => ({ value: t.id, label: t.ar }))]} />
        <Select label="الحالة" className="w-32" value={status} onChange={(e) => setStatus(e.target.value)} options={[{ value: "active", label: "نشط" }, { value: "stopped", label: "موقوف" }, { value: "all", label: "الكل" }]} />
        <BranchSelect fin={fin} value={branch} onChange={setBranch} />
        <PeriodPicker value={period} onChange={setPeriod} startMonth={fin.settings.yearStartMonth} />
        <Select label="المستوى الظاهر" className="w-40" value="" onChange={(e) => e.target.value && toLevel(Number(e.target.value))} options={[{ value: "", label: "اختر" }, ...Array.from({ length: MAX_LEVEL }, (_, i) => ({ value: String(i + 1), label: `حتى المستوى ${i + 1}` }))]} />
      </Toolbar>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto thin-scrollbar">
          <table className="w-full border-separate border-spacing-0 text-[14px]">
            <thead>
              <tr className="text-[12.5px] text-muted">
                <th className="border-b border-line px-3 py-2.5 text-start font-semibold">الحساب</th>
                <th className="hidden border-b border-line px-3 py-2.5 text-start font-semibold md:table-cell">النوع</th>
                <th className="hidden border-b border-line px-3 py-2.5 text-start font-semibold lg:table-cell">الطبيعة</th>
                <th className="border-b border-line px-3 py-2.5 text-end font-semibold">الرصيد (ج.م)</th>
                <th className="border-b border-line px-2 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {rows.map((a) => {
                const lvl = ix.level(a.code);
                const kids = ix.kids(a.code).length;
                const bal = balanceOf(a.type, rolled.get(a.code));
                const warn = alertOf(a, bal);
                return (
                  <tr key={a.id} className={cn("group hover:bg-surface-2", !a.active && "opacity-55")}>
                    <td className="border-b border-line/60 py-2 pe-3" style={{ paddingInlineStart: 12 + (lvl - 1) * 22 }}>
                      <span className="flex items-center gap-2">
                        {kids ? (
                          <button type="button" aria-label={expanded.has(a.code) ? "قفل" : "فتح"} aria-expanded={expanded.has(a.code) || filtering} className="grid size-6 shrink-0 place-items-center rounded-md text-muted hover:bg-surface-3 hover:text-ink" onClick={() => toggle(a.code)}>
                            {expanded.has(a.code) || filtering ? <ChevronDown className="size-4" /> : <ChevronLeft className="size-4" />}
                          </button>
                        ) : <span className="size-6 shrink-0" />}
                        <button type="button" className="flex min-w-0 items-center gap-2 text-start" onClick={() => (a.postable ? nav(`/finance/reports/ledger?account=${a.id}`) : toggle(a.code))}>
                          <span className="num shrink-0 text-muted" dir="ltr">{a.code}</span>
                          <span className={cn("truncate", !a.postable && "font-bold", lvl === 1 && "text-[15.5px]")}>{a.name.ar}</span>
                        </button>
                        {a.system ? <span title="حساب نظام مربوط بقسم في السيستم"><Lock className="size-3.5 shrink-0 text-brass" /></span> : null}
                        {!a.active ? <Badge size="sm" tone="neutral">موقوف</Badge> : null}
                        {!a.allowManual && a.postable ? <Badge size="sm" tone="info">تلقائي فقط</Badge> : null}
                        {a.branchId ? <Badge size="sm" tone="neutral">{fin.branchName(a.branchId)}</Badge> : null}
                        {a.postable && isForeign(a, fin.settings) ? <Badge size="sm" tone="brass">{a.currency}</Badge> : null}
                        {warn ? <Badge size="sm" tone="warn">{warn}</Badge> : null}
                      </span>
                    </td>
                    <td className="hidden border-b border-line/60 px-3 py-2 text-muted md:table-cell">{typeInfo(a.type).ar}</td>
                    <td className="hidden border-b border-line/60 px-3 py-2 text-muted lg:table-cell">{isDebit(a.type) ? "مدين" : "دائن"}</td>
                    <td className={cn("border-b border-line/60 px-3 py-2 text-end", !a.postable && "font-bold")}><Amount value={bal} tone="auto" /></td>
                    <td className="border-b border-line/60 px-2 py-1 text-end">
                      <Popover align="end" width="w-56" trigger={({ props }) => <IconButton label={`إجراءات ${a.name.ar}`} size="sm" {...props}><MoreVertical /></IconButton>}>
                        {(close) => (
                          <>
                            {a.postable ? <MenuItem icon={<FileText />} onClick={() => { close(); nav(`/finance/reports/ledger?account=${a.id}`); }}>كشف حساب</MenuItem> : null}
                            {canEdit && lvl < MAX_LEVEL ? <MenuItem icon={<Plus />} onClick={() => { close(); setEdit({ row: null, parent: a.code }); }}>إضافة حساب فرعي</MenuItem> : null}
                            {canEdit ? <MenuItem icon={<Pencil />} onClick={() => { close(); setEdit({ row: a, parent: a.parentCode }); }}>تعديل</MenuItem> : null}
                            {canEdit && a.parentCode && !a.system ? <MenuItem icon={<Power />} onClick={() => { close(); void run(() => db.update("finAccounts", a.id, { active: !a.active }), a.active ? "تم إيقاف الحساب" : "تم تفعيل الحساب"); }}>{a.active ? "إيقاف" : "تفعيل"}</MenuItem> : null}
                            {canShape && a.parentCode ? <><MenuSeparator /><MenuItem icon={<ArrowLeftRight />} onClick={() => { close(); setMove(a); }}>نقل</MenuItem></> : null}
                            {canShape && a.postable && !a.system ? <MenuItem icon={<Merge />} onClick={() => { close(); setMerge(a); }}>دمج في حساب آخر</MenuItem> : null}
                            {canShape && a.parentCode ? <MenuItem danger icon={<Trash2 />} onClick={() => { close(); setDel(a); }}>حذف</MenuItem> : null}
                          </>
                        )}
                      </Popover>
                    </td>
                  </tr>
                );
              })}
              {!rows.length ? <tr><td colSpan={5} className="px-3 py-10 text-center text-muted">لا توجد حسابات مطابقة</td></tr> : null}
            </tbody>
          </table>
        </div>
      </Card>
      <p className="text-[12.5px] text-muted">عدد الحسابات: <span className="num">{accounts.length}</span>. الحساب التجميعي رصيده مجموع ما تحته، والقيود تسجل على الحسابات النهائية فقط.</p>

      {edit ? <AccountDialog key={edit.row?.id ?? `new-${edit.parent}`} fin={fin} row={edit.row} parent={edit.parent} onClose={() => setEdit(null)} /> : null}
      {move ? <MoveDialog key={move.id} fin={fin} row={move} onClose={() => setMove(null)} /> : null}
      {merge ? <MergeDialog key={merge.id} fin={fin} row={merge} onClose={() => setMerge(null)} /> : null}
      {del ? <DeleteDialog key={del.id} fin={fin} row={del} onClose={() => setDel(null)} /> : null}
    </div>
  );
}

function useAct(onClose: () => void) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const act = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try { await fn(); toast({ tone: "success", title: ok }); onClose(); } catch (e) { toast({ tone: "error", title: "تعذر الحفظ", description: err(e), duration: 9000 }); } finally { setBusy(false); }
  };
  return { busy, act };
}

function AccountDialog({ fin, row, parent: firstParent, onClose }: { fin: Fin; row: FinAccount | null; parent: string | null; onClose: () => void }) {
  const db = useDb();
  const { busy, act } = useAct(onClose);
  const used = useMemo(() => (row ? usageOf(row, fin.accounts, fin.entries) : { lines: 0, children: 0 }), [row, fin.accounts, fin.entries]);
  const [parentId, setParentId] = useState(fin.ix.byCode.get(firstParent ?? "")?.id ?? "");
  const parent = fin.byId.get(parentId) ?? null;
  const suggest = (p: FinAccount | null) => { try { return p ? nextCode(p.code, fin.accounts) : ""; } catch { return ""; } };
  const [d, setD] = useState(() => ({
    code: row?.code ?? suggest(parent), ar: row?.name.ar ?? "", en: row?.name.en ?? "", postable: row?.postable ?? true, kind: row?.kind ?? parent?.kind ?? "general",
    cashflow: row?.cashflow ?? parent?.cashflow ?? "operating", branchId: row?.branchId ?? parent?.branchId ?? "", requireCentre: row?.requireCentre ?? false, allowManual: row?.allowManual ?? true,
    alertMin: toText(row?.alertMin), alertMax: toText(row?.alertMax), active: row?.active ?? true, note: row?.note ?? "", currency: row?.currency ?? "",
  }));
  // a new account follows the parent that is picked
  useEffect(() => {
    if (row || !parent) return;
    setD((x) => ({ ...x, code: suggest(parent), kind: parent.kind, cashflow: parent.cashflow ?? "operating", branchId: parent.branchId ?? "" }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parentId]);
  const type = parent?.type ?? row?.type ?? null;
  const root = !!row && !row.parentCode;
  const locked = used.lines > 0;
  const fields: AccountFields = {
    code: d.code.trim(), name: { ar: d.ar, en: d.en }, parentCode: root ? null : parent?.code ?? null, postable: d.postable, kind: d.kind, cashflow: d.cashflow, branchId: d.branchId || null,
    requireCentre: d.requireCentre, allowManual: d.allowManual, alertMin: d.alertMin.trim() ? fromText(d.alertMin) : null, alertMax: d.alertMax.trim() ? fromText(d.alertMax) : null, active: d.active, note: d.note.trim(),
    ...(d.postable ? { currency: d.currency || null } : {}),
  };
  const level = parent ? fin.ix.level(parent.code) + 1 : 1;
  return (
    <Dialog open onClose={onClose} size="lg" title={row ? `تعديل حساب ${row.code}` : "إضافة حساب"}
      footer={<div className="flex justify-end gap-2"><Button variant="ghost" onClick={onClose}>إلغاء</Button><Button loading={busy} disabled={!d.ar.trim() || !d.code.trim() || (!root && !parent)} onClick={() => act(() => saveAccount(db, row, fields), "تم حفظ الحساب")}>حفظ</Button></div>}>
      <div className="grid gap-3 sm:grid-cols-2">
        {root ? <ReadOnly label="الحساب الأب">حساب رئيسي</ReadOnly> : row
          ? <ReadOnly label="الحساب الأب">{parent ? `${parent.code} · ${parent.name.ar}` : "—"}<span className="block text-[12px] text-muted">للتغيير استخدم "نقل"</span></ReadOnly>
          : <AccountSelect fin={fin} label="الحساب الأب" leaf={false} value={parentId} onChange={setParentId} filter={(a) => fin.ix.level(a.code) < MAX_LEVEL} placeholder="اختر الحساب الأب" />}
        <Input label={row ? "كود الحساب" : "كود الحساب (تلقائي، يمكن تعديله)"} dir="ltr" inputMode="numeric" value={d.code} disabled={root || locked} hint={locked ? "الحساب عليه حركات، الكود ثابت" : undefined} onChange={(e) => setD({ ...d, code: e.target.value.replace(/\D/g, "") })} />
        <Input label="اسم الحساب بالعربي" value={d.ar} onChange={(e) => setD({ ...d, ar: e.target.value })} autoFocus />
        <Input label="اسم الحساب بالإنجليزي (اختياري)" dir="ltr" value={d.en} onChange={(e) => setD({ ...d, en: e.target.value })} />
        <ReadOnly label="النوع والطبيعة">{type ? `${typeInfo(type).ar} · ${isDebit(type) ? "مدين" : "دائن"} · ${typeInfo(type).statement === "balance" ? "المركز المالي" : "قائمة الدخل"}` : "يتحدد من الحساب الأب"}</ReadOnly>
        <ReadOnly label="المستوى">المستوى <span className="num">{level}</span> من <span className="num">{MAX_LEVEL}</span></ReadOnly>
        <Select label="تجميعي أو نهائي" value={d.postable ? "leaf" : "parent"} disabled={root || locked || used.children > 0} onChange={(e) => setD({ ...d, postable: e.target.value === "leaf" })}
          options={[{ value: "leaf", label: "نهائي (يقبل قيود)" }, { value: "parent", label: "تجميعي (مجموع ما تحته)" }]} hint={locked ? "عليه حركات، يبقى نهائي" : used.children ? "تحته حسابات، يبقى تجميعي" : undefined} />
        <Select label="نوع الحساب الخاص" value={d.kind} onChange={(e) => setD({ ...d, kind: e.target.value as FinAccount["kind"] })} options={KINDS.map((k) => ({ value: k.id, label: k.ar }))} />
        <Select label="بند التدفقات النقدية" value={d.cashflow ?? "operating"} onChange={(e) => setD({ ...d, cashflow: e.target.value as NonNullable<FinAccount["cashflow"]> })} options={CASHFLOWS.map((k) => ({ value: k.id, label: k.ar }))} />
        <BranchSelect fin={fin} label="الفرع" className="w-full" value={d.branchId ?? ""} onChange={(v) => setD({ ...d, branchId: v })} />
        {d.postable ? <Select label="عملة الحساب" value={d.currency} disabled={locked} onChange={(e) => setD({ ...d, currency: e.target.value })}
          options={[{ value: "", label: `العملة الأساسية (${currencyName(baseOf(fin.settings))})` }, ...(fin.settings.currencies ?? []).filter((c) => c.code !== baseOf(fin.settings)).map((c) => ({ value: c.code, label: `${currencyName(c.code)} (${c.code})` })), ...(d.currency && !(fin.settings.currencies ?? []).some((c) => c.code === d.currency) ? [{ value: d.currency, label: `${currencyName(d.currency)} (${d.currency})` }] : [])]}
          hint={locked ? "الحساب عليه حركات، عملته ثابتة" : (fin.settings.currencies ?? []).length ? "التحويل منه لحساب بعملة تانية يطلب سعر الصرف" : "تضيف عملات تانية من ثوابت النظام، خانة الحسابات"} /> : null}
        <Input label="تنبيه لو الرصيد أقل من" dir="ltr" inputMode="decimal" placeholder="بدون" value={d.alertMin} onChange={(e) => setD({ ...d, alertMin: e.target.value })} />
        <Input label="تنبيه لو الرصيد أكبر من" dir="ltr" inputMode="decimal" placeholder="بدون" value={d.alertMax} onChange={(e) => setD({ ...d, alertMax: e.target.value })} />
        <div className="grid gap-2 sm:col-span-2">
          <Switch checked={d.allowManual} onChange={(v) => setD({ ...d, allowManual: v })} label="يقبل قيد يدوي" description="لو مقفول، الحساب يتحرك من السيستم فقط (مثل المخزون)" />
          <Switch checked={d.requireCentre} onChange={(v) => setD({ ...d, requireCentre: v })} label="مركز تكلفة إلزامي" description="القيد على الحساب لا يحفظ بدون مركز تكلفة" />
          {!root && !row?.system ? <Switch checked={d.active} onChange={(v) => setD({ ...d, active: v })} label="نشط" description="الموقوف يختفي من قوائم الاختيار ويبقى في التقارير" /> : null}
        </div>
        <Textarea label="ملاحظات" className="sm:col-span-2" rows={2} value={d.note} onChange={(e) => setD({ ...d, note: e.target.value })} />
        {row?.system ? <p className="text-[12.5px] text-muted sm:col-span-2">حساب نظام مربوط بقسم في السيستم: تقدر تغير اسمه وخصائصه، ولا يحذف ولا يتوقف.</p> : null}
      </div>
    </Dialog>
  );
}

function MoveDialog({ fin, row, onClose }: { fin: Fin; row: FinAccount; onClose: () => void }) {
  const db = useDb();
  const { busy, act } = useAct(onClose);
  const [to, setTo] = useState("");
  const target = fin.byId.get(to);
  const problem = to ? moveProblem(row, target, fin.accounts) : "";
  return (
    <Dialog open onClose={onClose} title={`نقل ${row.code} · ${row.name.ar}`}
      footer={<div className="flex justify-end gap-2"><Button variant="ghost" onClick={onClose}>إلغاء</Button><Button loading={busy} disabled={!target || !!problem} onClick={() => act(() => moveAccount(db, row, target!.code), "تم نقل الحساب")}>نقل</Button></div>}>
      <div className="grid gap-3">
        <AccountSelect fin={fin} label="الحساب الأب الجديد" leaf={false} value={to} onChange={setTo} filter={(a) => a.type === row.type && a.id !== row.id && a.code !== row.parentCode} />
        {problem ? <p className="text-[13.5px] font-semibold text-danger">{problem}</p> : null}
        <p className="text-[13px] text-muted">الحساب وكل ما تحته ينتقل ويأخذ أكواد جديدة تحت الأب الجديد. الحركات المسجلة عليه تبقى كما هي.</p>
      </div>
    </Dialog>
  );
}

function MergeDialog({ fin, row, onClose }: { fin: Fin; row: FinAccount; onClose: () => void }) {
  const db = useDb();
  const { busy, act } = useAct(onClose);
  const [into, setInto] = useState("");
  const [sure, setSure] = useState(false);
  const target = fin.byId.get(into);
  const lines = usageOf(row, fin.accounts, fin.entries).lines;
  return (
    <Dialog open onClose={onClose} title={`دمج ${row.code} · ${row.name.ar}`}
      footer={<div className="flex justify-end gap-2"><Button variant="ghost" onClick={onClose}>إلغاء</Button><Button variant="danger" loading={busy} disabled={!target || !sure} onClick={() => act(() => mergeAccounts(db, row, target!), "تم دمج الحسابين")}>دمج</Button></div>}>
      <div className="grid gap-3">
        <AccountSelect fin={fin} label="يدمج في الحساب" value={into} onChange={setInto} filter={(a) => a.type === row.type && a.id !== row.id} />
        <p className="text-[13.5px]">كل حركات الحساب (<span className="num">{lines}</span> سطر) تنتقل للحساب المختار، ثم يحذف الحساب <b>{row.name.ar}</b>. العملية تسجل في السجل.</p>
        <label className="flex cursor-pointer items-center gap-2.5 text-[14px]"><input type="checkbox" className="size-4.5 accent-[var(--color-brand,#F8BB18)]" checked={sure} onChange={(e) => setSure(e.target.checked)} />متأكد من الدمج</label>
      </div>
    </Dialog>
  );
}

function DeleteDialog({ fin, row, onClose }: { fin: Fin; row: FinAccount; onClose: () => void }) {
  const db = useDb();
  const { busy, act } = useAct(onClose);
  const problem = deleteProblem(row, usageOf(row, fin.accounts, fin.entries));
  return (
    <Dialog open onClose={onClose} size="sm" title={`حذف ${row.code} · ${row.name.ar}`}
      footer={<div className="flex justify-end gap-2"><Button variant="ghost" onClick={onClose}>{problem ? "إغلاق" : "إلغاء"}</Button>{problem ? null : <Button variant="danger" loading={busy} onClick={() => act(() => removeAccount(db, row), "تم حذف الحساب")}>حذف</Button>}</div>}>
      <p className="text-[14.5px]">{problem || "الحساب ليس عليه حركات وليس تحته حسابات. هل تريد حذفه؟ تقدر ترجعه من السجل والاسترجاع."}</p>
    </Dialog>
  );
}
