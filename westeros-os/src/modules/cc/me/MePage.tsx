/** صفحتي: الحضور والجدول، طلباتي وأرصدة إجازاتي، تدريبي (الدروس والاختبار والشهادة)، تقييماتي، إنذاراتي (إقرار الاستلام)، وقسائم راتبي. */
import { useState } from "react";
import { Award, BookOpen, CalendarDays, CheckCircle2, FileText, Gavel, Inbox, Plus, Printer, Wallet } from "lucide-react";
import type { HrDoc } from "@/data/hrDocTypes";
import { useDb } from "@/data/hooks";
import { Badge, Button, Card, CardHeader, Dialog, EmptyState, Segmented, useToast } from "@/ui";
import { PageHeader } from "@/shell/PageHeader";
import { cn } from "@/lib/cn";
import { ClockCard, MyAttendance, MyWeek } from "@/modules/hr/MePage";
import { ACTION_LABEL, K, activeOpts, dataOf, evalBand, leaveUsed, quizScore, spanDays, type CourseData, type EvaluationData, type PayslipData, type ProgressData, type RequestData, type WarningData } from "../hr/model";
import { useHrx, type Hrx } from "../hr/useHrx";
import { NewRequestDialog, REQ_STATUS } from "../hr/Requests";
import { printCertificate } from "../hr/Training";
import { printWarning } from "../hr/Discipline";
import { dmy, err, money } from "../hr/ui";
import { fmt } from "../finance/ui";

type Tab = "time" | "requests" | "training" | "reviews" | "warnings" | "pay";

export default function MePage() {
  const hrx = useHrx();
  const me = hrx.staff;
  const [tab, setTab] = useState<Tab>("time");
  if (!me) return null;
  const mine = (k: string) => hrx.docs.filter((d) => d.kind === k && d.memberId === me.id);
  const acks = new Set(hrx.by(K.ack).map((a) => (a.data as { warningId?: string }).warningId));
  const unacked = mine(K.warning).filter((w) => w.status !== "cancelled" && !acks.has(w.id)).length;
  const todo = mine(K.progress).filter((p) => !dataOf<ProgressData>(p).passed).length;
  return (
    <div className="mx-auto grid w-full max-w-3xl gap-5">
      <PageHeader icon={<FileText />} kicker="أهلاً" title={me.name} subtitle={[hrx.jobOf(me.id)?.name, hrx.deptOf(me.id)?.name].filter(Boolean).join(" · ") || undefined} />
      <Segmented block label="صفحتي" value={tab} onChange={setTab} className="overflow-x-auto"
        options={[
          { value: "time", label: "حضوري", icon: <CalendarDays /> },
          { value: "requests", label: "طلباتي", icon: <Inbox /> },
          { value: "training", label: "تدريبي", icon: <BookOpen />, badge: todo || undefined },
          { value: "reviews", label: "تقييمي", icon: <Award /> },
          { value: "warnings", label: "إنذاراتي", icon: <Gavel />, badge: unacked || undefined },
          { value: "pay", label: "راتبي", icon: <Wallet /> },
        ]} />
      {tab === "time" ? <><ClockCard /><MyWeek /><MyAttendance /></> : null}
      {tab === "requests" ? <MyRequests hrx={hrx} rows={mine(K.request)} /> : null}
      {tab === "training" ? <MyTraining hrx={hrx} rows={mine(K.progress)} /> : null}
      {tab === "reviews" ? <MyReviews hrx={hrx} rows={mine(K.evaluation)} /> : null}
      {tab === "warnings" ? <MyWarnings hrx={hrx} rows={mine(K.warning)} acks={acks} /> : null}
      {tab === "pay" ? <MyPay hrx={hrx} rows={mine(K.payslip)} /> : null}
    </div>
  );
}

