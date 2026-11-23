/** إعدادات الموارد البشرية: every list the HR screens choose from, editable (add, rename, stop, reorder, delete). */
import { useState } from "react";
import { useDb } from "@/data/hooks";
import { Button, Card, CardHeader, Input, Switch, useToast } from "@/ui";
import { useArea } from "../useAccess";
import { GroupTitle } from "../finance/ui";
import { ACTION_LABEL, type Checklist, type Criterion, type LeaveType, type Opt, type Penalty, type RequestType, type TaskTpl, type Violation, type HrSettings, newId, STEP_LABEL, type Approver } from "./model";
import { saveSettings } from "./ops";
import { useHrx } from "./useHrx";
import { err, ListEditor, ReadOnlyNote, Sel } from "./ui";

const WHO = [{ value: "hr", label: "الموارد البشرية" }, { value: "direct", label: "المدير المباشر" }, { value: "employee", label: "الموظف نفسه" }];

export default function Settings() {
  const hrx = useHrx();
  const db = useDb();
  const readOnly = !useArea().edit;
  const s = hrx.settings;
  const put = <K extends keyof HrSettings>(k: K) => async (v: HrSettings[K]) => { await saveSettings(db, hrx, { [k]: v } as Partial<HrSettings>); };
  const opt = (k: keyof HrSettings, title: string, subtitle?: string) => (
    <ListEditor<Opt> title={title} subtitle={subtitle} readOnly={readOnly} items={s[k] as Opt[]} onSave={put(k) as (v: Opt[]) => Promise<void>} cols={[{ key: "name", label: "الاسم", type: "text" }]} blank={() => ({ id: "", name: "", active: true })} />
  );
  return (
    <div className="grid gap-5">
      <ReadOnlyNote show={readOnly} what="تعديل إعدادات الموارد البشرية" />
      <General readOnly={readOnly} />

      <GroupTitle>الموظفين والعقود</GroupTitle>
      <div className="grid items-start gap-5 lg:grid-cols-2">
        {opt("contractTypes", "أنواع العقود")}
        <ListEditor title="أنواع المستندات" subtitle="المستندات اللي بتنتهي بيطلع لها تنبيه قبل انتهائها، والمطلوبة بتظهر ناقصة في ملف الموظف." readOnly={readOnly} items={s.docTypes} onSave={put("docTypes")}
          cols={[{ key: "name", label: "المستند", type: "text" }, { key: "expires", label: "له تاريخ انتهاء", type: "switch" }, { key: "required", label: "مطلوب", type: "switch" }]} blank={() => ({ id: "", name: "", active: true, expires: false, required: false })} />
      </div>

      <GroupTitle>الإجازات والطلبات</GroupTitle>
      <div className="grid items-start gap-5 lg:grid-cols-2">
        <ListEditor<LeaveType> title="أنواع الإجازات" subtitle="الرصيد السنوي لكل نوع، والرصيد بيتحسب من الطلبات المعتمدة." readOnly={readOnly} items={s.leaveTypes} onSave={put("leaveTypes")}
          cols={[{ key: "name", label: "النوع", type: "text" }, { key: "days", label: "أيام في السنة", type: "number" }, { key: "paid", label: "مدفوعة", type: "switch" }, { key: "carry", label: "الباقي يترحل", type: "switch" }]} blank={() => ({ id: "", name: "", active: true, days: 0, paid: true, carry: false })} />
        <ListEditor<RequestType> title="أنواع الطلبات وسلسلة الموافقات" subtitle="كل نوع طلب ليه خطوات موافقة بالترتيب. افتح التفاصيل عشان تحدد الخطوات." readOnly={readOnly} items={s.requestTypes} onSave={put("requestTypes")}
          cols={[{ key: "name", label: "النوع", type: "text" }, { key: "dates", label: "فيه تواريخ", type: "switch" }, { key: "money", label: "فيه مبلغ", type: "switch" }]}
          blank={() => ({ id: "", name: "", active: true, steps: ["direct", "hr"] })}
          render={(r, set) => <RequestTypeEditor r={r} set={set} readOnly={readOnly} />} />
      </div>

      <GroupTitle>التوظيف</GroupTitle>
      <div className="grid items-start gap-5 lg:grid-cols-2">
        {opt("stages", "مراحل التوظيف", "المتقدم بيتنقل بين المراحل دي بالترتيب. \"تم التعيين\" و\"مرفوض\" بيقفلوا الطلب.")}
        {opt("sources", "مصادر المتقدمين")}
        <ListEditor<Checklist> title="قوائم استلام الموظف الجديد" subtitle="مهام أول أيام الموظف، ومين مسؤول عن كل مهمة، وبعد كام يوم من بدايته." readOnly={readOnly} items={s.onboarding} onSave={put("onboarding")}
          cols={[{ key: "name", label: "اسم القائمة", type: "text" }]} blank={() => ({ id: "", name: "", active: true, tasks: [] })}
          render={(r, set) => <TasksEditor tasks={r.tasks} onChange={(tasks) => set({ ...r, tasks })} readOnly={readOnly} />} />
      </div>

      <GroupTitle>التقييم والتدريب</GroupTitle>
      <div className="grid items-start gap-5 lg:grid-cols-2">
        <ListEditor<Criterion> title="معايير التقييم" subtitle="كل معيار بيتقيم من 5، والوزن بيحدد أهميته في النتيجة." readOnly={readOnly} items={s.criteria} onSave={put("criteria")}
          cols={[{ key: "name", label: "المعيار", type: "text" }, { key: "weight", label: "الوزن", type: "number" }, { key: "help", label: "شرح للمقيم", type: "text" }]} blank={() => ({ id: "", name: "", active: true, weight: 10 })} />
        {opt("courseCategories", "تصنيفات التدريب")}
      </div>

      <GroupTitle>الإنذارات ونهاية الخدمة</GroupTitle>
      <div className="grid items-start gap-5 lg:grid-cols-2">
        <ListEditor<Violation> title="المخالفات وسلم الجزاءات" subtitle="كل مخالفة ليها سلم: أول مرة كذا، تاني مرة كذا... والعد بيبدأ من جديد بعد عدد الشهور." readOnly={readOnly} items={s.violations} onSave={put("violations")}
          cols={[{ key: "name", label: "المخالفة", type: "text" }, { key: "resetMonths", label: "يتصفر بعد (شهور)", type: "number", width: "w-36" }]} blank={() => ({ id: "", name: "", active: true, resetMonths: 6, ladder: [{ action: "written", days: 0 }] })}
          render={(r, set) => <LadderEditor ladder={r.ladder} onChange={(ladder) => set({ ...r, ladder })} readOnly={readOnly} />} />
        {opt("exitReasons", "أسباب ترك العمل")}
        {opt("exitQuestions", "أسئلة مقابلة الخروج")}
        <Card>
          <CardHeader title="مهام إخلاء الطرف" subtitle="بتتعمل لكل موظف بتنتهي خدمته قبل صرف مستحقاته." />
          <div className="px-5 pb-5"><TasksEditor tasks={s.clearance} onChange={(t) => put("clearance")(t)} readOnly={readOnly} save /></div>
        </Card>
      </div>
    </div>
  );
}

