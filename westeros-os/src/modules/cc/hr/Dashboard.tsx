/** ملخص الموارد البشرية: الأرقام المهمة، التنبيهات، الطلبات المستنية، إجازات النهارده، الورديات الناقصة، وأعياد الميلاد. */
import { Link } from "react-router-dom";
import { AlertTriangle, BellRing, CalendarClock, Cake, Inbox, Palmtree, Users } from "lucide-react";
import { useLive } from "@/data/hooks";
import { Badge, Card, CardHeader } from "@/ui";
import { K, addDays, dataOf, type CandidateData, type EvaluationData, type ExitData, type OnboardingData, type RequestData } from "./model";
import { alertsOf } from "./Contracts";
import { missingDocs } from "./Employees";
import { pendingFor } from "./usePending";
import { useHrx } from "./useHrx";
import { dmy, Kpi } from "./ui";

export default function Dashboard() {
  const hrx = useHrx();
  const shifts = useLive("rotaShifts").data;
  const month = hrx.today.slice(0, 7);
  const active = hrx.visible.filter((m) => m.active);
  const probation = active.filter((m) => hrx.fileOfMember(m.id).empStatus === "probation");
  const hires = active.filter((m) => (hrx.profileBy.get(m.id)?.hireDate ?? "").startsWith(month));
  const leavers = hrx.by(K.exit).filter((d) => dataOf<ExitData>(d).lastDay.startsWith(month));
  const pending = pendingFor(hrx);
  const allPending = hrx.by(K.request).filter((r) => r.status === "pending");
  const alerts = alertsOf(hrx);
  const cands = hrx.by(K.candidate).filter((c) => c.status === "active" && dataOf<CandidateData>(c).stage !== "rejected");
  const evals = hrx.by(K.evaluation).filter((d) => dataOf<EvaluationData>(d).period === month);
  const avgEval = evals.length ? Math.round(evals.reduce((s, d) => s + dataOf<EvaluationData>(d).total, 0) / evals.length) : null;
  const onLeave = hrx.by(K.request).filter((r) => { if (r.status !== "approved") return false; const d = dataOf<RequestData>(r); const t = hrx.settings.requestTypes.find((x) => x.id === d.typeId); return !!t?.leaveTypeId && !!d.from && d.from <= hrx.today && (d.to || d.from) >= hrx.today; });
  const missing = active.filter((m) => missingDocs(hrx, m.id).length);
  const lateTasks = hrx.by(K.onboarding).filter((d) => d.status !== "done").flatMap((d) => { const x = dataOf<OnboardingData>(d); return x.tasks.filter((t) => !t.done && addDays(x.start, t.dueDay) < hrx.today).map((t) => ({ d, t })); });
  const days = Array.from({ length: 7 }, (_, i) => addDays(hrx.today, i));
  const short = hrx.branches.flatMap((b) => { const need = hrx.settings.minStaff[b.id] || 0; if (!need) return []; return days.map((day) => ({ b, day, n: new Set(shifts.filter((s) => s.branchId === b.id && s.date === day && s.membershipId).map((s) => s.membershipId)).size, need })).filter((x) => x.n < x.need); });
  const birthdays = active.filter((m) => (hrx.profileBy.get(m.id)?.birthDate ?? "").slice(5, 7) === month.slice(5, 7)).sort((a, b) => (hrx.profileBy.get(a.id)?.birthDate ?? "").slice(8).localeCompare((hrx.profileBy.get(b.id)?.birthDate ?? "").slice(8)));
  return (
    <div className="grid gap-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
        <Kpi label="الموظفين" value={active.length} />
        <Kpi label="فترة تجربة" value={probation.length} />
        <Kpi label="تعيينات الشهر" value={hires.length} tone="ok" />
        <Kpi label="تركوا الشهر" value={leavers.length} tone={leavers.length ? "warn" : "neutral"} />
        <Kpi label="طلبات مستنية" value={allPending.length} sub={pending.length ? `${pending.length} مستنية قرارك` : undefined} tone={pending.length ? "warn" : "neutral"} />
        <Kpi label="متقدمين" value={cands.length} />
        <Kpi label="تنبيهات" value={alerts.length} tone={alerts.some((a) => a.left < 0) ? "danger" : alerts.length ? "warn" : "neutral"} />
        <Kpi label="متوسط تقييم الشهر" value={avgEval != null ? `${avgEval}%` : "—"} />
      </div>
      <div className="grid items-start gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader icon={<Inbox />} title="طلبات مستنية قرارك" action={<Link to="/hr/requests" className="text-[13px] underline">كل الطلبات</Link>} />
          <ul className="grid gap-1.5 px-5 pb-5">
            {pending.slice(0, 8).map((r) => { const d = dataOf<RequestData>(r); return <li key={r.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-line px-3 py-2 text-[14px]"><b>{hrx.name(r.memberId)}</b><span>{hrx.settings.requestTypes.find((t) => t.id === d.typeId)?.name ?? r.name}</span><span className="text-muted">{d.from ? dmy(d.from) : dmy(r.date)}</span></li>; })}
            {pending.length ? null : <li className="text-[13.5px] text-muted">مفيش.</li>}
          </ul>
        </Card>
        <Card>
          <CardHeader icon={<BellRing />} title="تنبيهات العقود والمستندات والتجربة" action={<Link to="/hr/contracts" className="text-[13px] underline">العقود</Link>} />
          <ul className="grid gap-1.5 px-5 pb-5">
            {alerts.slice(0, 8).map((a, i) => <li key={i} className="flex flex-wrap items-center gap-2 text-[14px]"><Link to={`/hr/e/${a.memberId}`} className="font-semibold underline">{hrx.name(a.memberId)}</Link><span>{a.what}</span><span className="flex-1" /><Badge size="sm" tone={a.left < 0 ? "danger" : "warn"}>{a.left < 0 ? "خلص" : `باقي ${a.left} يوم`}</Badge></li>)}
            {missing.length ? <li className="flex items-center gap-2 text-[14px] text-warn"><AlertTriangle className="size-4" />{missing.length} موظف ناقصهم مستندات مطلوبة</li> : null}
            {alerts.length || missing.length ? null : <li className="text-[13.5px] text-muted">مفيش.</li>}
          </ul>
        </Card>
        <Card>
          <CardHeader icon={<CalendarClock />} title="الورديات الناقصة في الأسبوع الجاي" subtitle={Object.values(hrx.settings.minStaff).some(Boolean) ? undefined : "حدد أقل عدد موظفين لكل فرع من الإعدادات عشان التنبيه يشتغل."} action={<Link to="/hr/schedule" className="text-[13px] underline">الورديات</Link>} />
          <ul className="grid gap-1.5 px-5 pb-5">
            {short.map((x) => <li key={x.b.id + x.day} className="flex items-center gap-2 text-[14px]"><span>{dmy(x.day)}</span><span className="text-muted">{x.b.name.ar}</span><span className="flex-1" /><Badge size="sm" tone="danger">{x.n} من {x.need}</Badge></li>)}
            {short.length ? null : <li className="text-[13.5px] text-muted">كل الأيام مكتملة.</li>}
          </ul>
        </Card>
        <Card>
          <CardHeader icon={<Palmtree />} title="في إجازة النهارده" />
          <ul className="grid gap-1.5 px-5 pb-5">
            {onLeave.map((r) => { const d = dataOf<RequestData>(r); return <li key={r.id} className="text-[14px]"><b>{hrx.name(r.memberId)}</b> <span className="text-muted">لحد {dmy(d.to || d.from)}</span></li>; })}
            {onLeave.length ? null : <li className="text-[13.5px] text-muted">محدش.</li>}
          </ul>
        </Card>
        <Card>
          <CardHeader icon={<Users />} title="مهام استلام متأخرة" action={<Link to="/hr/onboarding" className="text-[13px] underline">الاستلام</Link>} />
          <ul className="grid gap-1.5 px-5 pb-5">
            {lateTasks.slice(0, 8).map(({ d, t }) => <li key={d.id + t.id} className="text-[14px]"><b>{hrx.name(d.memberId)}</b>: {t.text}</li>)}
            {lateTasks.length ? null : <li className="text-[13.5px] text-muted">مفيش.</li>}
          </ul>
        </Card>
        <Card>
          <CardHeader icon={<Cake />} title="أعياد ميلاد الشهر" />
          <ul className="grid gap-1.5 px-5 pb-5">
            {birthdays.map((m) => <li key={m.id} className="text-[14px]"><b>{m.name}</b> <span className="text-muted">{dmy(hrx.profileBy.get(m.id)?.birthDate).slice(0, 5)}</span></li>)}
            {birthdays.length ? null : <li className="text-[13.5px] text-muted">مفيش.</li>}
          </ul>
        </Card>
      </div>
    </div>
  );
}
