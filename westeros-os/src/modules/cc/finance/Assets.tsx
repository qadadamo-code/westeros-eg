/** الأصول الثابتة: سجل الأصول، إهلاك الشهر بقيد واحد، جدول إهلاك كل أصل، والبيع أو الاستبعاد. */
import { useMemo, useState } from "react";
import { Armchair, Pencil, Play, Plus, Trash2 } from "lucide-react";
import { useDb, useLive } from "@/data/hooks";
import type { FinDoc, FinEntry } from "@/data/financeTypes";
import { cn } from "@/lib/cn";
import { Badge, Button, Card, Dialog, EmptyState, Input, Select, Textarea, useToast } from "@/ui";
import { fmtDay } from "../lib";
import { ExportButton } from "../ui";
import { accumulated, ASSET, ASSET_TYPES, assetOf, assetProblem, bookValue, depreciationDue, disposeAsset, METHODS, runDepreciation, saveAsset, schedule, typeLabel, type AssetData } from "./assets";
import { entryRef } from "./journal";
import { EntryView } from "./Journal";
import { useActor, useFinPerms } from "./perms";
import { MONEY_LABEL, moneyAccounts } from "./treasury";
import { BranchSelect, Confirm, fmt, fromText, PrintButton, printTable, toText, today, Toolbar } from "./ui";
import { useFinance, type Fin } from "./useFinance";

const err = (e: unknown) => String((e as Error)?.message ?? e);
const label = (m: string) => m.split("-").reverse().join("/");

