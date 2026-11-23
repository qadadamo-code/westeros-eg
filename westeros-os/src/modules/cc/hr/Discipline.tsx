/** الإنذارات والجزاءات: المخالفة بتطلع درجتها من سلم الجزاءات تلقائياً (حسب عدد المرات في المدة)، الخصم بينزل على الراتب، خطاب للطباعة، وإقرار الموظف بالاستلام. */
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Gavel, Plus, Printer, Send } from "lucide-react";
import type { HrDoc } from "@/data/hrDocTypes";
import { useDb } from "@/data/hooks";
import { Badge, Button, Card, CardHeader, Dialog, IconButton, Input, Table, Textarea, useToast } from "@/ui";
import { useArea } from "../useAccess";
import { ExportButton } from "../ui";
import { esc, printDoc, Toolbar } from "../finance/ui";
import { useActor } from "../finance/perms";
import { ACTION_LABEL, K, activeOpts, dataOf, dayWage, nextPenalty, type WarningData } from "./model";
import { cancelWarning, pushDeduction, saveDoc } from "./ops";
import { useHrx, type Hrx } from "./useHrx";
import { CustomInputs, dmy, err, MemberSelect, missingCustom, money, RowActions, Sel, useRemove } from "./ui";

export function printWarning(hrx: Hrx, w: HrDoc) {
  const d = dataOf<WarningData>(w);
  const v = hrx.settings.violations.find((x) => x.id === d.violationId);
  printDoc(`إنذار ${w.name}`, `<h1>${esc(ACTION_LABEL[d.action])}</h1><div class="row"><span>رقم: ${esc(w.code)}</span><span>التاريخ: ${dmy(w.date)}</span></div>
    <div class="box"><div class="row"><span class="lbl">الموظف</span><b>${esc(w.name)}</b></div><div class="row"><span class="lbl">الوظيفة</span><span>${esc(hrx.jobOf(w.memberId ?? "")?.name ?? "")}</span></div>
    <div class="row"><span class="lbl">المخالفة</span><span>${esc(v?.name ?? "")} (المرة ${d.level})</span></div>${d.days ? `<div class="row"><span class="lbl">الجزاء</span><span>خصم ${d.days} يوم${d.amount ? ` = ${money(hrx, d.amount)} ج.م` : ""}</span></div>` : ""}</div>
    <p><b>الواقعة:</b> ${esc(d.incident)}</p><p style="white-space:pre-wrap">${esc(d.text)}</p><p>وفي حالة تكرار المخالفة سيتم تطبيق الجزاء التالي في اللائحة.</p>
    <div class="sign"><span>توقيع الموظف بالاستلام</span><span>الإدارة</span></div>`);
}