function General({ readOnly }: { readOnly: boolean }) {
  const hrx = useHrx();
  const db = useDb();
  const { toast } = useToast();
  const s = hrx.settings;
  const [v, setV] = useState({ alertDays: s.alertDays, probationDays: s.probationDays, noticeDays: s.noticeDays, monthDays: s.monthDays, passMark: s.passMark, jobSetsRole: s.jobSetsRole, pushDeductions: s.pushDeductions, gratuity: s.gratuity, minStaff: s.minStaff });
  const [busy, setBusy] = useState(false);
  const n = (k: "alertDays" | "probationDays" | "noticeDays" | "monthDays" | "passMark", label: string, hint?: string) => <Input label={label} hint={hint} dir="ltr" inputMode="numeric" disabled={readOnly} value={String(v[k])} onChange={(e) => setV({ ...v, [k]: Number(e.target.value) || 0 })} />;
  const save = async () => { setBusy(true); try { await saveSettings(db, hrx, v); toast({ tone: "success", title: "تم الحفظ" }); } catch (e) { toast({ tone: "error", title: "تعذر الحفظ", description: err(e) }); } finally { setBusy(false); } };
  return (
    <Card>
      <CardHeader title="الإعدادات العامة" action={readOnly ? null : <Button size="sm" loading={busy} onClick={save}>حفظ</Button>} />
      <div className="grid gap-3 px-5 pb-5 sm:grid-cols-3 lg:grid-cols-5">
        {n("alertDays", "تنبيه قبل الانتهاء (يوم)", "للعقود والمستندات")}
        {n("probationDays", "فترة التجربة (يوم)")}
        {n("noticeDays", "فترة الإخطار (يوم)")}
        {n("monthDays", "أيام الشهر لحساب اليومية")}
        {n("passMark", "درجة النجاح في التدريب %")}
        <div className="sm:col-span-3 lg:col-span-5 grid gap-2">
          <Switch disabled={readOnly} checked={v.jobSetsRole} onChange={(x) => setV({ ...v, jobSetsRole: x })} label="الوظيفة بتحدد صلاحيات الموظف" description="لما تحط موظف في وظيفة، بياخد دور الوظيفة (وصلاحياته وأقسامه) تلقائياً. الأدوار نفسها بتتعدل من المستخدمين ← الأدوار." />
          <Switch disabled={readOnly} checked={v.pushDeductions} onChange={(x) => setV({ ...v, pushDeductions: x })} label="خصم الجزاءات ينزل على الراتب تلقائياً" description="الإنذار اللي فيه خصم بيتسجل خصم في الحسابات ← حركات الموظفين ويدخل كشف رواتب الشهر." />
        </div>
        <div className="sm:col-span-3 lg:col-span-5 grid gap-2">
          <span className="text-[13px] font-semibold">مكافأة نهاية الخدمة (شهور راتب عن كل سنة)</span>
          {v.gratuity.map((g, i) => (
            <div key={i} className="flex flex-wrap items-end gap-2">
              <Input label="من سنة" wrapClassName="w-28" dir="ltr" disabled={readOnly} value={String(g.fromYears)} onChange={(e) => setV({ ...v, gratuity: v.gratuity.map((x, j) => (j === i ? { ...x, fromYears: Number(e.target.value) || 0 } : x)) })} />
              <Input label="شهور عن كل سنة" wrapClassName="w-36" dir="ltr" disabled={readOnly} value={String(g.months)} onChange={(e) => setV({ ...v, gratuity: v.gratuity.map((x, j) => (j === i ? { ...x, months: Number(e.target.value) || 0 } : x)) })} />
              {readOnly ? null : <Button size="sm" variant="ghost" onClick={() => setV({ ...v, gratuity: v.gratuity.filter((_, j) => j !== i) })}>حذف</Button>}
            </div>
          ))}
          {readOnly ? null : <div><Button size="sm" variant="outline" onClick={() => setV({ ...v, gratuity: [...v.gratuity, { fromYears: 10, months: 1 }] })}>إضافة شريحة</Button></div>}
        </div>
        <div className="sm:col-span-3 lg:col-span-5 grid gap-2">
          <span className="text-[13px] font-semibold">أقل عدد موظفين في اليوم لكل فرع (تنبيه لو الورديات ناقصة ناس)</span>
          <div className="flex flex-wrap gap-2">
            {hrx.branches.map((b) => <Input key={b.id} label={b.name.ar} wrapClassName="w-40" dir="ltr" disabled={readOnly} value={String(v.minStaff[b.id] ?? "")} onChange={(e) => setV({ ...v, minStaff: { ...v.minStaff, [b.id]: Number(e.target.value) || 0 } })} />)}
          </div>
        </div>
      </div>
    </Card>
  );
}

