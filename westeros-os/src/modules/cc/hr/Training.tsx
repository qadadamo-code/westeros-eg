/** التدريب: دورات (دروس نصية أو لينك فيديو، واختبار قصير)، تكليف الموظفين بها، متابعة التقدم والنتائج، وشهادة إتمام. */
import { useMemo, useState } from "react";
import { Award, BookOpen, Plus, Printer, Trash2, UserPlus } from "lucide-react";
import type { HrDoc } from "@/data/hrDocTypes";
import { useDb } from "@/data/hooks";
import { Badge, Button, Card, CardHeader, Dialog, IconButton, Input, Segmented, Table, Textarea, useToast } from "@/ui";
import { useArea } from "../useAccess";
import { ExportButton } from "../ui";
import { esc, printDoc } from "../finance/ui";
import { K, activeOpts, addMonths, dataOf, newId, optName, type CourseData, type Lesson, type ProgressData, type Question } from "./model";
import { saveDoc } from "./ops";
import { useHrx, type Hrx } from "./useHrx";
import { CustomInputs, dmy, err, RowActions, Sel, useRemove } from "./ui";

export function printCertificate(hrx: Hrx, p: HrDoc) {
  const x = dataOf<ProgressData>(p);
  const c = hrx.by(K.course).find((d) => d.id === x.courseId);
  printDoc("شهادة إتمام", `<div style="border:3px double #000;padding:28px;text-align:center"><h1>شهادة إتمام تدريب</h1><p style="margin-top:18px">تشهد إدارة المطعم بأن</p><h1 style="font-size:26px">${esc(hrx.name(p.memberId))}</h1>
    <p>أتم بنجاح دورة</p><h1>${esc(c?.name ?? "")}</h1><p>بتاريخ ${dmy(x.completedAt)}${x.score != null ? ` بنتيجة ${x.score}%` : ""}</p>
    ${c && dataOf<CourseData>(c).validMonths ? `<p>صالحة حتى ${dmy(addMonths(x.completedAt ?? hrx.today, dataOf<CourseData>(c).validMonths))}</p>` : ""}<div class="sign"><span>المدرب</span><span>الإدارة</span></div></div>`);
}

export default function Training() {
  const [tab, setTab] = useState<"courses" | "progress">("courses");
  return (
    <div className="grid gap-4">
      <Segmented label="التدريب" value={tab} onChange={setTab} options={[{ value: "courses", label: "الدورات", icon: <BookOpen /> }, { value: "progress", label: "متابعة الموظفين", icon: <Award /> }]} />
      {tab === "courses" ? <Courses /> : <Progress />}
    </div>
  );
}

function Courses() {
  const hrx = useHrx();
  const rights = useArea();
  const rm = useRemove();
  const [edit, setEdit] = useState<HrDoc | "new" | null>(null);
  const [assign, setAssign] = useState<HrDoc | null>(null);
  const courses = hrx.by(K.course).sort((a, b) => a.name.localeCompare(b.name, "ar"));
  const prog = hrx.by(K.progress);
  return (
    <Card>
      <CardHeader icon={<BookOpen />} title="الدورات" subtitle="الموظف بياخد الدورة من صفحته: يقرا الدروس ويحل الاختبار، ولو نجح بتطلع له شهادة." action={rights.add ? <Button size="sm" icon={<Plus />} onClick={() => setEdit("new")}>دورة جديدة</Button> : null} />
      <Table rows={courses} rowKey={(c) => c.id} empty="لسه مفيش دورات. ابدأ بدورة طريقة التصنيع وسلامة الغذاء."
        columns={[
          { key: "n", header: "الدورة", cell: (c) => <span className="grid"><span className="font-semibold">{c.name}</span><span className="text-[12px] text-muted">{optName(hrx.settings.courseCategories, dataOf<CourseData>(c).categoryId)}</span></span> },
          { key: "l", header: "المحتوى", cell: (c) => { const d = dataOf<CourseData>(c); return `${d.lessons.length} درس · ${d.quiz.length} سؤال`; } },
          { key: "j", header: "لازمة لوظائف", hideOnMobile: true, cell: (c) => dataOf<CourseData>(c).jobs.map((j) => hrx.jobs.find((x) => x.id === j)?.name).filter(Boolean).join("، ") || "—" },
          { key: "p", header: "الموظفين", align: "center", cell: (c) => { const p = prog.filter((x) => dataOf<ProgressData>(x).courseId === c.id); return `${p.filter((x) => dataOf<ProgressData>(x).passed).length} نجح / ${p.length}`; } },
          { key: "a", header: "", align: "end", cell: (c) => <RowActions onEdit={() => setEdit(c)} onDelete={() => rm.ask(c)}>{rights.add ? <IconButton label="تكليف موظفين" size="sm" onClick={() => setAssign(c)}><UserPlus /></IconButton> : null}</RowActions> },
        ]} />
      {edit ? <CourseDialog hrx={hrx} row={edit === "new" ? null : edit} onClose={() => setEdit(null)} /> : null}
      {assign ? <AssignDialog hrx={hrx} course={assign} onClose={() => setAssign(null)} /> : null}
      {rm.node}
    </Card>
  );
}