export default function Assets() {
  const fin = useFinance();
  const db = useDb();
  const { toast } = useToast();
  const perms = useFinPerms();
  const can = perms.has("vouchers");
  const docs = useLive("finDocs").data;
  const assets = useMemo(() => docs.filter((d) => d.kind === ASSET).sort((a, b) => Number(a.code) - Number(b.code)), [docs]);
  const [edit, setEdit] = useState<FinDoc | "new" | null>(null);
  const [show, setShow] = useState<FinDoc | null>(null);
  const [sell, setSell] = useState<FinDoc | null>(null);
  const [ask, setAsk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState<FinEntry | null>(null);
  const [type, setType] = useState("");
  const month = today().slice(0, 7);
  const due = useMemo(() => depreciationDue(docs, month), [docs, month]);
  const dueSum = due.reduce((s, d) => s + d.amount, 0);
  const live = assets.filter((d) => d.status === "active");
  const list = assets.filter((d) => !type || assetOf(d).typeKey === type);
  const sum = live.reduce((s, d) => { const a = assetOf(d); return { cost: s.cost + a.cost, acc: s.acc + accumulated(a) }; }, { cost: 0, acc: 0 });
  const head = ["كود", "الأصل", "النوع", "الفرع", "تاريخ الشراء", "التكلفة", "مجمع الإهلاك", "القيمة الدفترية", "الحالة"];
  const cells = (d: FinDoc) => { const a = assetOf(d); return [d.code, d.name, typeLabel(a.typeKey), fin.branchName(d.branchId), fmtDay(a.bought), a.cost, accumulated(a), bookValue(a), d.status === "active" ? "في الخدمة" : "مستبعد"] as const; };
  const run = async () => {
    setBusy(true);
    try { const made = await runDepreciation(db, month, today()); toast({ tone: "success", title: made.length ? `تم ترحيل ${made.length} قيد إهلاك` : "لا يوجد إهلاك مستحق" }); setAsk(false); }
    catch (e) { toast({ tone: "error", title: "تعذر", description: err(e), duration: 9000 }); } finally { setBusy(false); }
  };
  return (
    <div className="grid gap-4">
      <Toolbar actions={<>{can ? <Button icon={<Plus />} onClick={() => setEdit("new")}>أصل جديد</Button> : null}</>} more={<><ExportButton file="سجل-الأصول-الثابتة" head={[...head]} rows={() => list.map((d) => cells(d).map((c, i) => (i >= 5 && i <= 7 ? (c as number) / 100000 : c)))} /><PrintButton onClick={() => printTable("سجل الأصول الثابتة", fmtDay(today()), [...head], list.map((d) => cells(d).map((c, i) => (i >= 5 && i <= 7 ? { text: fmt(c as number), align: "end" as const } : String(c)))))} /></>}>
        <Select label="النوع" className="w-56" value={type} onChange={(e) => setType(e.target.value)} options={[{ value: "", label: "كل الأنواع" }, ...ASSET_TYPES.map((t) => ({ value: t.key, label: t.label }))]} />
      </Toolbar>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[["تكلفة الأصول في الخدمة", sum.cost], ["مجمع الإهلاك", sum.acc], ["القيمة الدفترية", sum.cost - sum.acc]].map(([l, v]) => <Card key={l as string} className="p-3"><div className="text-[12.5px] text-muted">{l}</div><div className="num text-[18px] font-bold" dir="ltr">{fmt(v as number)}</div></Card>)}
        <Card className={cn("flex items-center gap-2 p-3", dueSum && "border-brass/50 bg-brass/10")}>
          <div className="min-w-0 flex-1"><div className="text-[12.5px] text-muted">إهلاك مستحق حتى {label(month)}</div><div className="num text-[18px] font-bold" dir="ltr">{fmt(dueSum)}</div></div>
          {perms.has("journal.approve") && dueSum ? <Button size="sm" icon={<Play />} onClick={() => setAsk(true)}>سجل الإهلاك</Button> : null}
        </Card>
      </div>
      {list.length ? (
        <Card className="overflow-hidden"><div className="overflow-x-auto thin-scrollbar"><table className="w-full text-[14px]">
          <thead><tr className="text-[12.5px] text-muted">{head.map((h, i) => <th key={h} className={cn("border-b border-line px-3 py-2.5 font-semibold", i >= 5 && i <= 7 ? "text-end" : "text-start")}>{h}</th>)}</tr></thead>
          <tbody>{list.map((d) => { const c = cells(d); return (
            <tr key={d.id} className="cursor-pointer border-t border-line/60 hover:bg-surface-2" onClick={() => setShow(d)}>
              <td className="num px-3 py-2 text-muted" dir="ltr">{c[0]}</td><td className="px-3 py-2 font-semibold">{c[1]}</td><td className="px-3 py-2">{c[2]}</td><td className="px-3 py-2">{c[3]}</td><td className="px-3 py-2">{c[4]}</td>
              <td className="num px-3 py-2 text-end" dir="ltr">{fmt(c[5])}</td><td className="num px-3 py-2 text-end" dir="ltr">{fmt(c[6], "—")}</td><td className="num px-3 py-2 text-end font-semibold" dir="ltr">{fmt(c[7])}</td>
              <td className="px-3 py-2"><Badge size="sm" tone={d.status === "active" ? "ok" : "neutral"}>{c[8]}</Badge></td>
            </tr>); })}</tbody>
        </table></div></Card>
      ) : <Card><EmptyState compact icon={<Armchair />} title="لا توجد أصول ثابتة" body="سجل المعدات والتجهيزات والأجهزة مرة واحدة، والسيستم يحسب إهلاكها كل شهر ويسجله بقيد." /></Card>}

      {edit ? <AssetDialog fin={fin} row={edit === "new" ? null : edit} onClose={() => setEdit(null)} /> : null}
      {show ? <AssetView fin={fin} doc={docs.find((d) => d.id === show.id) ?? show} onClose={() => setShow(null)} onEntry={(id) => { const e = fin.entries.find((x) => x.id === id); if (e) setView(e); }} onEdit={can && show.status === "active" ? () => { setEdit(show); setShow(null); } : undefined} onSell={can && show.status === "active" ? () => { setSell(show); setShow(null); } : undefined} /> : null}
      {sell ? <SellDialog fin={fin} doc={sell} onClose={() => setSell(null)} /> : null}
      <Confirm open={ask} onClose={() => setAsk(false)} onConfirm={run} loading={busy} title="تسجيل إهلاك الأصول" confirmLabel="سجل الإهلاك" description={`قيد لكل شهر مستحق حتى ${label(month)}: ${[...new Set(due.map((d) => d.month))].sort().map(label).join("، ")}. الإجمالي ${fmt(dueSum)} ج.م على ${new Set(due.map((d) => d.doc.id)).size} أصل.`} />
      {view ? <EntryView key={view.id} fin={fin} entry={fin.entries.find((x) => x.id === view.id) ?? view} onClose={() => setView(null)} onOpen={setView} /> : null}
    </div>
  );
}