function RequestTypeEditor({ r, set, readOnly }: { r: RequestType; set: (r: RequestType) => void; readOnly: boolean }) {
  const hrx = useHrx();
  const choices: { value: string; label: string }[] = [
    { value: "direct", label: "المدير المباشر" }, { value: "dept", label: "رئيس القسم" }, { value: "hr", label: "الموارد البشرية (صلاحية الاعتماد)" },
    ...hrx.roles.map((x) => ({ value: `role:${x.id}`, label: `دور: ${x.name}` })),
    ...hrx.members.filter((m) => m.active).map((m) => ({ value: `member:${m.id}`, label: `موظف: ${m.name}` })),
  ];
  return (
    <div className="grid gap-2">
      <span className="text-[13px] font-semibold">خطوات الموافقة بالترتيب</span>
      {r.steps.map((st, i) => (
        <div key={i} className="flex items-end gap-2">
          <span className="pb-3 text-[13px] text-muted">{i + 1}.</span>
          <Sel label="مين يوافق" className="min-w-56" disabled={readOnly} value={st} onChange={(x) => set({ ...r, steps: r.steps.map((y, j) => (j === i ? (x as Approver) : y)) })} options={choices} />
          {readOnly ? null : <Button size="sm" variant="ghost" onClick={() => set({ ...r, steps: r.steps.filter((_, j) => j !== i) })}>حذف</Button>}
        </div>
      ))}
      {readOnly ? null : <div><Button size="sm" variant="outline" onClick={() => set({ ...r, steps: [...r.steps, "hr"] })}>إضافة خطوة</Button></div>}
      <p className="text-[12.5px] text-muted">{r.steps.length ? r.steps.map((x) => STEP_LABEL(x, hrx.roleName, hrx.name)).join(" ← ") : "من غير خطوات: الطلب بيتعتمد أول ما يتبعت."}</p>
      <Sel label="بيخصم من رصيد إجازة" disabled={readOnly} value={r.leaveTypeId ?? ""} onChange={(x) => set({ ...r, leaveTypeId: x || null })} options={[{ value: "", label: "لا" }, ...hrx.settings.leaveTypes.map((l) => ({ value: l.id, label: l.name }))]} />
      <Input label="ملاحظة بتظهر للموظف" disabled={readOnly} value={r.note ?? ""} onChange={(e) => set({ ...r, note: e.target.value })} />
    </div>
  );
}