function CourseDialog({ hrx, row, onClose }: { hrx: Hrx; row: HrDoc | null; onClose: () => void }) {
  const db = useDb();
  const { toast } = useToast();
  const x = row ? dataOf<CourseData>(row) : null;
  const [name, setName] = useState(row?.name ?? "");
  const [d, setD] = useState<CourseData & { custom: Record<string, string> }>({ categoryId: x?.categoryId ?? hrx.settings.courseCategories[0]?.id ?? "", description: x?.description ?? "", lessons: x?.lessons ?? [], quiz: x?.quiz ?? [], passMark: x?.passMark ?? hrx.settings.passMark, jobs: x?.jobs ?? [], validMonths: x?.validMonths ?? 0, minutes: x?.minutes ?? 30, custom: ((row?.data as { custom?: Record<string, string> })?.custom ?? {}) });
  const [busy, setBusy] = useState(false);
  const setLesson = (i: number, l: Lesson) => setD({ ...d, lessons: d.lessons.map((y, j) => (j === i ? l : y)) });
  const setQ = (i: number, q: Question) => setD({ ...d, quiz: d.quiz.map((y, j) => (j === i ? q : y)) });
  const save = async () => {
    if (!name.trim()) return toast({ tone: "error", title: "اكتب اسم الدورة" });
    if (d.quiz.some((q) => !q.q.trim() || q.options.filter((o) => o.trim()).length < 2)) return toast({ tone: "error", title: "كل سؤال محتاج نص واختيارين على الأقل" });
    setBusy(true);
    try { await saveDoc(db, row, { kind: K.course, name: name.trim(), data: d as unknown as Record<string, unknown> }); toast({ tone: "success", title: "تم الحفظ" }); onClose(); }
    catch (e) { toast({ tone: "error", title: "تعذر الحفظ", description: err(e) }); } finally { setBusy(false); }
  };
  return (
    <Dialog open onClose={onClose} size="xl" title={row ? "تعديل دورة" : "دورة جديدة"} footer={<div className="flex justify-end gap-2"><Button variant="ghost" onClick={onClose}>إلغاء</Button><Button loading={busy} onClick={save}>حفظ</Button></div>}>
      <div className="grid gap-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <Input label="اسم الدورة *" value={name} onChange={(e) => setName(e.target.value)} />
          <Sel label="التصنيف" value={d.categoryId} onChange={(c) => setD({ ...d, categoryId: c })} options={activeOpts(hrx.settings.courseCategories).map((c) => ({ value: c.id, label: c.name }))} />
          <Input label="المدة بالدقائق" dir="ltr" value={String(d.minutes)} onChange={(e) => setD({ ...d, minutes: Number(e.target.value) || 0 })} />
          <Input label="درجة النجاح %" dir="ltr" value={String(d.passMark)} onChange={(e) => setD({ ...d, passMark: Number(e.target.value) || 0 })} />
          <Input label="صلاحية الشهادة (شهور، 0 = دايمة)" dir="ltr" value={String(d.validMonths)} onChange={(e) => setD({ ...d, validMonths: Number(e.target.value) || 0 })} />
          <div className="sm:col-span-3"><Textarea label="وصف الدورة" rows={2} value={d.description} onChange={(e) => setD({ ...d, description: e.target.value })} /></div>
          <div className="flex flex-wrap gap-1.5 sm:col-span-3"><span className="text-[13px] font-semibold">لازمة لوظائف:</span>{hrx.jobs.map((j) => <button key={j.id} type="button" onClick={() => setD({ ...d, jobs: d.jobs.includes(j.id) ? d.jobs.filter((x) => x !== j.id) : [...d.jobs, j.id] })} className={`rounded-full border px-2.5 py-0.5 text-[13px] ${d.jobs.includes(j.id) ? "border-primary bg-primary/15 font-semibold" : "border-line text-muted"}`}>{j.name}</button>)}</div>
          <CustomInputs fields={hrx.settings.customFields.course} values={d.custom} onChange={(c) => setD({ ...d, custom: c })} />
        </div>
        <div className="grid gap-2">
          <span className="font-bold">الدروس</span>
          {d.lessons.map((l, i) => (
            <div key={l.id} className="grid gap-2 rounded-xl border border-line p-2.5">
              <div className="flex items-end gap-2"><span className="pb-3 text-muted">{i + 1}.</span><Input label="عنوان الدرس" wrapClassName="flex-1" value={l.title} onChange={(e) => setLesson(i, { ...l, title: e.target.value })} /><Input label="لينك فيديو أو ملف (اختياري)" wrapClassName="flex-1" dir="ltr" value={l.url} onChange={(e) => setLesson(i, { ...l, url: e.target.value })} /><IconButton label="حذف" onClick={() => setD({ ...d, lessons: d.lessons.filter((_, j) => j !== i) })}><Trash2 /></IconButton></div>
              <Textarea label="شرح الدرس" rows={4} value={l.body} onChange={(e) => setLesson(i, { ...l, body: e.target.value })} />
            </div>
          ))}
          <div><Button size="sm" variant="outline" icon={<Plus />} onClick={() => setD({ ...d, lessons: [...d.lessons, { id: newId(), title: "", body: "", url: "" }] })}>درس</Button></div>
        </div>
        <div className="grid gap-2">
          <span className="font-bold">الاختبار</span>
          {d.quiz.map((q, i) => (
            <div key={q.id} className="grid gap-2 rounded-xl border border-line p-2.5">
              <div className="flex items-end gap-2"><span className="pb-3 text-muted">{i + 1}.</span><Input label="السؤال" wrapClassName="flex-1" value={q.q} onChange={(e) => setQ(i, { ...q, q: e.target.value })} /><IconButton label="حذف" onClick={() => setD({ ...d, quiz: d.quiz.filter((_, j) => j !== i) })}><Trash2 /></IconButton></div>
              {q.options.map((o, k) => (
                <div key={k} className="flex items-center gap-2"><input type="radio" name={`ans-${q.id}`} checked={q.answer === k} onChange={() => setQ(i, { ...q, answer: k })} aria-label="الإجابة الصح" /><Input aria-label={`اختيار ${k + 1}`} wrapClassName="flex-1" placeholder={`اختيار ${k + 1}`} value={o} onChange={(e) => setQ(i, { ...q, options: q.options.map((y, j) => (j === k ? e.target.value : y)) })} />{q.options.length > 2 ? <button type="button" className="text-[13px] text-muted" onClick={() => setQ(i, { ...q, options: q.options.filter((_, j) => j !== k), answer: q.answer >= k && q.answer > 0 ? q.answer - 1 : q.answer })}>حذف</button> : null}</div>
              ))}
              <div className="flex items-center gap-3"><Button size="sm" variant="ghost" onClick={() => setQ(i, { ...q, options: [...q.options, ""] })}>اختيار</Button><span className="text-[12px] text-muted">علّم الدايرة جنب الإجابة الصح.</span></div>
            </div>
          ))}
          <div><Button size="sm" variant="outline" icon={<Plus />} onClick={() => setD({ ...d, quiz: [...d.quiz, { id: newId(), q: "", options: ["", ""], answer: 0 }] })}>سؤال</Button></div>
        </div>
      </div>
    </Dialog>
  );
}