function MyRequests({ hrx, rows }: { hrx: Hrx; rows: HrDoc[] }) {
  const db = useDb();
  const { toast } = useToast();
  const [adding, setAdding] = useState(false);
  const me = hrx.staff!;
  const year = hrx.today.slice(0, 4);
  const used = leaveUsed(hrx.by(K.request), hrx.settings.requestTypes, me.id, year);
  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {activeOpts(hrx.settings.leaveTypes).filter((l) => l.days > 0).map((l) => <Card key={l.id} className="grid gap-0.5 p-3"><span className="text-[12.5px] text-muted">{l.name}</span><span className="text-[22px] font-bold">{l.days - (used.get(l.id) ?? 0)}</span><span className="text-[12px] text-muted">باقي من {l.days} يوم</span></Card>)}
      </div>
      <Card>
        <CardHeader icon={<Inbox />} title="طلباتي" action={<Button size="sm" icon={<Plus />} onClick={() => setAdding(true)}>طلب جديد</Button>} />
        <ul className="grid gap-2 px-5 pb-5">
          {rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((r) => { const d = dataOf<RequestData>(r); const s = REQ_STATUS[r.status] ?? REQ_STATUS.pending; return (
            <li key={r.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-line px-3 py-2 text-[14px]">
              <span className="font-semibold">{hrx.settings.requestTypes.find((t) => t.id === d.typeId)?.name ?? r.name}</span>
              <span className="text-muted">{d.from ? `${dmy(d.from)}${d.to && d.to !== d.from ? ` ← ${dmy(d.to)} (${spanDays(d.from, d.to)} يوم)` : ""}` : dmy(r.date)}</span>
              {d.amount ? <span>{fmt(d.amount)} ج.م</span> : null}
              <span className="flex-1" /><Badge size="sm" tone={s.tone}>{s.label}</Badge>
              {r.status === "pending" ? <Button size="sm" variant="ghost" onClick={async () => { try { await db.update("hrDocs", r.id, { status: "cancelled" }); toast({ tone: "success", title: "اتلغى الطلب" }); } catch (e) { toast({ tone: "error", title: "تعذر", description: err(e) }); } }}>إلغاء</Button> : null}
            </li>
          ); })}
          {rows.length ? null : <li className="text-[13.5px] text-muted">مفيش طلبات.</li>}
        </ul>
      </Card>
      {adding ? <NewRequestDialog hrx={hrx} self onClose={() => setAdding(false)} /> : null}
    </div>
  );
}