function TasksEditor({ tasks, onChange, readOnly, save }: { tasks: TaskTpl[]; onChange: (t: TaskTpl[]) => void | Promise<void>; readOnly: boolean; save?: boolean }) {
  const [rows, setRows] = useState<TaskTpl[] | null>(null);
  const list = save ? rows ?? tasks : tasks;
  const put = (t: TaskTpl[]) => (save ? setRows(t) : onChange(t));
  return (
    <div className="grid gap-2">
      {list.map((t, i) => (
        <div key={t.id} className="flex flex-wrap items-end gap-2">
          <Input label="المهمة" wrapClassName="min-w-48 flex-1" disabled={readOnly} value={t.text} onChange={(e) => put(list.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))} />
          <Sel label="المسؤول" className="w-40" disabled={readOnly} value={t.who} onChange={(w) => put(list.map((x, j) => (j === i ? { ...x, who: w } : x)))} options={WHO} />
          <Input label="بعد كام يوم" wrapClassName="w-24" dir="ltr" disabled={readOnly} value={String(t.dueDay)} onChange={(e) => put(list.map((x, j) => (j === i ? { ...x, dueDay: Number(e.target.value) || 0 } : x)))} />
          {readOnly ? null : <Button size="sm" variant="ghost" onClick={() => put(list.filter((_, j) => j !== i))}>حذف</Button>}
        </div>
      ))}
      {readOnly ? null : <div className="flex gap-2"><Button size="sm" variant="outline" onClick={() => put([...list, { id: newId(), text: "", who: "hr", dueDay: 0 }])}>إضافة مهمة</Button>{save && rows ? <Button size="sm" onClick={async () => { await onChange(rows); setRows(null); }}>حفظ</Button> : null}</div>}
    </div>
  );
}

function LadderEditor({ ladder, onChange, readOnly }: { ladder: Penalty[]; onChange: (l: Penalty[]) => void; readOnly: boolean }) {
  return (
    <div className="grid gap-2">
      {ladder.map((p, i) => (
        <div key={i} className="flex flex-wrap items-end gap-2">
          <span className="pb-3 text-[13px] text-muted">المرة {i + 1}{i === ladder.length - 1 ? " وما بعدها" : ""}</span>
          <Sel label="الجزاء" className="w-44" disabled={readOnly} value={p.action} onChange={(a) => onChange(ladder.map((x, j) => (j === i ? { ...x, action: a as Penalty["action"] } : x)))} options={Object.entries(ACTION_LABEL).map(([value, label]) => ({ value, label }))} />
          {p.action === "deduct" || p.action === "suspend" || p.action === "final" ? <Input label="أيام خصم" wrapClassName="w-24" dir="ltr" disabled={readOnly} value={String(p.days)} onChange={(e) => onChange(ladder.map((x, j) => (j === i ? { ...x, days: Number(e.target.value) || 0 } : x)))} /> : null}
          {readOnly ? null : <Button size="sm" variant="ghost" onClick={() => onChange(ladder.filter((_, j) => j !== i))}>حذف</Button>}
        </div>
      ))}
      {readOnly ? null : <div><Button size="sm" variant="outline" onClick={() => onChange([...ladder, { action: "deduct", days: 1 }])}>إضافة درجة</Button></div>}
    </div>
  );
}