export default function Discipline() {
  const hrx = useHrx();
  const db = useDb();
  const { toast } = useToast();
  const actor = useActor();
  const rights = useArea();
  const rm = useRemove();
  const [member, setMember] = useState("");
  const [viol, setViol] = useState("");
  const [month, setMonth] = useState("");
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const acks = new Set(hrx.by(K.ack).map((a) => (a.data as { warningId?: string }).warningId));
  const rows = useMemo(() => hrx.by(K.warning).filter((w) => hrx.visible.some((m) => m.id === w.memberId) && (!member || w.memberId === member) && (!viol || dataOf<WarningData>(w).violationId === viol) && (!month || (w.date ?? "").startsWith(month))).sort((a, b) => (b.date ?? "").localeCompare(a.date ?? "")), [hrx, member, viol, month]);
  const act = async (id: string, f: () => Promise<unknown>, ok: string) => { setBusy(id); try { await f(); toast({ tone: "success", title: ok }); } catch (e) { toast({ tone: "error", title: "تعذر", description: err(e) }); } finally { setBusy(null); } };
  return (
    <div className="grid gap-4">
      <Toolbar collapse actions={<>
        <ExportButton file="الإنذارات" head={["رقم", "الموظف", "المخالفة", "المرة", "الجزاء", "أيام الخصم", "المبلغ", "التاريخ", "الحالة"]} rows={() => rows.map((w) => { const d = dataOf<WarningData>(w); return [w.code, w.name, hrx.settings.violations.find((v) => v.id === d.violationId)?.name ?? "", d.level, ACTION_LABEL[d.action], d.days, d.amount ? d.amount / 100000 : "", w.date ?? "", w.status === "cancelled" ? "ملغي" : "ساري"]; })} />
        {rights.add ? <Button icon={<Plus />} onClick={() => setAdding(true)}>مخالفة جديدة</Button> : null}
      </>}>
        <MemberSelect hrx={hrx} label="الموظف" all="الكل" value={member} onChange={setMember} filter={() => true} />
        <Sel label="المخالفة" value={viol} onChange={setViol} options={[{ value: "", label: "الكل" }, ...hrx.settings.violations.map((v) => ({ value: v.id, label: v.name }))]} />
        <Input label="الشهر" type="month" dir="ltr" value={month} onChange={(e) => setMonth(e.target.value)} />
      </Toolbar>
      <Card>
        <CardHeader icon={<Gavel />} title="الإنذارات والجزاءات" />
        <Table rows={rows} rowKey={(w) => w.id} empty="مفيش مخالفات."
          columns={[
            { key: "n", header: "الموظف", cell: (w) => <Link to={`/hr/e/${w.memberId}`} className="font-semibold hover:underline">{w.name}</Link> },
            { key: "v", header: "المخالفة", cell: (w) => { const d = dataOf<WarningData>(w); return <span className="grid"><span>{hrx.settings.violations.find((v) => v.id === d.violationId)?.name ?? "—"} · المرة {d.level}</span><span className="text-[12px] text-muted">{d.incident}</span></span>; } },
            { key: "p", header: "الجزاء", cell: (w) => { const d = dataOf<WarningData>(w); return <span className="grid gap-0.5"><Badge size="sm" tone={w.status === "cancelled" ? "neutral" : d.action === "terminate" || d.action === "final" ? "danger" : "warn"}>{w.status === "cancelled" ? "ملغي" : ACTION_LABEL[d.action]}{d.days ? ` ${d.days} يوم` : ""}</Badge>{d.amount ? <span className="text-[12px] text-muted">{money(hrx, d.amount)} ج.م {d.pushedMoveId ? "· نزل على الراتب" : ""}</span> : null}</span>; } },
            { key: "k", header: "إقرار الموظف", hideOnMobile: true, cell: (w) => (acks.has(w.id) ? <Badge size="sm" tone="ok">استلم</Badge> : <span className="text-[12.5px] text-muted">لسه</span>) },
            { key: "d", header: "التاريخ", hideOnMobile: true, cell: (w) => dmy(w.date) },
            { key: "a", header: "", align: "end", cell: (w) => { const d = dataOf<WarningData>(w); return (
              <RowActions onDelete={d.pushedMoveId ? undefined : () => rm.ask(w)}>
                <IconButton label="طباعة الخطاب" size="sm" onClick={() => printWarning(hrx, w)}><Printer /></IconButton>
                {rights.edit && w.status !== "cancelled" && d.amount > 0 && !d.pushedMoveId ? <IconButton label="تنزيل الخصم على الراتب" size="sm" disabled={busy === w.id} onClick={() => act(w.id, () => pushDeduction(db, hrx, w, actor), "الخصم اتسجل في حركات الموظفين")}><Send /></IconButton> : null}
                {rights.edit && w.status !== "cancelled" ? <Button size="sm" variant="ghost" disabled={busy === w.id} onClick={() => act(w.id, () => cancelWarning(db, hrx, w, actor), "اتلغى")}>إلغاء</Button> : null}
              </RowActions>
            ); } },
          ]} />
      </Card>
      {adding ? <WarningDialog hrx={hrx} onClose={() => setAdding(false)} /> : null}
      {rm.node}
    </div>
  );
}