function AssetDialog({ fin, row, onClose }: { fin: Fin; row: FinDoc | null; onClose: () => void }) {
  const db = useDb();
  const { toast } = useToast();
  const x = row ? assetOf(row) : null;
  const money = useMemo(() => moneyAccounts(fin.ix.ordered()), [fin.ix]);
  const [d, setD] = useState({
    name: row?.name ?? "", typeKey: x?.typeKey ?? ASSET_TYPES[0].key as string, cost: toText(x?.cost), salvage: toText(x?.salvage), years: x ? String(Math.round((x.lifeMonths / 12) * 100) / 100) : String(ASSET_TYPES[0].life / 12),
    method: x?.method ?? "straight", rate: x?.ratePct ? String(x.ratePct) : "20", bought: x?.bought ?? today(), start: x?.start ?? today().slice(0, 7), opening: toText(x?.opening), branchId: row?.branchId ?? fin.branchId ?? "",
    centreId: x?.centreId ?? "", serial: x?.serial ?? "", place: x?.place ?? "", note: x?.note ?? "", paidFrom: "",
  });
  const [busy, setBusy] = useState(false);
  const data: Omit<AssetData, "posted" | "buyEntryId" | "disposal"> = { typeKey: d.typeKey, cost: fromText(d.cost), salvage: fromText(d.salvage), lifeMonths: Math.round((Number(d.years) || 0) * 12), method: d.method, ratePct: Number(d.rate) || 0, bought: d.bought, start: d.start, opening: fromText(d.opening), centreId: d.centreId || null, serial: d.serial.trim(), place: d.place.trim(), note: d.note.trim() };
  const problem = assetProblem({ name: d.name, data });
  const preview = problem ? [] : schedule({ ...data, posted: [], buyEntryId: null, disposal: null });
  const locked = !!x && (x.posted.length > 0 || !!x.buyEntryId);
  const centres = fin.centres.filter((c) => c.active);
  const save = async () => {
    setBusy(true);
    try { await saveAsset(db, row, { name: d.name, branchId: d.branchId || null, data, paidFrom: d.paidFrom || undefined }); toast({ tone: "success", title: "تم الحفظ" }); onClose(); }
    catch (e) { toast({ tone: "error", title: "تعذر الحفظ", description: err(e), duration: 9000 }); } finally { setBusy(false); }
  };
  return (
    <Dialog open onClose={onClose} size="lg" title={row ? "تعديل أصل" : "أصل ثابت جديد"}
      footer={<div className="flex flex-wrap items-center justify-end gap-2">{problem ? <span className="me-auto text-[13px] font-semibold text-danger">{problem}</span> : preview.length ? <span className="me-auto text-[13px] text-muted">أول قسط {fmt(preview[0].amount)}، وينتهي الإهلاك {label(preview[preview.length - 1].month)}</span> : null}<Button variant="ghost" onClick={onClose}>إلغاء</Button><Button loading={busy} disabled={!!problem} onClick={save}>حفظ</Button></div>}>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Input label="اسم الأصل" autoFocus value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} />
        <Select label="النوع" value={d.typeKey} disabled={locked} onChange={(e) => { const t = ASSET_TYPES.find((y) => y.key === e.target.value); setD({ ...d, typeKey: e.target.value, years: t && !row ? String(t.life / 12) : d.years }); }} options={ASSET_TYPES.map((t) => ({ value: t.key, label: t.label }))} />
        <BranchSelect fin={fin} label="الفرع" className="w-full" all={null} value={d.branchId} onChange={(v) => setD({ ...d, branchId: v })} />
        <Input label="التكلفة (ج.م)" dir="ltr" inputMode="decimal" disabled={locked} value={d.cost} onChange={(e) => setD({ ...d, cost: e.target.value })} />
        <Input label="قيمة الخردة (ج.م)" dir="ltr" inputMode="decimal" placeholder="0" value={d.salvage} onChange={(e) => setD({ ...d, salvage: e.target.value })} hint="القيمة المتوقعة في آخر العمر، لا تهلك." />
        <Input label="تاريخ الشراء" type="date" dir="ltr" value={d.bought} onChange={(e) => setD({ ...d, bought: e.target.value, start: row ? d.start : e.target.value.slice(0, 7) })} />
        <Select label="طريقة الإهلاك" value={d.method} onChange={(e) => setD({ ...d, method: e.target.value as AssetData["method"] })} options={METHODS.map((m) => ({ value: m.id, label: m.label }))} />
        {d.method === "straight" ? <Input label="العمر (سنة)" dir="ltr" inputMode="decimal" value={d.years} onChange={(e) => setD({ ...d, years: e.target.value })} /> : <Input label="نسبة الإهلاك السنوية %" dir="ltr" inputMode="decimal" value={d.rate} onChange={(e) => setD({ ...d, rate: e.target.value })} />}
        <Input label="أول شهر إهلاك" type="month" dir="ltr" value={d.start} onChange={(e) => setD({ ...d, start: e.target.value })} />
        <Input label="مجمع إهلاك سابق (ج.م)" dir="ltr" inputMode="decimal" placeholder="0" disabled={locked} value={d.opening} onChange={(e) => setD({ ...d, opening: e.target.value })} hint="لأصل قديم اتهلك منه جزء قبل السيستم." />
        {centres.length ? <Select label="مركز التكلفة" value={d.centreId} onChange={(e) => setD({ ...d, centreId: e.target.value })} options={[{ value: "", label: "بدون مركز تكلفة" }, ...centres.map((c) => ({ value: c.id, label: c.name.ar }))]} /> : null}
        <Input label="الرقم التسلسلي" dir="ltr" value={d.serial} onChange={(e) => setD({ ...d, serial: e.target.value })} />
        <Input label="مكانه" value={d.place} onChange={(e) => setD({ ...d, place: e.target.value })} />
        {!row ? <Select label="قيد الشراء" className="lg:col-span-2" value={d.paidFrom} onChange={(e) => setD({ ...d, paidFrom: e.target.value })} options={[{ value: "", label: "بدون قيد (الأصل مسجل في الأرصدة الافتتاحية أو بفاتورة شراء)" }, ...money.map((a) => ({ value: a.id, label: `مدفوع من ${a.name.ar} (${MONEY_LABEL[a.kind]})` })), ...fin.ix.ordered().filter((a) => a.postable && a.active && a.kind === "supplier").map((a) => ({ value: a.id, label: `آجل على ${a.name.ar}` }))]} /> : null}
        <div className="sm:col-span-2 lg:col-span-3"><Textarea label="ملاحظات" rows={2} value={d.note} onChange={(e) => setD({ ...d, note: e.target.value })} /></div>
      </div>
    </Dialog>
  );
}