function AssignDialog({ hrx, course, onClose }: { hrx: Hrx; course: HrDoc; onClose: () => void }) {
  const db = useDb();
  const { toast } = useToast();
  const c = dataOf<CourseData>(course);
  const have = new Set(hrx.by(K.progress).filter((p) => dataOf<ProgressData>(p).courseId === course.id).map((p) => p.memberId));
  const people = hrx.visible.filter((m) => m.active && !have.has(m.id));
  const [pick, setPick] = useState<Set<string>>(() => new Set(people.filter((m) => c.jobs.includes(hrx.fileOfMember(m.id).jobId ?? "")).map((m) => m.id)));
  const [busy, setBusy] = useState(false);
  return (
    <Dialog open onClose={onClose} size="lg" title={`تكليف بدورة ${course.name}`} footer={<div className="flex justify-end gap-2"><Button variant="ghost" onClick={onClose}>إلغاء</Button><Button loading={busy} disabled={!pick.size} onClick={async () => {
      setBusy(true);
      try { for (const id of pick) await saveDoc(db, null, { kind: K.progress, memberId: id, name: hrx.name(id), date: hrx.today, status: "assigned", data: { courseId: course.id, done: [], score: null, passed: false, completedAt: null, answers: [], tries: 0 } }); toast({ tone: "success", title: `اتكلف ${pick.size} موظف` }); onClose(); }
      catch (e) { toast({ tone: "error", title: "تعذر", description: err(e) }); } finally { setBusy(false); }
    }}>تكليف {pick.size || ""}</Button></div>}>
      <div className="grid gap-1.5">
        <div className="flex gap-2"><Button size="sm" variant="ghost" onClick={() => setPick(new Set(people.map((m) => m.id)))}>الكل</Button><Button size="sm" variant="ghost" onClick={() => setPick(new Set())}>ولا حد</Button></div>
        {people.map((m) => <label key={m.id} className="flex items-center gap-2 rounded-lg border border-line px-3 py-1.5 text-[14px]"><input type="checkbox" checked={pick.has(m.id)} onChange={() => { const n = new Set(pick); if (n.has(m.id)) n.delete(m.id); else n.add(m.id); setPick(n); }} />{m.name}<span className="text-[12px] text-muted">{hrx.jobOf(m.id)?.name ?? ""}</span></label>)}
        {people.length ? null : <p className="text-[13.5px] text-muted">كل الموظفين متكلفين بالدورة دي.</p>}
      </div>
    </Dialog>
  );
}

