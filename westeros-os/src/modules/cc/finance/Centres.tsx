/** مراكز التكلفة: تعريف المراكز، توزيع مصروف مشترك على الفروع أو المراكز، وتوزيع مصروفات المطبخ المركزي كل شهر. */
import { useMemo, useState } from "react";
import { ChefHat, Pencil, Plus, Split, Target, Trash2 } from "lucide-react";
import { useDb, useLive } from "@/data/hooks";
import type { FinCentre, FinEntry, FinSettingsData } from "@/data/financeTypes";
import { Badge, Button, Card, Dialog, EmptyState, Input, Segmented, Select, Switch, useToast } from "@/ui";
import { fmtDay } from "../lib";
import { addSuggestedCentres, allocateKitchen, allocateShared, bookedOn, centreProblem, centreUsed, KITCHEN_METHODS, KITCHEN_SOURCE, kitchenPlan, nextCentreCode, removeCentre, saveCentre, SHARED_SOURCE, sharedPlan, SUGGESTED_CENTRES, type SharedInput } from "./centres";
import { amountOf, entryRef } from "./journal";
import { EntryView } from "./Journal";
import { saveSettings } from "./ops";
import { useActor, useFinPerms } from "./perms";
import { AccountSelect, Amount, Confirm, fmt, fromText, periodOf, PeriodPicker, today, type Period } from "./ui";
import { useFinance, type Fin } from "./useFinance";

const err = (e: unknown) => String((e as Error)?.message ?? e);
type Tab = "centres" | "shared" | "kitchen";

export default function Centres() {
  const fin = useFinance();
  const [tab, setTab] = useState<Tab>("centres");
  const [view, setView] = useState<FinEntry | null>(null);
  return (
    <div className="grid gap-4">
      <Segmented label="مراكز التكلفة" value={tab} onChange={setTab} options={[{ value: "centres", label: "المراكز" }, { value: "shared", label: "توزيع مصروف مشترك" }, { value: "kitchen", label: "المطبخ المركزي" }]} />
      {tab === "centres" ? <List fin={fin} /> : tab === "shared" ? <Shared fin={fin} onView={setView} /> : <Kitchen fin={fin} onView={setView} />}
      {view ? <EntryView key={view.id} fin={fin} entry={fin.entries.find((x) => x.id === view.id) ?? view} onClose={() => setView(null)} onOpen={setView} /> : null}
    </div>
  );
}

/* ───────── المراكز ───────── */