function AssetView({ fin, doc, onClose, onEntry, onEdit, onSell }: { fin: Fin; doc: FinDoc; onClose: () => void; onEntry: (id: string) => void; onEdit?: () => void; onSell?: () => void }) {
  const a = assetOf(doc);
  const rows = schedule(a);
  const entryOf = (month: string) => fin.entries.find((e) => e.sourceType === "depreciation" && (e.sourceId ?? "").split("#")[0] === month && !e.reversedBy && e.lines.some((l) => l.memo === doc.name));
  return (
    <Dialog open onClose={onClose} size="lg" title={`${doc.name} · ${typeLabel(a.typeKey)}`} footer={<div className="flex flex-wrap justify-end gap-2">{onSell ? <Button variant="outline" icon={<Trash2 />} onClick={onSell}>بيع أو استبعاد</Button> : null}{onEdit ? <Button variant="secondary" icon={<Pencil />} onClick={onEdit}>تعديل</Button> : null}<PrintButton onClick={() => printTable(`جدول إهلاك: ${doc.name}`, `التكلفة ${fmt(a.cost)} · الخردة ${fmt(a.salvage)}`, ["الشهر", "القسط", "القيمة الدفترية بعده", "الحالة"], rows.map((r) => [label(r.month), { text: fmt(r.amount), align: "end" as const }, { text: fmt(r.book), align: "end" as const }, r.posted ? "مسجل" : "قادم"]))} /><Button variant="ghost" onClick={onClose}>إغلاق</Button></div>}>
      <div className="grid gap-3 text-[14px]">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
          {[["التكلفة", fmt(a.cost)], ["مجمع الإهلاك", fmt(accumulated(a))], ["القيمة الدفترية", fmt(bookValue(a))], ["قيمة الخردة", fmt(a.salvage)], ["تاريخ الشراء", fmtDay(a.bought)], ["الطريقة", a.method === "straight" ? `قسط ثابت على ${Math.round((a.lifeMonths / 12) * 10) / 10} سنة` : `متناقص ${a.ratePct}% سنويا`], ["الفرع", fin.branchName(doc.branchId)], ["المكان", a.place || "—"]].map(([k, v]) => <div key={k}><dt className="text-[12.5px] text-muted">{k}</dt><dd className="font-semibold">{v}</dd></div>)}
        </dl>
        {a.disposal ? <p className="rounded-xl border border-line px-3 py-2">{a.disposal.proceeds ? `اتباع بـ ${fmt(a.disposal.proceeds)} ج.م` : "مستبعد بدون ثمن"} بتاريخ {fmtDay(a.disposal.date)}{a.disposal.note ? `: ${a.disposal.note}` : ""} {a.disposal.entryId ? <button type="button" className="font-semibold text-primary hover:underline" onClick={() => onEntry(a.disposal!.entryId!)}>القيد</button> : null}</p> : null}
        {a.buyEntryId ? <p><button type="button" className="font-semibold text-primary hover:underline" onClick={() => onEntry(a.buyEntryId!)}>قيد الشراء</button></p> : null}
        <div className="max-h-[46vh] overflow-auto thin-scrollbar rounded-xl border border-line"><table className="w-full">
          <thead className="sticky top-0 bg-surface"><tr className="text-[12.5px] text-muted">{["الشهر", "القسط", "القيمة الدفترية بعده", ""].map((h, i) => <th key={i} className={cn("border-b border-line px-3 py-2 font-semibold", i === 1 || i === 2 ? "text-end" : "text-start")}>{h}</th>)}</tr></thead>
          <tbody>{rows.map((r) => { const e = r.posted ? entryOf(r.month) : undefined; return (
            <tr key={r.month} className={cn("border-t border-line/60", !r.posted && "text-muted")}>
              <td className="num px-3 py-1.5" dir="ltr">{label(r.month)}</td><td className="num px-3 py-1.5 text-end" dir="ltr">{fmt(r.amount)}</td><td className="num px-3 py-1.5 text-end" dir="ltr">{fmt(r.book)}</td>
              <td className="px-3 py-1.5">{e ? <button type="button" className="num font-semibold text-primary hover:underline" dir="ltr" onClick={() => onEntry(e.id)}>{entryRef(e)}</button> : r.posted ? "مسجل" : "قادم"}</td>
            </tr>); })}</tbody>
        </table></div>
      </div>
    </Dialog>
  );
}

