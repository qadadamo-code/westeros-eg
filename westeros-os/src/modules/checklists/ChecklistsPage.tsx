/** قوائم الوردية: today's lists to tick, the manager's follow-up, and the editor of the lists. */
import { useMemo, useState } from "react";
import { Route, Routes } from "react-router-dom";
import { ArrowDown, ArrowUp, CalendarDays, Check, ChevronDown, ClipboardCheck, ListChecks, ListPlus, Pencil, Plus, Trash2, Users } from "lucide-react";
import { ROLE_LABEL, type Role } from "@/auth/roles";
import { useSession } from "@/auth/session";
import { useDb, useLive } from "@/data/hooks";
import type { ChecklistArea, ChecklistKind, ChecklistRun, ChecklistTask, ChecklistTemplate } from "@/data/types";
import { useT } from "@/i18n/i18n";
import { cn } from "@/lib/cn";
import { uuid } from "@/lib/id";
import { BarList, RouteTabs, Section } from "@/modules/marketing/ui";
import { PageHeader } from "@/shell/PageHeader";
import { Badge, Button, Card, Dialog, EmptyState, Input, Select, Skeleton, StatTile, Switch, useToast } from "@/ui";
import { defaultRows } from "./defaults";
import { AREA_LABEL, KIND_LABEL, KIND_ORDER, byPerson, cairoDay, dayAdd, followUp, openRun, progress, setTask, syncItems, visibleTo, type FollowCell } from "./lib";

const TEAM: Role[] = ["manager", "cashier", "waiter", "chef", "kitchen", "delivery", "accountant"];
const timeOf = (iso: string, lang: "ar" | "en") => new Date(iso).toLocaleTimeString(lang === "ar" ? "ar-EG-u-nu-latn" : "en-GB", { timeZone: "Africa/Cairo", hour: "2-digit", minute: "2-digit" });
const dayLabel = (day: string, lang: "ar" | "en") => new Date(`${day}T12:00:00Z`).toLocaleDateString(lang === "ar" ? "ar-EG-u-nu-latn" : "en-GB", { weekday: "short", day: "numeric", month: "numeric" });

function useChecklists() {
  const { branchId, branches } = useSession();
  const t = useLive("checklistTemplates", { orderBy: [{ field: "sort" }] });
  const since = useMemo(() => dayAdd(cairoDay(new Date().toISOString()), -13), []);
  const r = useLive("checklistRuns", { gte: { day: since } });
  const branch = branchId ?? branches.find((b) => b.isDefault)?.id ?? branches[0]?.id ?? null;
  return { templates: t.data, runs: r.data, loading: t.loading || r.loading, branchId: branch };
}
type Data = ReturnType<typeof useChecklists>;

export default function ChecklistsPage() {
  const { L } = useT();
  const { can } = useSession();
  const data = useChecklists();
  const manage = can("checklists.manage");
  return (
    <div className="grid gap-5">
      <PageHeader icon={<ListChecks />} kicker={L("التشغيل اليومي", "Daily operations")} title={L("قوائم الوردية", "Shift checklists")} subtitle={L("مهام فتح وقفل كل قسم، وكل مهمة باسم اللي عملها ووقتها", "Opening and closing tasks per department, each signed and timed")} />
      {manage ? (
        <RouteTabs
          label={L("أقسام القوائم", "Checklist sections")}
          items={[
            { to: "/checklists", end: true, label: L("قوائم اليوم", "Today"), icon: <ClipboardCheck /> },
            { to: "/checklists/follow", label: L("المتابعة", "Follow-up"), icon: <CalendarDays /> },
            { to: "/checklists/lists", label: L("تعديل القوائم", "Edit lists"), icon: <Pencil /> },
          ]}
        />
      ) : null}
      {data.loading ? (
        <Skeleton className="h-96" rounded="rounded-[20px]" />
      ) : (
        <Routes>
          <Route index element={<Today data={data} />} />
          {manage ? <Route path="follow" element={<Follow data={data} />} /> : null}
          {manage ? <Route path="lists" element={<Lists data={data} />} /> : null}
          <Route path="*" element={<Today data={data} />} />
        </Routes>
      )}
    </div>
  );
}

/* ───────────────────────── today ───────────────────────── */