function List({ fin }: { fin: Fin }) {
  const db = useDb();
  const { toast } = useToast();
  const can = useFinPerms().has("settings");
  const [edit, setEdit] = useState<FinCentre | "new" | null>(null);
  const [del, setDel] = useState<FinCentre | null>(null);
  const [busy, setBusy] = useState(false);
  const month = periodOf("month", fin.settings.yearStartMonth);
  const rows = useMemo(() => {
    const tops = fin.centres.filter((c) => !c.parentId).sort((a, b) => a.code.localeCompare(b.code));
    return tops.flatMap((t) => [{ c: t, depth: 0 }, ...fin.centres.filter((c) => c.parentId === t.id).sort((a, b) => a.code.localeCompare(b.code)).map((c) => ({ c, depth: 1 }))]);
  }, [fin.centres]);
  /** what each centre carried this month on revenue, cost and expense accounts */
  const spent = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of fin.entries) {
      if (e.status !== "posted" || !month.from || e.date < month.from || e.date > month.to!) continue;
      for (const l of e.lines) { const t = fin.byId.get(l.account)?.type; if (l.centreId && (t === "expense" || t === "cogs")) m.set(l.centreId, (m.get(l.centreId) ?? 0) + l.debit - l.credit); }
    }
    return m;
  }, [fin.entries, fin.byId, month.from, month.to]);
  const missing = SUGGESTED_CENTRES.filter((n) => !fin.centres.some((c) => c.name.ar === n));
  const suggest = async () => { try { const n = await addSuggestedCentres(db, missing); toast({ tone: "success", title: `تمت إضافة ${n} مركز` }); } catch (e) { toast({ tone: "error", title: "تعذر", description: err(e) }); } };
  const remove = async () => {
    if (!del) return;
    setBusy(true);
    try { await removeCentre(db, del); toast({ tone: "success", title: "تم الحذف" }); setDel(null); } catch (e) { toast({ tone: "error", title: "تعذر الحذف", description: err(e) }); } finally { setBusy(false); }
  };
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <p className="min-w-0 flex-1 text-[13.5px] text-muted">مركز التكلفة يجاوب على سؤال: المصروف ده راح على أي قسم؟ تختاره على سطر القيد أو السند، وتشوف كل مركز في تقرير مراكز التكلفة.</p>
        {can && missing.length ? <Button variant="outline" onClick={suggest}>إضافة المراكز المقترحة</Button> : null}
        {can ? <Button icon={<Plus />} onClick={() => setEdit("new")}>مركز جديد</Button> : null}
      </div>
      {rows.length ? (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto thin-scrollbar">
            <table className="w-full text-[14px]">
              <thead><tr className="text-[12.5px] text-muted">{["الكود", "المركز", "الفرع", "مصروفات هذا الشهر", "سطور القيود", "الحالة", ""].map((h, i) => <th key={i} className="border-b border-line px-3 py-2.5 text-start font-semibold">{h}</th>)}</tr></thead>
              <tbody>
                {rows.map(({ c, depth }) => (
                  <tr key={c.id} className="border-t border-line/60">
                    <td className="num px-3 py-2 text-muted" dir="ltr">{c.code}</td>
                    <td className="px-3 py-2 font-semibold" style={{ paddingInlineStart: 12 + depth * 22 }}>{c.name.ar}</td>
                    <td className="px-3 py-2">{fin.branchName(c.branchId)}</td>
                    <td className="px-3 py-2"><Amount value={spent.get(c.id) ?? 0} /></td>
                    <td className="num px-3 py-2">{centreUsed(c.id, fin.entries) || "—"}</td>
                    <td className="px-3 py-2"><Badge size="sm" tone={c.active ? "ok" : "neutral"}>{c.active ? "شغال" : "موقوف"}</Badge></td>
                    <td className="px-3 py-2">{can ? <div className="flex justify-end gap-1"><Button size="sm" variant="ghost" icon={<Pencil />} aria-label="تعديل" onClick={() => setEdit(c)} /><Button size="sm" variant="ghost" icon={<Trash2 />} aria-label="حذف" onClick={() => setDel(c)} /></div> : null}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : <Card><EmptyState compact icon={<Target />} title="لا توجد مراكز تكلفة" body="أضف المراكز المقترحة (المطبخ، الصالة، التوصيل، الإدارة، التسويق) أو عرّف مراكزك." /></Card>}
      {edit ? <CentreDialog fin={fin} row={edit === "new" ? null : edit} onClose={() => setEdit(null)} /> : null}
      <Confirm open={!!del} onClose={() => setDel(null)} onConfirm={remove} loading={busy} danger title="حذف مركز التكلفة" confirmLabel="حذف" description={`حذف "${del?.name.ar ?? ""}"؟ المركز اللي عليه حركات لا يتحذف، ممكن توقفه بدلا من ذلك.`} />
    </>
  );
}

function CentreDialog({ fin, row, onClose }: { fin: Fin; row: FinCentre | null; onClose: () => void }) {
  const db = useDb();
  const { toast } = useToast();
  const [d, setD] = useState({ code: row?.code ?? nextCentreCode(fin.centres), nameAr: row?.name.ar ?? "", parentId: row?.parentId ?? "", branchId: row?.branchId ?? "", active: row?.active ?? true });
  const [busy, setBusy] = useState(false);
  const problem = centreProblem({ id: row?.id, code: d.code, nameAr: d.nameAr, parentId: d.parentId || null }, fin.centres);
  const save = async () => {
    setBusy(true);
    try { await saveCentre(db, row, { ...d, parentId: d.parentId || null, branchId: d.branchId || null }); toast({ tone: "success", title: "تم الحفظ" }); onClose(); } catch (e) { toast({ tone: "error", title: "تعذر الحفظ", description: err(e) }); } finally { setBusy(false); }
  };
  return (
    <Dialog open onClose={onClose} size="sm" title={row ? "تعديل مركز تكلفة" : "مركز تكلفة جديد"}
      footer={<div className="flex items-center justify-end gap-2">{problem && d.nameAr ? <span className="me-auto text-[13px] text-danger">{problem}</span> : null}<Button variant="ghost" onClick={onClose}>إلغاء</Button><Button loading={busy} disabled={!!problem} onClick={save}>حفظ</Button></div>}>
      <div className="grid gap-3">
        <div className="grid grid-cols-[110px_1fr] gap-2">
          <Input label="الكود" dir="ltr" value={d.code} onChange={(e) => setD({ ...d, code: e.target.value })} />
          <Input label="اسم المركز" autoFocus value={d.nameAr} onChange={(e) => setD({ ...d, nameAr: e.target.value })} />
        </div>
        <Select label="يتبع مركز" value={d.parentId} onChange={(e) => setD({ ...d, parentId: e.target.value })} options={[{ value: "", label: "مركز رئيسي" }, ...fin.centres.filter((c) => !c.parentId && c.id !== row?.id).map((c) => ({ value: c.id, label: c.name.ar }))]} />
        <Select label="الفرع" value={d.branchId} onChange={(e) => setD({ ...d, branchId: e.target.value })} options={[{ value: "", label: "كل الفروع" }, ...fin.branches.map((b) => ({ value: b.id, label: b.name.ar }))]} />
        <Switch checked={d.active} onChange={(v) => setD({ ...d, active: v })} label="شغال" description="المركز الموقوف لا يظهر في القيود الجديدة، وحركاته القديمة تبقى في التقارير." />
      </div>
    </Dialog>
  );
}

/* ───────── نسب ───────── */

function Shares({ items, value, onChange, disabled }: { items: { id: string; label: string }[]; value: Record<string, number>; onChange: (v: Record<string, number>) => void; disabled?: boolean }) {
  const sum = items.reduce((s, i) => s + (value[i.id] || 0), 0);
  return (
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((i) => (
        <div key={i.id} className="flex items-end gap-2">
          <Input label={i.label} dir="ltr" inputMode="decimal" className="min-w-0 flex-1" disabled={disabled} placeholder="0" value={value[i.id] ? String(value[i.id]) : ""} onChange={(e) => { const n = Number(e.target.value); onChange({ ...value, [i.id]: Number.isFinite(n) && n > 0 ? n : 0 }); }} />
          <span className="num w-14 pb-2.5 text-[13px] text-muted" dir="ltr">{sum && value[i.id] ? `${((value[i.id] / sum) * 100).toFixed(1)}%` : ""}</span>
        </div>
      ))}
    </div>
  );
}

/* ───────── توزيع مصروف مشترك ───────── */

function Shared({ fin, onView }: { fin: Fin; onView: (e: FinEntry) => void }) {
  const db = useDb();
  const { toast } = useToast();
  const actor = useActor();
  const can = useFinPerms().has("journal.enter");
  const [period, setPeriod] = useState<Period>(periodOf("month", fin.settings.yearStartMonth));
  const [v, setV] = useState({ accountId: "", source: "", target: "branch" as SharedInput["target"], by: "shares" as SharedInput["by"], amount: "", memo: "" });
  const [shares, setShares] = useState<Record<string, number>>({});
  const [ask, setAsk] = useState(false);
  const [busy, setBusy] = useState(false);
  const input: SharedInput = { accountId: v.accountId, from: period.from ?? "", to: period.to ?? "", sourceBranchId: v.source || null, target: v.target, by: v.target === "centre" ? "shares" : v.by, shares, amount: v.amount.trim() ? fromText(v.amount) : null };
  const plan = useMemo(() => sharedPlan({ accounts: fin.accounts, entries: fin.entries, branchIds: fin.branches.map((b) => b.id) }, input), [fin.accounts, fin.entries, fin.branches, JSON.stringify(input)]); // eslint-disable-line react-hooks/exhaustive-deps
  const items = v.target === "branch" ? fin.branches.filter((b) => b.id !== v.source).map((b) => ({ id: b.id, label: b.name.ar })) : fin.centres.filter((c) => c.active).map((c) => ({ id: c.id, label: c.name.ar }));
  const name = (id: string) => (v.target === "branch" ? fin.branchName(id) : fin.centres.find((c) => c.id === id)?.name.ar ?? "—");
  /** what the account carries on each place it was booked, so the source is picked with its amount in sight */
  const booked = (branchId: string) => { const n = v.accountId && period.from && period.to ? bookedOn(fin.entries, v.accountId, { from: period.from, to: period.to }, branchId || null) : 0; return n ? `: ${fmt(n)}` : ""; };
  const past = fin.entries.filter((e) => e.sourceType === SHARED_SOURCE).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 20);
  const post = async () => {
    setBusy(true);
    try { const e = await allocateShared(db, input, v.memo, actor); toast({ tone: "success", title: e.status === "posted" ? `تم ترحيل القيد ${entryRef(e)}` : "القيد ينتظر الاعتماد" }); setAsk(false); setV({ ...v, amount: "", memo: "" }); } catch (e) { toast({ tone: "error", title: "تعذر التوزيع", description: err(e) }); } finally { setBusy(false); }
  };
  return (
    <>
      <Card className="grid gap-3 p-4">
        <h2 className="text-[16px] font-bold">توزيع مصروف مشترك</h2>
        <p className="text-[13.5px] text-muted">مصروف اتسجل مرة واحدة (إيجار المخزن، الإنترنت، راتب المحاسب) وعايز توزعه على الفروع أو المراكز. القيد ينقل المبلغ من مكانه للمستفيدين من غير ما يغير إجمالي المصروف.</p>
        <div className="flex flex-wrap items-end gap-2">
          <AccountSelect fin={fin} label="حساب المصروف" className="w-72" value={v.accountId} onChange={(id) => setV({ ...v, accountId: id })} filter={(a) => a.type === "expense" || a.type === "cogs"} />
          <PeriodPicker value={period} onChange={setPeriod} startMonth={fin.settings.yearStartMonth} />
          <Select label="مسجل على" className="w-48" value={v.source} onChange={(e) => setV({ ...v, source: e.target.value })} options={[{ value: "", label: `عام (بدون فرع)${booked("")}` }, ...fin.branches.map((b) => ({ value: b.id, label: `${b.name.ar}${booked(b.id)}` }))]} />
          <Input label="المبلغ" dir="ltr" inputMode="decimal" className="w-36" placeholder="كل المسجل" value={v.amount} onChange={(e) => setV({ ...v, amount: e.target.value })} />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Segmented label="يوزع على" size="sm" value={v.target} onChange={(t) => { setV({ ...v, target: t }); setShares({}); }} options={[{ value: "branch", label: "الفروع" }, { value: "centre", label: "مراكز التكلفة" }]} />
          {v.target === "branch" ? <Segmented label="طريقة التوزيع" size="sm" value={v.by} onChange={(by) => setV({ ...v, by })} options={[{ value: "shares", label: "بنسب أكتبها" }, { value: "sales", label: "حسب المبيعات" }]} /> : null}
        </div>
        {input.by === "shares" ? (items.length ? <Shares items={items} value={shares} onChange={setShares} /> : <p className="text-[13.5px] text-muted">{v.target === "centre" ? "لا توجد مراكز تكلفة. عرّفها من تبويب المراكز." : "لا توجد فروع أخرى."}</p>) : null}
        <Input label="البيان" value={v.memo} placeholder="اختياري" onChange={(e) => setV({ ...v, memo: e.target.value })} />
        {v.accountId ? (
          plan.problem ? <p className="rounded-xl border border-line px-3 py-2.5 text-[14px] text-muted">{plan.problem}</p> : (
            <div className="grid gap-1 rounded-xl border border-line p-3 text-[14px]">
              <div className="flex justify-between font-bold"><span>المبلغ الموزع</span><span className="num" dir="ltr">{fmt(plan.amount)}</span></div>
              {plan.lines.filter((l) => l.debit).map((l, i) => <div key={i} className="flex justify-between"><span>{name((v.target === "branch" ? l.branchId : l.centreId) ?? "")}</span><span className="num" dir="ltr">{fmt(l.debit)} <span className="text-muted">({((l.debit / plan.amount) * 100).toFixed(1)}%)</span></span></div>)}
            </div>
          )
        ) : null}
        {can ? <div className="flex justify-end"><Button icon={<Split />} disabled={!!plan.problem} onClick={() => setAsk(true)}>سجل قيد التوزيع</Button></div> : null}
      </Card>
      <Past title="آخر قيود التوزيع" entries={past} onView={onView} />
      <Confirm open={ask} onClose={() => setAsk(false)} onConfirm={post} loading={busy} title="قيد توزيع مصروف" confirmLabel="سجل القيد" description={`توزيع ${fmt(plan.amount)} ج.م من "${fin.byId.get(v.accountId)?.name.ar ?? ""}" على ${Object.keys(plan.weights).length} ${v.target === "branch" ? "فرع" : "مركز"}.`} />
    </>
  );
}