function Progress() {
  const hrx = useHrx();
  const rm = useRemove();
  const [course, setCourse] = useState("");
  const courses = hrx.by(K.course);
  const rows = useMemo(() => hrx.by(K.progress).filter((p) => hrx.visible.some((m) => m.id === p.memberId) && (!course || dataOf<ProgressData>(p).courseId === course)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)), [hrx, course]);
  const name = (p: HrDoc) => courses.find((c) => c.id === dataOf<ProgressData>(p).courseId)?.name ?? "—";
  const expiry = (p: HrDoc) => { const x = dataOf<ProgressData>(p); const c = courses.find((y) => y.id === x.courseId); const m = c ? dataOf<CourseData>(c).validMonths : 0; return x.completedAt && m ? addMonths(x.completedAt, m) : null; };
  return (
    <Card>
      <CardHeader icon={<Award />} title="متابعة التدريب" action={<div className="flex items-end gap-2"><Sel label="الدورة" value={course} onChange={setCourse} options={[{ value: "", label: "كل الدورات" }, ...courses.map((c) => ({ value: c.id, label: c.name }))]} /><ExportButton size="sm" file="التدريب" head={["الموظف", "الدورة", "الدروس", "النتيجة", "الحالة", "تاريخ الإتمام"]} rows={() => rows.map((p) => { const x = dataOf<ProgressData>(p); return [hrx.name(p.memberId), name(p), x.done.length, x.score ?? "", x.passed ? "نجح" : "جاري", x.completedAt ?? ""]; })} /></div>} />
      <Table rows={rows} rowKey={(p) => p.id} empty="محدش متكلف بدورات."
        columns={[
          { key: "n", header: "الموظف", cell: (p) => <span className="font-semibold">{hrx.name(p.memberId)}</span> },
          { key: "c", header: "الدورة", cell: name },
          { key: "d", header: "التقدم", cell: (p) => { const x = dataOf<ProgressData>(p); const c = courses.find((y) => y.id === x.courseId); const n = c ? dataOf<CourseData>(c).lessons.length : 0; return `${x.done.length}/${n} درس${x.tries ? ` · ${x.tries} محاولة` : ""}`; } },
          { key: "s", header: "النتيجة", cell: (p) => { const x = dataOf<ProgressData>(p); const e = expiry(p); return x.passed ? <span className="grid"><Badge size="sm" tone={e && e < hrx.today ? "danger" : "ok"}>{e && e < hrx.today ? "الشهادة خلصت" : `نجح ${x.score ?? ""}%`}</Badge>{e ? <span className="text-[11.5px] text-muted">صالحة حتى {dmy(e)}</span> : null}</span> : x.score != null ? <Badge size="sm" tone="danger">ما نجحش {x.score}%</Badge> : <Badge size="sm">ما خلصش</Badge>; } },
          { key: "a", header: "", align: "end", cell: (p) => <RowActions onDelete={() => rm.ask(p)}>{dataOf<ProgressData>(p).passed ? <IconButton label="طباعة الشهادة" size="sm" onClick={() => printCertificate(hrx, p)}><Printer /></IconButton> : null}</RowActions> },
        ]} />
      {rm.node}
    </Card>
  );
}