function WarningDialog({ hrx, onClose }: { hrx: Hrx; onClose: () => void }) {
  const db = useDb();
  const { toast } = useToast();
  const actor = useActor();
  const viols = activeOpts(hrx.settings.violations);
  const [v, setV] = useState({ memberId: "", violationId: viols[0]?.id ?? "", date: hrx.today, incident: "", text: "", custom: {} as Record<string, string>, override: "" as "" | WarningData["action"], days: "" });
  const [busy, setBusy] = useState(false);
  const viol = viols.find((x) => x.id === v.violationId);
  const past = hrx.by(K.warning).filter((w) => w.memberId === v.memberId).map((w) => ({ date: w.date, violationId: dataOf<WarningData>(w).violationId, status: w.status }));
  const next = viol && v.memberId ? nextPenalty(viol, past, v.date) : null;
  const action = v.override || next?.penalty.action || "written";
  const days = v.days !== "" ? Number(v.days) || 0 : next?.penalty.days ?? 0;
  const amount = days > 0 && v.memberId ? Math.round(dayWage(hrx.salaryOf(v.memberId), hrx.settings.monthDays) * days) : 0;
  const save = async () => {
    if (!v.memberId || !viol) return toast({ tone: "error", title: "اختر الموظف والمخالفة" });
    if (!v.incident.trim()) return toast({ tone: "error", title: "اكتب الواقعة" });
    const miss = missingCustom(hrx.settings.customFields.warning, v.custom);
    if (miss) return toast({ tone: "error", title: `اكتب ${miss}` });
    setBusy(true);
    try {
      const data: WarningData & { custom: Record<string, string> } = { violationId: viol.id, level: next?.level ?? 1, action, days, amount, incident: v.incident.trim(), text: v.text.trim(), by: hrx.staff?.name ?? "", pushedMoveId: null, month: v.date.slice(0, 7), custom: v.custom };
      const w = await saveDoc(db, null, { kind: K.warning, memberId: v.memberId, name: hrx.name(v.memberId), date: v.date, status: "active", data: data as unknown as Record<string, unknown> });
      let pushed = false;
      if (hrx.settings.pushDeductions && amount > 0 && hrx.fileOfMember(v.memberId).finEmployeeId) { await pushDeduction(db, hrx, w, actor); pushed = true; }
      toast({ tone: "success", title: "اتسجلت المخالفة", description: pushed ? "والخصم نزل على راتب الشهر" : amount > 0 ? "الخصم ما نزلش: الموظف مش مربوط بالرواتب أو التنزيل التلقائي متوقف" : undefined });
      onClose();
    } catch (e) { toast({ tone: "error", title: "تعذر الحفظ", description: err(e) }); } finally { setBusy(false); }
  };
  return (
    <Dialog open onClose={onClose} size="lg" title="مخالفة جديدة" footer={<div className="flex justify-end gap-2"><Button variant="ghost" onClick={onClose}>إلغاء</Button><Button loading={busy} onClick={save}>تسجيل</Button></div>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <MemberSelect hrx={hrx} value={v.memberId} onChange={(x) => setV({ ...v, memberId: x })} />
        <Sel label="المخالفة" value={v.violationId} onChange={(x) => setV({ ...v, violationId: x, override: "", days: "" })} options={viols.map((x) => ({ value: x.id, label: x.name }))} />
        <Input label="تاريخ المخالفة" type="date" dir="ltr" value={v.date} onChange={(e) => setV({ ...v, date: e.target.value })} />
        <div className="grid gap-1 rounded-xl border border-line p-2.5 text-[14px]">
          {next ? <><span>المرة رقم <b>{next.level}</b> {viol?.resetMonths ? `في آخر ${viol.resetMonths} شهور` : ""}</span><span>الجزاء حسب اللائحة: <b>{ACTION_LABEL[next.penalty.action]}{next.penalty.days ? ` ${next.penalty.days} يوم` : ""}</b></span></> : <span className="text-muted">اختر الموظف</span>}
        </div>
        <Sel label="الجزاء (تقدر تغيره)" value={action} onChange={(x) => setV({ ...v, override: x as WarningData["action"] })} options={Object.entries(ACTION_LABEL).map(([value, label]) => ({ value, label }))} />
        <Input label="أيام الخصم" dir="ltr" value={v.days !== "" ? v.days : String(days)} onChange={(e) => setV({ ...v, days: e.target.value })} hint={amount ? `= ${money(hrx, amount)} ج.م من يومية ${money(hrx, dayWage(hrx.salaryOf(v.memberId), hrx.settings.monthDays))}` : days ? "الراتب مش معروف: اربط الموظف بالرواتب أو سجل عقد" : undefined} />
        <div className="sm:col-span-2"><Input label="الواقعة *" value={v.incident} onChange={(e) => setV({ ...v, incident: e.target.value })} placeholder="مثلاً: اتأخر ساعة يوم 20" /></div>
        <div className="sm:col-span-2"><Textarea label="نص الخطاب" rows={3} value={v.text} onChange={(e) => setV({ ...v, text: e.target.value })} /></div>
        <CustomInputs fields={hrx.settings.customFields.warning} values={v.custom} onChange={(c) => setV({ ...v, custom: c })} />
      </div>
    </Dialog>
  );
}