function Past({ title, entries, onView }: { title: string; entries: FinEntry[]; onView: (e: FinEntry) => void }) {
  if (!entries.length) return null;
  return (
    <Card className="grid gap-2 p-4">
      <h3 className="text-[15px] font-bold">{title}</h3>
      <div className="grid">
        {entries.map((e) => (
          <button key={e.id} type="button" onClick={() => onView(e)} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line/60 px-1 py-2 text-start text-[14px] hover:bg-surface-2">
            <span className="num text-muted" dir="ltr">{entryRef(e)}</span><span>{fmtDay(e.date)}</span><span className="min-w-0 flex-1 truncate">{e.memo}</span>
            {e.reversedBy ? <Badge size="sm" tone="neutral">معكوس</Badge> : e.status !== "posted" ? <Badge size="sm" tone="warn">ينتظر الاعتماد</Badge> : null}
            <span className="num font-semibold" dir="ltr">{fmt(amountOf(e))}</span>
          </button>
        ))}
      </div>
    </Card>
  );
}

/* ───────── المطبخ المركزي ───────── */

function Kitchen({ fin, onView }: { fin: Fin; onView: (e: FinEntry) => void }) {
  const db = useDb();
  const { toast } = useToast();
  const perms = useFinPerms();
  const moves = useLive("stockMoves").data;
  const locRows = useLive("storageLocations").data;
  const [month, setMonth] = useState(today().slice(0, 7));
  const [ask, setAsk] = useState(false);
  const [busy, setBusy] = useState(false);
  const s = fin.settings;
  const central = fin.branches.filter((b) => b.isCentral);
  const others = fin.branches.filter((b) => !b.isCentral);
  const locations = useMemo(() => new Map(locRows.map((l) => [l.id, l])), [locRows]);
  const plan = useMemo(() => kitchenPlan({ accounts: fin.accounts, entries: fin.entries, settings: s, branches: fin.branches, moves, locations }, month), [fin.accounts, fin.entries, s, fin.branches, moves, locations, month]);
  const past = fin.entries.filter((e) => e.sourceType === KITCHEN_SOURCE).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 24);
  const save = async (patch: Partial<FinSettingsData>) => { try { await saveSettings(db, patch); } catch (e) { toast({ tone: "error", title: "تعذر الحفظ", description: err(e) }); } };
  const post = async () => {
    setBusy(true);
    try { const e = await allocateKitchen(db, month, today()); toast({ tone: "success", title: e ? `تم ترحيل القيد ${entryRef(e)}` : "لا يوجد ما يوزع" }); setAsk(false); } catch (e) { toast({ tone: "error", title: "تعذر التوزيع", description: err(e) }); } finally { setBusy(false); }
  };
  const weightSum = Object.values(plan.weights).reduce((a, b) => a + b, 0);
  return (
    <>
      <Card className="grid gap-3 p-4">
        <h2 className="text-[16px] font-bold">توزيع مصروفات المطبخ المركزي على الفروع</h2>
        <p className="text-[13.5px] text-muted">{central.length ? `المطبخ المركزي: ${central.map((b) => b.name.ar).join("، ")}. ` : "لا يوجد فرع معلم مطبخ مركزي. علّمه من المخازن والفروع. "}مصروفاته (رواتب، إيجار، كهرباء) بتخدم كل الفروع، فاختار إزاي كل فرع يتحمل نصيبه.</p>
        <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="طريقة التوزيع">
          {KITCHEN_METHODS.map((m) => (
            <button key={m.id} type="button" role="radio" aria-checked={s.kitchenAllocation === m.id} disabled={!perms.has("settings")} onClick={() => s.kitchenAllocation !== m.id && save({ kitchenAllocation: m.id })}
              className={`rounded-xl border px-3.5 py-3 text-start transition-colors ${s.kitchenAllocation === m.id ? "border-primary bg-primary/10" : "border-line hover:bg-surface-2"}`}>
              <span className="block font-bold">{m.label}</span>
              <span className="block text-[13px] text-muted">{m.hint}</span>
            </button>
          ))}
        </div>
        {s.kitchenAllocation === "fixed" ? (
          <div className="grid gap-2 border-t border-line/60 pt-3">
            <h3 className="text-[14.5px] font-bold">نسبة كل فرع</h3>
            {others.length ? <Shares items={others.map((b) => ({ id: b.id, label: b.name.ar }))} value={s.kitchenShares} disabled={!perms.has("settings")} onChange={(kitchenShares) => save({ kitchenShares })} /> : <p className="text-[13.5px] text-muted">لا توجد فروع غير المطبخ المركزي.</p>}
          </div>
        ) : null}
      </Card>
      {s.kitchenAllocation !== "none" ? (
        <Card className="grid gap-3 p-4">
          <div className="flex flex-wrap items-end gap-2">
            <h2 className="min-w-0 flex-1 text-[16px] font-bold">توزيع شهر</h2>
            <Input label="الشهر" type="month" dir="ltr" className="w-44" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} />
          </div>
          {plan.problem ? <p className="rounded-xl border border-line px-3 py-2.5 text-[14px] text-muted">{plan.problem}</p> : (
            <div className="grid gap-3 md:grid-cols-2">
              <div className="grid content-start gap-1 rounded-xl border border-line p-3 text-[14px]">
                <div className="flex justify-between font-bold"><span>مصروفات المطبخ المركزي لم توزع</span><span className="num" dir="ltr">{fmt(plan.total)}</span></div>
                {plan.rows.map((r) => <div key={`${r.account.id}${r.branchId}`} className="flex justify-between text-muted"><span>{r.account.name.ar}</span><span className="num" dir="ltr">{fmt(r.amount)}</span></div>)}
              </div>
              <div className="grid content-start gap-1 rounded-xl border border-line p-3 text-[14px]">
                <div className="font-bold">نصيب كل فرع</div>
                {Object.entries(plan.shares).map(([b, amount]) => <div key={b} className="flex justify-between"><span>{fin.branchName(b)}</span><span className="num" dir="ltr">{fmt(amount)} <span className="text-muted">({(((plan.weights[b] ?? 0) / weightSum) * 100).toFixed(1)}%)</span></span></div>)}
              </div>
            </div>
          )}
          {perms.has("journal.approve") ? <div className="flex justify-end"><Button icon={<ChefHat />} disabled={!!plan.problem} onClick={() => setAsk(true)}>وزع مصروفات الشهر</Button></div> : null}
        </Card>
      ) : null}
      <Past title="قيود توزيع المطبخ المركزي" entries={past} onView={onView} />
      <Confirm open={ask} onClose={() => setAsk(false)} onConfirm={post} loading={busy} title="توزيع مصروفات المطبخ المركزي" confirmLabel="وزع ورحل القيد" description={`توزيع ${fmt(plan.total)} ج.م عن شهر ${month.split("-").reverse().join("/")} على ${Object.keys(plan.shares).length} فرع. لو اتسجلت مصروفات بعد كده، تضغط التوزيع تاني ويتوزع الباقي فقط.`} />
    </>
  );
}
