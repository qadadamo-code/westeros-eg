/** استلام الموظف الجديد: قائمة مهام أول أيام الموظف، مين مسؤول عن كل مهمة وميعادها، وتعليمها لما تخلص. */
import { useState } from "react";
import { Link } from "react-router-dom";
import { ClipboardCheck, Plus } from "lucide-react";
import type { HrDoc } from "@/data/hrDocTypes";
import { useDb } from "@/data/hooks";
import { Badge, Button, Card, CardHeader, Dialog, Input, Segmented, useToast } from "@/ui";
import { useArea } from "../useAccess";
import { K, addDays, dataOf, type OnboardingData, type TaskState } from "./model";
import { saveDoc, startOnboarding } from "./ops";
import { useHrx, type Hrx } from "./useHrx";
import { dmy, err, MemberSelect, RowActions, Sel, useRemove } from "./ui";

const WHO: Record<string, string> = { hr: "الموارد البشرية", direct: "المدير المباشر", employee: "الموظف" };

export function TaskList({ hrx, row, tasks, start, readOnly, kind }: { hrx: Hrx; row: HrDoc; tasks: TaskState[]; start: string; readOnly: boolean; kind: string }) {
  const db = useDb();
  const { toast } = useToast();
  const toggle = async (t: TaskState) => {
    const next = tasks.map((x) => (x.id === t.id ? { ...x, done: !x.done, by: !x.done ? hrx.staff?.name ?? "" : "", at: !x.done ? hrx.today : null } : x));
    try { await saveDoc(db, row, { kind, status: kind === K.onboarding ? (next.every((x) => x.done) ? "done" : "open") : row.status, data: { tasks: next, ...(kind === K.exit ? { clearance: next } : {}) } }); } catch (e) { toast({ tone: "error", title: "تعذر الحفظ", description: err(e) }); }
  };
  return (
    <ul className="grid gap-1.5">
      {tasks.map((t) => {
        const due = addDays(start, t.dueDay);
        const late = !t.done && due < hrx.today;
        return (
          <li key={t.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-line px-2.5 py-1.5 text-[14px]">
            <input type="checkbox" className="size-4" disabled={readOnly} checked={t.done} onChange={() => toggle(t)} aria-label={t.text} />
            <span className={t.done ? "text-muted line-through" : ""}>{t.text}</span>
            <span className="text-[12px] text-muted">· {WHO[t.who] ?? t.who}{t.who === "direct" && row.memberId ? ` (${hrx.name(hrx.fileOfMember(row.memberId).managerId)})` : ""}</span>
            <span className="flex-1" />
            {t.done ? <span className="text-[12px] text-muted">{t.by} · {dmy(t.at)}</span> : <Badge size="sm" tone={late ? "danger" : "neutral"}>{late ? "متأخرة" : ""} {dmy(due)}</Badge>}
          </li>
        );
      })}
    </ul>
  );
}

export default function Onboarding() {
  const hrx = useHrx();
  const rights = useArea();
  const rm = useRemove();
  const [show, setShow] = useState<"open" | "done">("open");
  const [adding, setAdding] = useState(false);
  const rows = hrx.by(K.onboarding).filter((d) => (show === "open" ? d.status !== "done" : d.status === "done") && hrx.visible.some((m) => m.id === d.memberId)).sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Segmented label="الحالة" value={show} onChange={setShow} options={[{ value: "open", label: "جاري" }, { value: "done", label: "خلص" }]} />
        <span className="flex-1" />
        {rights.add ? <Button icon={<Plus />} onClick={() => setAdding(true)}>بدء استلام موظف</Button> : null}
      </div>
      <div className="grid items-start gap-4 lg:grid-cols-2">
        {rows.map((d) => {
          const x = dataOf<OnboardingData>(d);
          const done = x.tasks.filter((t) => t.done).length;
          return (
            <Card key={d.id}>
              <CardHeader icon={<ClipboardCheck />} title={<Link to={`/hr/e/${d.memberId}`} className="hover:underline">{hrx.name(d.memberId)}</Link>} subtitle={`${hrx.settings.onboarding.find((o) => o.id === x.templateId)?.name ?? "استلام"} · بدأ ${dmy(x.start)} · ${done} من ${x.tasks.length}`}
                action={<RowActions onDelete={() => rm.ask(d)} />} />
              <div className="px-5 pb-1"><div className="h-2 overflow-hidden rounded-full bg-surface-2"><div className="h-full bg-brass" style={{ width: `${x.tasks.length ? (done / x.tasks.length) * 100 : 0}%` }} /></div></div>
              <div className="px-5 pb-5 pt-3"><TaskList hrx={hrx} row={d} tasks={x.tasks} start={x.start} readOnly={!rights.edit} kind={K.onboarding} /></div>
            </Card>
          );
        })}
        {rows.length ? null : <p className="text-[14px] text-muted">مفيش.</p>}
      </div>
      {adding ? <StartDialog hrx={hrx} onClose={() => setAdding(false)} /> : null}
      {rm.node}
    </div>
  );
}

function StartDialog({ hrx, onClose }: { hrx: Hrx; onClose: () => void }) {
  const db = useDb();
  const { toast } = useToast();
  const [v, setV] = useState({ memberId: "", templateId: hrx.settings.onboarding[0]?.id ?? "", start: hrx.today });
  const [busy, setBusy] = useState(false);
  return (
    <Dialog open onClose={onClose} title="بدء استلام موظف" footer={<div className="flex justify-end gap-2"><Button variant="ghost" onClick={onClose}>إلغاء</Button><Button loading={busy} disabled={!v.memberId || !v.templateId} onClick={async () => { setBusy(true); try { await startOnboarding(db, hrx, v.memberId, hrx.name(v.memberId), v.templateId, v.start); toast({ tone: "success", title: "بدأ الاستلام" }); onClose(); } catch (e) { toast({ tone: "error", title: "تعذر", description: err(e) }); } finally { setBusy(false); } }}>بدء</Button></div>}>
      <div className="grid gap-3">
        <MemberSelect hrx={hrx} value={v.memberId} onChange={(x) => setV({ ...v, memberId: x })} />
        <Sel label="القائمة" value={v.templateId} onChange={(x) => setV({ ...v, templateId: x })} options={hrx.settings.onboarding.map((o) => ({ value: o.id, label: `${o.name} (${o.tasks.length} مهمة)` }))} />
        <Input label="تاريخ البداية" type="date" dir="ltr" value={v.start} onChange={(e) => setV({ ...v, start: e.target.value })} />
      </div>
    </Dialog>
  );
}