function MyTraining({ hrx, rows }: { hrx: Hrx; rows: HrDoc[] }) {
  const [open, setOpen] = useState<HrDoc | null>(null);
  const courses = hrx.by(K.course);
  return (
    <Card>
      <CardHeader icon={<BookOpen />} title="تدريبي" />
      <ul className="grid gap-2 px-5 pb-5">
        {rows.map((p) => { const x = dataOf<ProgressData>(p); const c = courses.find((y) => y.id === x.courseId); if (!c) return null; const n = dataOf<CourseData>(c).lessons.length; return (
          <li key={p.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-line p-3">
            <span className="grid flex-1"><span className="font-semibold">{c.name}</span><span className="text-[12.5px] text-muted">{x.done.length}/{n} درس{x.score != null ? ` · آخر نتيجة ${x.score}%` : ""}</span></span>
            {x.passed ? <><Badge tone="ok" icon={<CheckCircle2 />}>نجحت</Badge><Button size="sm" variant="ghost" icon={<Printer />} onClick={() => printCertificate(hrx, p)}>الشهادة</Button></> : <Button size="sm" onClick={() => setOpen(p)}>{x.done.length ? "كمل" : "ابدأ"}</Button>}
          </li>
        ); })}
        {rows.length ? null : <li className="text-[13.5px] text-muted">مفيش دورات عليك.</li>}
      </ul>
      {open ? <CoursePlayer hrx={hrx} p={open} onClose={() => setOpen(null)} /> : null}
    </Card>
  );
}

function CoursePlayer({ hrx, p, onClose }: { hrx: Hrx; p: HrDoc; onClose: () => void }) {
  const db = useDb();
  const { toast } = useToast();
  const x = dataOf<ProgressData>(p);
  const course = hrx.by(K.course).find((c) => c.id === x.courseId)!;
  const c = dataOf<CourseData>(course);
  const [step, setStep] = useState(Math.min(x.done.length, c.lessons.length));
  const [answers, setAnswers] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  const inQuiz = step >= c.lessons.length;
  const lesson = c.lessons[step];
  const save = (patch: Partial<ProgressData>, status?: string) => db.update("hrDocs", p.id, { status: status ?? p.status, data: { ...p.data, ...patch } });
  const next = async () => {
    const done = Array.from(new Set([...x.done, lesson.id]));
    try { await save({ done }, "started"); x.done = done; setStep(step + 1); } catch (e) { toast({ tone: "error", title: "تعذر الحفظ", description: err(e) }); }
  };
  const submit = async () => {
    if (c.quiz.some((_, i) => answers[i] == null)) return toast({ tone: "error", title: "جاوب كل الأسئلة" });
    setBusy(true);
    const score = quizScore(c.quiz, answers);
    const passed = score >= (c.passMark || hrx.settings.passMark);
    try { await save({ score, passed, answers, tries: (x.tries ?? 0) + 1, completedAt: passed ? hrx.today : null, done: c.lessons.map((l) => l.id) }, passed ? "passed" : "started"); toast({ tone: passed ? "success" : "error", title: passed ? `مبروك! نجحت بـ ${score}%` : `نتيجتك ${score}%، محتاج ${c.passMark}%. راجع الدروس وحاول تاني` }); if (passed) onClose(); }
    catch (e) { toast({ tone: "error", title: "تعذر الحفظ", description: err(e) }); } finally { setBusy(false); }
  };
  return (
    <Dialog open onClose={onClose} size="lg" title={course.name}
      footer={<div className="flex justify-between gap-2"><Button variant="ghost" disabled={step === 0} onClick={() => setStep(step - 1)}>السابق</Button>{inQuiz ? (c.quiz.length ? <Button loading={busy} onClick={submit}>تسليم الاختبار</Button> : <Button loading={busy} onClick={submit}>إنهاء الدورة</Button>) : <Button onClick={next}>{step === c.lessons.length - 1 ? "للاختبار" : "التالي"}</Button>}</div>}>
      <div className="grid gap-3">
        <div className="flex gap-1">{[...c.lessons, { id: "quiz" }].map((l, i) => <span key={l.id} className={cn("h-1.5 flex-1 rounded-full", i <= step ? "bg-brass" : "bg-surface-2")} />)}</div>
        {!inQuiz && lesson ? (
          <div className="grid gap-2">
            <h3 className="text-[17px] font-bold">{step + 1}. {lesson.title}</h3>
            <p className="whitespace-pre-wrap text-[15px] leading-7">{lesson.body}</p>
            {lesson.url ? <a href={lesson.url} target="_blank" rel="noreferrer" className="text-[14px] underline">افتح الفيديو أو الملف</a> : null}
          </div>
        ) : (
          <div className="grid gap-3">
            <h3 className="text-[17px] font-bold">الاختبار {c.quiz.length ? `(النجاح ${c.passMark}%)` : ""}</h3>
            {c.quiz.map((q, i) => (
              <div key={q.id} className="grid gap-1.5 rounded-xl border border-line p-3">
                <span className="font-semibold">{i + 1}. {q.q}</span>
                {q.options.map((o, k) => <label key={k} className="flex items-center gap-2 text-[14.5px]"><input type="radio" name={`q-${q.id}`} checked={answers[i] === k} onChange={() => { const a = [...answers]; a[i] = k; setAnswers(a); }} />{o}</label>)}
              </div>
            ))}
            {c.quiz.length ? null : <p className="text-[14px] text-muted">الدورة مالهاش اختبار.</p>}
          </div>
        )}
      </div>
    </Dialog>
  );
}

function MyReviews({ hrx, rows }: { hrx: Hrx; rows: HrDoc[] }) {
  return (
    <Card>
      <CardHeader icon={<Award />} title="تقييماتي" />
      <ul className="grid gap-2 px-5 pb-5">
        {rows.sort((a, b) => dataOf<EvaluationData>(b).period.localeCompare(dataOf<EvaluationData>(a).period)).map((d) => { const x = dataOf<EvaluationData>(d); const b = evalBand(x.total); return (
          <li key={d.id} className="grid gap-1.5 rounded-xl border border-line p-3">
            <div className="flex items-center gap-2"><span className="font-semibold">تقييم {x.period}</span><span className="flex-1" /><Badge tone={b.tone}>{x.total}% {b.label}</Badge></div>
            <div className="grid gap-1 text-[13.5px]">{activeOpts(hrx.settings.criteria).map((c) => <div key={c.id} className="flex items-center gap-2"><span className="flex-1">{c.name}</span><span className="tabular-nums">{x.scores[c.id] ?? "—"}/5</span></div>)}</div>
            {x.strengths ? <p className="text-[13.5px]"><b>نقاط قوتك:</b> {x.strengths}</p> : null}
            {x.improve ? <p className="text-[13.5px]"><b>محتاج تتحسن في:</b> {x.improve}</p> : null}
            {x.goals ? <p className="text-[13.5px]"><b>أهدافك:</b> {x.goals}</p> : null}
          </li>
        ); })}
        {rows.length ? null : <li className="text-[13.5px] text-muted">مفيش تقييمات لسه.</li>}
      </ul>
    </Card>
  );
}

function MyWarnings({ hrx, rows, acks }: { hrx: Hrx; rows: HrDoc[]; acks: Set<string | undefined> }) {
  const db = useDb();
  const { toast } = useToast();
  const me = hrx.staff!;
  const list = rows.filter((w) => w.status !== "cancelled").sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
  if (!list.length) return <Card><EmptyState icon={<CheckCircle2 />} title="مفيش إنذارات عليك" body="استمر كده." /></Card>;
  return (
    <Card>
      <CardHeader icon={<Gavel />} title="إنذاراتي" />
      <ul className="grid gap-2 px-5 pb-5">
        {list.map((w) => { const d = dataOf<WarningData>(w); return (
          <li key={w.id} className="grid gap-1 rounded-xl border border-line p-3 text-[14px]">
            <div className="flex flex-wrap items-center gap-2"><span className="font-semibold">{hrx.settings.violations.find((v) => v.id === d.violationId)?.name ?? w.name}</span><Badge size="sm" tone="danger">{ACTION_LABEL[d.action]}{d.days ? ` ${d.days} يوم` : ""}</Badge><span className="text-muted">{dmy(w.date)}</span></div>
            <p>{d.incident}</p>{d.amount ? <p className="text-muted">الخصم: {money(hrx, d.amount)} ج.م</p> : null}
            <div className="flex gap-2">
              <Button size="sm" variant="ghost" icon={<Printer />} onClick={() => printWarning(hrx, w)}>الخطاب</Button>
              {acks.has(w.id) ? <Badge tone="ok">استلمت</Badge> : <Button size="sm" onClick={async () => { try { await db.insert("hrDocs", { kind: K.ack, code: "", name: me.name, memberId: me.id, branchId: null, status: "active", date: hrx.today, data: { warningId: w.id } }); toast({ tone: "success", title: "اتسجل استلامك" }); } catch (e) { toast({ tone: "error", title: "تعذر", description: err(e) }); } }}>أقر بالاستلام</Button>}
            </div>
          </li>
        ); })}
      </ul>
    </Card>
  );
}

const PAY_ROWS: { k: string; label: string; minus?: boolean }[] = [
  { k: "basic", label: "الأساسي" }, { k: "allowances", label: "البدلات" }, { k: "overtime", label: "الإضافي" }, { k: "bonus", label: "الحوافز" },
  { k: "deductions", label: "الخصومات والجزاءات", minus: true }, { k: "insEmployee", label: "التأمينات", minus: true }, { k: "tax", label: "الضريبة", minus: true }, { k: "advance", label: "قسط السلفة", minus: true }, { k: "savings", label: "المدخرات", minus: true },
];
function MyPay({ hrx, rows }: { hrx: Hrx; rows: HrDoc[] }) {
  void hrx;
  const list = rows.sort((a, b) => dataOf<PayslipData>(b).month.localeCompare(dataOf<PayslipData>(a).month));
  if (!list.length) return <Card><EmptyState icon={<Wallet />} title="مفيش قسائم منشورة لسه" /></Card>;
  return (
    <div className="grid gap-3">
      {list.map((d) => { const x = dataOf<PayslipData>(d); return (
        <Card key={d.id} className="grid gap-1.5 p-4">
          <div className="flex items-center justify-between"><span className="font-bold">شهر {x.month}</span><span className="text-[20px] font-bold">{fmt(x.net)} ج.م</span></div>
          {PAY_ROWS.filter((r) => Number(x.line[r.k] ?? 0)).map((r) => <div key={r.k} className="flex justify-between text-[14px]"><span className="text-muted">{r.label}</span><span className={r.minus ? "text-danger" : ""}>{r.minus ? "−" : ""}{fmt(Number(x.line[r.k] ?? 0))}</span></div>)}
        </Card>
      ); })}
    </div>
  );
}