function Today({ data }: { data: Data }) {
  const { L, loc } = useT();
  const { role, can, staff } = useSession();
  const manage = can("checklists.manage");
  const day = cairoDay(new Date().toISOString());
  const [open, setOpen] = useState<string | null>(null);
  const mine = data.templates.filter((t) => visibleTo(t, role, manage));
  const runOf = (t: ChecklistTemplate) => data.runs.find((r) => r.templateId === t.id && r.day === day && (!data.branchId || r.branchId === data.branchId));
  const stats = mine.map((t) => progress(runOf(t) ? syncItems(runOf(t)!, t) : undefined, t.items.length));
  const tasks = stats.reduce((a, s) => a + s.total, 0);
  const done = stats.reduce((a, s) => a + s.done, 0);
  if (!mine.length)
    return (
      <Card>
        <EmptyState icon={<ListChecks />} title={L("لا توجد قوائم لقسمك", "No lists for your department")} body={manage ? L("أضف القوائم الجاهزة من تبويب تعديل القوائم، أو اكتب قوائمك.", "Add the ready-made lists from the Edit lists tab, or write your own.") : L("المدير هو اللي بيضيف قوائم الوردية.", "The manager adds the shift lists.")} />
      </Card>
    );
  return (
    <div className="grid gap-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile index={0} tone={done >= tasks && tasks ? "ok" : "brass"} icon={<ClipboardCheck />} label={L("مهام اليوم", "Today's tasks")} value={<span className="num">{done} / {tasks}</span>} sub={tasks ? `${Math.round((done * 100) / tasks)}%` : undefined} />
        <StatTile index={1} tone="ok" icon={<Check />} label={L("قوائم اكتملت", "Lists finished")} value={<span className="num">{stats.filter((s) => s.status === "done").length} / {mine.length}</span>} />
        <StatTile index={2} tone="info" icon={<Users />} label={L("داخل باسم", "Signed in as")} value={<span className="text-[18px]">{staff?.name ?? "—"}</span>} sub={L("كل مهمة تتسجل باسمك", "Every task is signed with your name")} className="col-span-2" />
      </div>
      {KIND_ORDER.map((kind) => {
        const lists = mine.filter((t) => t.kind === kind);
        if (!lists.length) return null;
        return (
          <section key={kind} className="grid gap-3">
            <h2 className="text-[15px] font-bold text-ink-2">{loc(KIND_LABEL[kind])}</h2>
            <div className="grid items-start gap-3 lg:grid-cols-2">
              {lists.map((t) => (
                <ListCard key={t.id} template={t} run={runOf(t)} day={day} branchId={data.branchId} open={open === t.id} onToggle={() => setOpen(open === t.id ? null : t.id)} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function ListCard({ template, run, day, branchId, open, onToggle }: { template: ChecklistTemplate; run: ChecklistRun | undefined; day: string; branchId: string | null; open: boolean; onToggle: () => void }) {
  const { L, lang, loc } = useT();
  const { staff } = useSession();
  const db = useDb();
  const { toast } = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const items = run ? syncItems(run, template) : template.items.map((i) => ({ taskId: i.id, text: i.text, doneBy: null, doneByName: "", doneAt: null as string | null, note: "" }));
  const p = progress(items);
  const me = staff ? { id: staff.id, name: staff.name } : null;
  const toggle = async (taskId: string, to: boolean) => {
    if (!branchId || busy) return;
    setBusy(taskId);
    try {
      const r = run ?? (await openRun(db, template, { branchId, day, staff: me }));
      await setTask(db, r.id, template, { taskId, done: to, staff: me });
    } catch (e) {
      toast({ tone: "error", title: L("تعذر الحفظ", "Could not save"), description: String((e as Error).message ?? e) });
    } finally {
      setBusy(null);
    }
  };
  return (
    <Card className="overflow-hidden">
      <button type="button" onClick={onToggle} aria-expanded={open} className="flex w-full items-center gap-3 px-5 py-4 text-start">
        <span className={cn("grid size-11 shrink-0 place-items-center rounded-2xl text-[13px] font-extrabold", p.status === "done" ? "bg-ok-soft text-ok" : p.status === "partial" ? "bg-brass-soft text-brass-text" : "bg-surface-3 text-muted")}>
          {p.status === "done" ? <Check className="size-5" /> : <span className="num">{p.done}/{p.total}</span>}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[16px] font-bold">{loc(template.name)}</span>
          <span className="mt-1 flex items-center gap-2">
            <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-3"><span className={cn("block h-full rounded-full transition-[width] duration-300", p.status === "done" ? "bg-ok" : "bg-brass")} style={{ width: `${p.total ? (p.done / p.total) * 100 : 0}%` }} /></span>
            <span className="text-[12px] text-muted">{loc(AREA_LABEL[template.area])}</span>
          </span>
        </span>
        <ChevronDown className={cn("size-5 shrink-0 text-muted transition-transform", open && "rotate-180")} />
      </button>
      {open ? (
        <ul className="grid gap-1.5 border-t border-line px-3 py-3">
          {items.map((i) => (
            <li key={i.taskId}>
              <button type="button" disabled={busy === i.taskId} onClick={() => toggle(i.taskId, !i.doneAt)} aria-pressed={!!i.doneAt} className={cn("flex min-h-[52px] w-full items-center gap-3 rounded-xl px-3 py-2 text-start transition-colors hover:bg-surface-2", i.doneAt && "bg-ok-soft/50")}>
                <span className={cn("grid size-7 shrink-0 place-items-center rounded-lg border-2 transition-colors", i.doneAt ? "border-ok bg-ok text-white" : "border-line-strong")}>{i.doneAt ? <Check className="size-4" /> : null}</span>
                <span className="min-w-0 flex-1">
                  <span className={cn("block text-[14.5px] font-semibold", i.doneAt && "text-muted line-through decoration-1")}>{loc(i.text)}</span>
                  {i.doneAt ? <span className="block text-[12px] text-muted">{i.doneByName || "—"} · <span className="num">{timeOf(i.doneAt, lang)}</span></span> : null}
                </span>
              </button>
            </li>
          ))}
          {!items.length ? <li className="px-3 py-4 text-[14px] text-muted">{L("القائمة دي لسه مفيهاش مهام.", "This list has no tasks yet.")}</li> : null}
        </ul>
      ) : null}
    </Card>
  );
}

/* ───────────────────────── follow-up ───────────────────────── */

function Follow({ data }: { data: Data }) {
  const { L, lang, loc } = useT();
  const today = cairoDay(new Date().toISOString());
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => dayAdd(today, i - 6)), [today]);
  const rows = useMemo(() => followUp(data.templates, data.runs, days, data.branchId, today), [data.templates, data.runs, days, data.branchId, today]);
  const [cell, setCell] = useState<{ t: ChecklistTemplate; c: FollowCell } | null>(null);
  const people = useMemo(() => byPerson(data.runs.filter((r) => r.day >= days[0] && (!data.branchId || r.branchId === data.branchId))), [data.runs, days, data.branchId]);
  const all = rows.flatMap((r) => r.cells).filter((c) => c.due);
  const full = all.filter((c) => c.progress.status === "done").length;
  const missed = all.filter((c) => c.progress.status === "none" && c.day < today).length;
  const since = rows.some((r) => r.cells.some((c) => !c.due));
  if (!rows.length) return <Card><EmptyState icon={<CalendarDays />} title={L("لا توجد قوائم للمتابعة", "No lists to follow")} /></Card>;
  return (
    <div className="grid gap-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile index={0} tone="ok" icon={<Check />} label={L("قوائم اكتملت في 7 أيام", "Finished, 7 days")} value={<span className="num">{full} / {all.length}</span>} sub={all.length ? `${Math.round((full * 100) / all.length)}%` : undefined} />
        <StatTile index={1} tone={missed ? "danger" : "ok"} icon={<CalendarDays />} label={L("قوائم لم تُفتح", "Never opened")} value={<span className="num">{missed}</span>} sub={missed ? L("أيام عدّت من غير أي مهمة", "Days with no task ticked") : since ? L("الحساب يبدأ من يوم إضافة القائمة", "Counted from the day a list was added") : L("ممتاز", "None")} />
        <StatTile index={2} tone="brass" icon={<ClipboardCheck />} label={L("قوائم ناقصة", "Partly done")} value={<span className="num">{all.filter((c) => c.progress.status === "partial").length}</span>} />
        <StatTile index={3} tone="info" icon={<Users />} label={L("موظفين شاركوا", "People who ticked")} value={<span className="num">{people.length}</span>} />
      </div>
      <Card className="overflow-x-auto">
        <table className="w-full min-w-[640px] border-separate border-spacing-0 text-[13.5px]">
          <thead>
            <tr className="text-muted">
              <th className="sticky start-0 bg-surface px-5 py-3 text-start font-semibold">{L("القائمة", "List")}</th>
              {days.map((d) => <th key={d} className={cn("px-2 py-3 text-center font-semibold whitespace-nowrap", d === today && "text-ink")}>{d === today ? L("اليوم", "Today") : dayLabel(d, lang)}</th>)}
              <th className="px-4 py-3 text-end font-semibold">{L("الالتزام", "Compliance")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.template.id}>
                <td className="sticky start-0 border-t border-line bg-surface px-5 py-2.5"><span className="block font-semibold whitespace-nowrap">{loc(r.template.name)}</span><span className="text-[12px] text-muted">{loc(KIND_LABEL[r.template.kind])}</span></td>
                {r.cells.map((c) => (
                  <td key={c.day} className="border-t border-line px-2 py-2.5 text-center">
                    <button type="button" disabled={!c.run} onClick={() => setCell({ t: r.template, c })} className={cn("num inline-grid h-8 min-w-[52px] place-items-center rounded-lg px-2 text-[12.5px] font-bold", c.progress.status === "done" ? "bg-ok-soft text-ok" : c.progress.status === "partial" ? "bg-brass-soft text-brass-text" : c.due && c.day < today ? "bg-danger-soft text-danger" : "bg-surface-3 text-faint", c.run && "hover:ring-2 hover:ring-line-strong")}>
                      {c.progress.status === "done" ? <Check className="size-4" /> : c.progress.status === "partial" ? `${c.progress.done}/${c.progress.total}` : c.due && c.day < today ? "✕" : "—"}
                    </button>
                  </td>
                ))}
                <td className="border-t border-line px-4 py-2.5 text-end">{r.doneBp === null ? <span className="text-faint">—</span> : <Badge size="sm" tone={r.doneBp >= 8500 ? "ok" : r.doneBp >= 5000 ? "warn" : "danger"}>{Math.round(r.doneBp / 100)}%</Badge>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <Section icon={<Users />} title={L("مين عمل المهام", "Who did the tasks")} subtitle={L("عدد المهام اللي اتعلّم عليها في آخر 7 أيام", "Tasks ticked in the last 7 days")}>
        {people.length ? <BarList rows={people.slice(0, 10).map((p) => ({ key: p.id, label: p.name, value: p.tasks }))} format={(v) => <span className="num">{v}</span>} /> : <p className="text-[14px] text-muted">{L("لسه مفيش مهام اتعلّم عليها.", "No tasks ticked yet.")}</p>}
      </Section>
      {cell?.c.run ? (
        <Dialog open onClose={() => setCell(null)} size="md" title={loc(cell.t.name)} description={`${dayLabel(cell.c.day, lang)} · ${cell.c.progress.done}/${cell.c.progress.total}`} footer={<div className="flex justify-end"><Button variant="ghost" onClick={() => setCell(null)}>{L("إغلاق", "Close")}</Button></div>}>
          <ul className="grid gap-1.5">
            {syncItems(cell.c.run, cell.t).map((i) => (
              <li key={i.taskId} className="flex items-center gap-3 rounded-xl border border-line px-3 py-2">
                <span className={cn("grid size-6 shrink-0 place-items-center rounded-md", i.doneAt ? "bg-ok text-white" : "bg-danger-soft text-danger")}>{i.doneAt ? <Check className="size-3.5" /> : "✕"}</span>
                <span className="min-w-0 flex-1 text-[14px] font-semibold">{loc(i.text)}</span>
                <span className="text-end text-[12px] text-muted">{i.doneAt ? <>{i.doneByName || "—"}<br /><span className="num">{timeOf(i.doneAt, lang)}</span></> : L("لم تتم", "Not done")}</span>
              </li>
            ))}
          </ul>
        </Dialog>
      ) : null}
    </div>
  );
}

/* ───────────────────────── edit lists ───────────────────────── */

function Lists({ data }: { data: Data }) {
  const { L, loc } = useT();
  const db = useDb();
  const { toast } = useToast();
  const [edit, setEdit] = useState<ChecklistTemplate | "new" | null>(null);
  const [busy, setBusy] = useState(false);
  const addDefaults = async () => {
    setBusy(true);
    try {
      const have = new Set(data.templates.map((t) => t.name.ar));
      const rows = defaultRows().filter((d) => !have.has(d.row.name.ar));
      for (const d of rows) await db.insert("checklistTemplates", { ...d.row, sort: data.templates.length + d.row.sort });
      toast({ tone: "success", title: L(`تمت إضافة ${rows.length} قوائم`, `${rows.length} lists added`) });
    } catch (e) {
      toast({ tone: "error", title: L("تعذر الحفظ", "Could not save"), description: String((e as Error).message ?? e) });
    } finally {
      setBusy(false);
    }
  };
  const missingDefaults = defaultRows().some((d) => !data.templates.some((t) => t.name.ar === d.row.name.ar));
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap justify-end gap-2">
        {missingDefaults ? <Button variant="secondary" loading={busy} icon={<ListPlus />} onClick={addDefaults}>{L("أضف القوائم الجاهزة", "Add ready-made lists")}</Button> : null}
        <Button icon={<Plus />} onClick={() => setEdit("new")}>{L("قائمة جديدة", "New list")}</Button>
      </div>
      {data.templates.length ? (
        <div className="grid gap-3 lg:grid-cols-2">
          {data.templates.map((t) => (
            <Card key={t.id} interactive onClick={() => setEdit(t)} className="cursor-pointer px-5 py-4">
              <div className="flex items-center gap-3">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[16px] font-bold">{loc(t.name)}</span>
                  <span className="text-[13px] text-muted">{loc(KIND_LABEL[t.kind])} · {loc(AREA_LABEL[t.area])} · {L(`${t.items.length} مهمة`, `${t.items.length} tasks`)}</span>
                </span>
                {t.active ? null : <Badge tone="neutral" size="sm">{L("موقوفة", "Off")}</Badge>}
                <Pencil className="size-4 text-muted" />
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {t.roles.length ? t.roles.map((r) => <Badge key={r} size="sm" tone="info">{loc(ROLE_LABEL[r as Role] ?? { ar: r, en: r })}</Badge>) : <Badge size="sm" tone="neutral">{L("كل الفريق", "Everyone")}</Badge>}
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <Card><EmptyState icon={<ListChecks />} title={L("لا توجد قوائم بعد", "No lists yet")} body={L("ابدأ بالقوائم الجاهزة للمطبخ والكاشير والصالة وعدّل عليها براحتك.", "Start with the ready-made kitchen, cashier and floor lists and edit them freely.")} /></Card>
      )}
      {edit ? <ListDialog key={edit === "new" ? "new" : edit.id} template={edit === "new" ? null : edit} count={data.templates.length} onClose={() => setEdit(null)} /> : null}
    </div>
  );
}

function ListDialog({ template, count, onClose }: { template: ChecklistTemplate | null; count: number; onClose: () => void }) {
  const { L, loc } = useT();
  const db = useDb();
  const { toast } = useToast();
  const [name, setName] = useState(template?.name.ar ?? "");
  const [kind, setKind] = useState<ChecklistKind>(template?.kind ?? "opening");
  const [area, setArea] = useState<ChecklistArea>(template?.area ?? "kitchen");
  const [roles, setRoles] = useState<string[]>(template?.roles ?? []);
  const [items, setItems] = useState<ChecklistTask[]>(template?.items ?? []);
  const [active, setActive] = useState(template?.active ?? true);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const add = () => {
    const text = draft.trim();
    if (!text) return;
    setItems((x) => [...x, { id: uuid(), text: { ar: text, en: text } }]);
    setDraft("");
  };
  const move = (i: number, by: number) => setItems((x) => { const y = [...x]; const j = i + by; if (j < 0 || j >= y.length) return x; [y[i], y[j]] = [y[j], y[i]]; return y; });
  const save = async () => {
    if (!name.trim()) return;
    setBusy(true);
    try {
      const pending = draft.trim() ? [...items, { id: uuid(), text: { ar: draft.trim(), en: draft.trim() } }] : items;
      const fields = { name: { ar: name.trim(), en: template && template.name.ar === name.trim() ? template.name.en : name.trim() }, kind, area, roles, items: pending.filter((i) => i.text.ar.trim()), active };
      if (template) await db.update("checklistTemplates", template.id, fields);
      else await db.insert("checklistTemplates", { ...fields, sort: count + 1 });
      toast({ tone: "success", title: L("تم حفظ القائمة", "List saved") });
      onClose();
    } catch (e) {
      toast({ tone: "error", title: L("تعذر الحفظ", "Could not save"), description: String((e as Error).message ?? e) });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open onClose={onClose} size="lg" title={template ? loc(template.name) : L("قائمة جديدة", "New list")} description={L("المهام بتظهر للقسم كل يوم بنفس الترتيب", "The tasks show to the department every day in this order")}
      footer={<div className="flex justify-end gap-2"><Button variant="ghost" onClick={onClose}>{L("إلغاء", "Cancel")}</Button><Button loading={busy} disabled={!name.trim()} onClick={save}>{L("حفظ", "Save")}</Button></div>}>
      <div className="grid gap-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="sm:col-span-1"><Input label={L("اسم القائمة", "List name")} value={name} onChange={(e) => setName(e.target.value)} /></div>
          <Select label={L("التوقيت", "When")} value={kind} onChange={(e) => setKind(e.target.value as ChecklistKind)} options={KIND_ORDER.map((k) => ({ value: k, label: loc(KIND_LABEL[k]) }))} />
          <Select label={L("القسم", "Department")} value={area} onChange={(e) => setArea(e.target.value as ChecklistArea)} options={(["kitchen", "cashier", "floor", "all"] as ChecklistArea[]).map((a) => ({ value: a, label: loc(AREA_LABEL[a]) }))} />
        </div>
        <div className="grid gap-1.5">
          <span className="text-[13px] font-semibold text-ink-2">{L("مين بيشوف القائمة", "Who sees this list")}</span>
          <div className="flex flex-wrap gap-1.5">
            {TEAM.map((r) => {
              const on = roles.includes(r);
              return <button key={r} type="button" aria-pressed={on} onClick={() => setRoles((x) => (on ? x.filter((y) => y !== r) : [...x, r]))} className={cn("h-9 rounded-full border px-3.5 text-[13.5px] font-semibold transition-colors", on ? "border-primary bg-primary text-primary-ink" : "border-line bg-surface hover:bg-surface-2")}>{loc(ROLE_LABEL[r])}</button>;
            })}
          </div>
          <span className="text-[12px] text-muted">{roles.length ? L("المدير والمالك بيشوفوا كل القوائم دايماً.", "Managers and the owner always see every list.") : L("بدون اختيار: القائمة تظهر لكل الفريق.", "Nothing selected: everyone sees it.")}</span>
        </div>
        <div className="grid gap-2">
          <span className="text-[13px] font-semibold text-ink-2">{L("المهام", "Tasks")} <span className="num text-muted">({items.length})</span></span>
          <ul className="grid gap-1.5">
            {items.map((i, n) => (
              <li key={i.id} className="flex items-center gap-1.5">
                <span className="num w-6 shrink-0 text-center text-[12.5px] text-muted">{n + 1}</span>
                <div className="min-w-0 flex-1"><Input aria-label={L(`المهمة ${n + 1}`, `Task ${n + 1}`)} value={i.text.ar} onChange={(e) => setItems((x) => x.map((y) => (y.id === i.id ? { ...y, text: { ar: e.target.value, en: y.text.en === y.text.ar ? e.target.value : y.text.en } } : y)))} /></div>
                <button type="button" aria-label={L("لفوق", "Move up")} disabled={n === 0} onClick={() => move(n, -1)} className="grid size-9 shrink-0 place-items-center rounded-lg text-muted hover:bg-surface-3 disabled:opacity-30"><ArrowUp className="size-4" /></button>
                <button type="button" aria-label={L("لتحت", "Move down")} disabled={n === items.length - 1} onClick={() => move(n, 1)} className="grid size-9 shrink-0 place-items-center rounded-lg text-muted hover:bg-surface-3 disabled:opacity-30"><ArrowDown className="size-4" /></button>
                <button type="button" aria-label={L("حذف", "Remove")} onClick={() => setItems((x) => x.filter((y) => y.id !== i.id))} className="grid size-9 shrink-0 place-items-center rounded-lg text-danger hover:bg-danger-soft"><Trash2 className="size-4" /></button>
              </li>
            ))}
          </ul>
          <div className="flex items-end gap-2">
            <div className="min-w-0 flex-1"><Input placeholder={L("اكتب مهمة جديدة واضغط إضافة", "Type a new task and press Add")} value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }} /></div>
            <Button variant="secondary" icon={<Plus />} onClick={add} disabled={!draft.trim()}>{L("إضافة", "Add")}</Button>
          </div>
        </div>
        <Switch checked={active} onChange={setActive} label={L("القائمة شغالة", "Active")} description={L("القائمة الموقوفة لا تظهر للفريق", "An inactive list is hidden from the team")} />
      </div>
    </Dialog>
  );
}