function SellDialog({ fin, doc, onClose }: { fin: Fin; doc: FinDoc; onClose: () => void }) {
  const db = useDb();
  const { toast } = useToast();
  const actor = useActor();
  const a = assetOf(doc);
  const money = useMemo(() => moneyAccounts(fin.ix.ordered()), [fin.ix]);
  const [d, setD] = useState({ date: today(), proceeds: "", moneyId: money[0]?.id ?? "", note: "" });
  const [busy, setBusy] = useState(false);
  const proceeds = fromText(d.proceeds), result = proceeds - bookValue(a);
  const save = async () => {
    setBusy(true);
    try { await disposeAsset(db, doc.id, { date: d.date, proceeds, moneyId: proceeds ? d.moneyId : null, note: d.note }, actor); toast({ tone: "success", title: proceeds ? "تم تسجيل بيع الأصل" : "تم استبعاد الأصل" }); onClose(); }
    catch (e) { toast({ tone: "error", title: "تعذر", description: err(e), duration: 9000 }); } finally { setBusy(false); }
  };
  return (
    <Dialog open onClose={onClose} title={`بيع أو استبعاد: ${doc.name}`} footer={<div className="flex flex-wrap items-center justify-end gap-2"><span className={cn("me-auto text-[13.5px] font-semibold", result < 0 ? "text-danger" : "text-ok")}>{result === 0 ? "بدون ربح أو خسارة" : result > 0 ? `ربح بيع ${fmt(result)}` : `خسارة ${fmt(-result)}`}</span><Button variant="ghost" onClick={onClose}>إلغاء</Button><Button variant="danger" loading={busy} onClick={save}>{proceeds ? "سجل البيع" : "استبعد الأصل"}</Button></div>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-line p-3 sm:col-span-2"><div className="text-[12.5px] text-muted">القيمة الدفترية الآن</div><div className="num text-[20px] font-bold" dir="ltr">{fmt(bookValue(a))}</div></div>
        <Input label="التاريخ" type="date" dir="ltr" value={d.date} onChange={(e) => setD({ ...d, date: e.target.value })} />
        <Input label="ثمن البيع (ج.م)" dir="ltr" inputMode="decimal" placeholder="صفر لو اتكهن" autoFocus value={d.proceeds} onChange={(e) => setD({ ...d, proceeds: e.target.value })} />
        {proceeds ? <Select label="استلمته خزينة أو بنك" className="sm:col-span-2" value={d.moneyId} onChange={(e) => setD({ ...d, moneyId: e.target.value })} options={[{ value: "", label: "اختر" }, ...money.map((m) => ({ value: m.id, label: `${m.name.ar} (${MONEY_LABEL[m.kind]})` }))]} /> : null}
        <div className="sm:col-span-2"><Textarea label="السبب أو المشتري" rows={2} value={d.note} onChange={(e) => setD({ ...d, note: e.target.value })} /></div>
      </div>
    </Dialog>
  );
}
