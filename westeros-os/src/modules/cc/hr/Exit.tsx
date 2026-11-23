/** نهاية الخدمة: استقالة أو فصل أو انتهاء عقد، حساب المستحقات (مكافأة، رصيد إجازات، أيام الشهر)، إخلاء الطرف، مقابلة الخروج، وإيقاف الموظف. */
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, LogOut, Plus, Printer } from "lucide-react";
import type { HrDoc } from "@/data/hrDocTypes";
import { useDb } from "@/data/hooks";
import { Badge, Button, Card, CardHeader, Dialog, IconButton, Input, Switch, Table, Textarea, useToast } from "@/ui";
import { useArea } from "../useAccess";
import { ExportButton } from "../ui";
import { esc, fromText, printDoc, toText } from "../finance/ui";
import { useActor } from "../finance/perms";
import { K, addDays, dataOf, dayWage, gratuityOf, leaveUsed, optName, serviceYears, type ExitData, type TaskState } from "./model";
import { finishExit, saveDoc } from "./ops";
import { TaskList } from "./Onboarding";
import { useHrx, type Hrx } from "./useHrx";
import { CustomInputs, dmy, err, MemberSelect, money, RowActions, Sel, useRemove } from "./ui";

const TYPE: Record<ExitData["type"], string> = { resignation: "استقالة", termination: "فصل", contract: "انتهاء العقد", other: "أخرى" };

export function settlement(hrx: Hrx, memberId: string, lastDay: string) {
  const hired = hrx.profileBy.get(memberId)?.hireDate ?? null;
  const years = serviceYears(hired, lastDay);
  const monthly = hrx.salaryOf(memberId);
  const wage = dayWage(monthly, hrx.settings.monthDays);
  const annual = hrx.settings.leaveTypes.find((l) => l.id === "annual") ?? hrx.settings.leaveTypes.find((l) => l.paid && l.days > 0);
  const used = annual ? leaveUsed(hrx.by(K.request), hrx.settings.requestTypes, memberId, lastDay.slice(0, 4)).get(annual.id) ?? 0 : 0;
  const monthFrac = (Number(lastDay.slice(5, 7)) - 1 + Number(lastDay.slice(8, 10)) / 30) / 12;
  const leaveDays = annual ? Math.max(0, Math.round((annual.days * monthFrac - used) * 10) / 10) : 0;
  const salaryDays = Number(lastDay.slice(8, 10)) || 0;
  return { years, monthly, wage, gratuity: gratuityOf(hrx.settings.gratuity, years, monthly), leaveDays, leavePay: Math.round(leaveDays * wage), salaryDays, salaryPay: Math.round(salaryDays * wage) };
}

export default function Exit() {
  const hrx = useHrx();
  const db = useDb();
  const { toast } = useToast();
  const actor = useActor();
  const rights = useArea();
  const rm = useRemove();
  const [open, setOpen] = useState<HrDoc | "new" | null>(null);
  const [finish, setFinish] = useState<HrDoc | null>(null);
  const [busy, setBusy] = useState(false);
  const rows = useMemo(() => hrx.by(K.exit).filter((d) => hrx.visible.some((m) => m.id === d.memberId)).sort((a, b) => (b.date ?? "").localeCompare(a.date ?? "")), [hrx]);
  const print = (d: HrDoc) => {
    const x = dataOf<ExitData>(d);
    printDoc(`مخالصة ${d.name}`, `<h1>مخالصة نهاية خدمة</h1><div class="row"><span>الموظف: <b>${esc(d.name)}</b></span><span>آخر يوم عمل: ${dmy(x.lastDay)}</span></div>
      <div class="box"><div class="row"><span class="lbl">السبب</span><span>${esc(TYPE[x.type])} · ${esc(optName(hrx.settings.exitReasons, x.reasonId))}</span></div>
      <div class="row"><span class="lbl">مكافأة نهاية الخدمة</span><span>${money(hrx, x.gratuity)}</span></div><div class="row"><span class="lbl">رصيد الإجازات (${x.leaveDays} يوم)</span><span>${money(hrx, x.leavePay)}</span></div>
      <div class="row"><span class="lbl">أيام الشهر الأخير (${x.salaryDays} يوم)</span><span>${money(hrx, x.salaryPay)}</span></div><div class="row"><span class="lbl">مستحقات أخرى</span><span>${money(hrx, x.other)}</span></div>
      <div class="row"><span class="lbl">خصومات</span><span>${money(hrx, x.deductions)}</span></div><div class="row"><b>الإجمالي</b><b>${money(hrx, x.total)} ج.م</b></div></div>
      <p>أقر أنا الموقع أدناه باستلام كافة مستحقاتي، ولا يحق لي المطالبة بأي مبالغ أخرى.</p><div class="sign"><span>توقيع الموظف</span><span>الإدارة</span></div>`);
  };
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap justify-end gap-2">
        <ExportButton file="نهاية الخدمة" head={["الموظف", "النوع", "السبب", "تاريخ الإخطار", "آخر يوم", "المستحقات", "يرجع؟", "الحالة"]} rows={() => rows.map((d) => { const x = dataOf<ExitData>(d); return [d.name, TYPE[x.type], optName(hrx.settings.exitReasons, x.reasonId), x.noticeDate, x.lastDay, x.total / 100000, x.rehire ? "نعم" : "لا", d.status === "done" ? "انتهت" : "جاري"]; })} />
        {rights.add ? <Button icon={<Plus />} onClick={() => setOpen("new")}>إنهاء خدمة موظف</Button> : null}
      </div>
      <Card>
        <CardHeader icon={<LogOut />} title="نهاية الخدمة" />
        <Table rows={rows} rowKey={(d) => d.id} onRowClick={rights.edit ? setOpen : undefined} empty="مفيش."
          columns={[
            { key: "n", header: "الموظف", cell: (d) => <Link to={`/hr/e/${d.memberId}`} onClick={(e) => e.stopPropagation()} className="font-semibold hover:underline">{d.name}</Link> },
            { key: "t", header: "النوع والسبب", cell: (d) => { const x = dataOf<ExitData>(d); return `${TYPE[x.type]} · ${optName(hrx.settings.exitReasons, x.reasonId)}`; } },
            { key: "l", header: "آخر يوم", cell: (d) => dmy(dataOf<ExitData>(d).lastDay) },
            { key: "c", header: "إخلاء الطرف", hideOnMobile: true, cell: (d) => { const c = dataOf<ExitData>(d).clearance; return `${c.filter((x) => x.done).length}/${c.length}`; } },
            { key: "m", header: "المستحقات", align: "end", cell: (d) => money(hrx, dataOf<ExitData>(d).total) },
            { key: "s", header: "الحالة", cell: (d) => <Badge size="sm" tone={d.status === "done" ? "neutral" : "warn"}>{d.status === "done" ? "انتهت" : "جاري"}</Badge> },
            { key: "a", header: "", align: "end", cell: (d) => <RowActions onDelete={d.status === "done" ? undefined : () => rm.ask(d)}><IconButton label="طباعة المخالصة" size="sm" onClick={(e) => { e.stopPropagation(); print(d); }}><Printer /></IconButton>{rights.edit && d.status !== "done" ? <Button size="sm" variant="outline" icon={<CheckCircle2 />} onClick={(e) => { e.stopPropagation(); setFinish(d); }}>إنهاء</Button> : null}</RowActions> },
          ]} />
      </Card>
      {open ? <ExitDialog hrx={hrx} row={open === "new" ? null : open} onClose={() => setOpen(null)} /> : null}
      {finish ? (
        <Dialog open onClose={() => setFinish(null)} size="sm" title={`إنهاء خدمة ${finish.name}`} footer={<div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => setFinish(null)}>رجوع</Button><Button variant="danger" loading={busy} onClick={async () => { setBusy(true); try { await finishExit(db, hrx, finish, actor); toast({ tone: "success", title: "انتهت خدمة الموظف" }); setFinish(null); } catch (e) { toast({ tone: "error", title: "تعذر", description: err(e) }); } finally { setBusy(false); } }}>إنهاء الخدمة</Button></div>}>
          <ul className="grid list-disc gap-1 ps-5 text-[14px]">
            <li>الموظف هيتوقف ومش هيقدر يدخل السيستم.</li>
            <li>هيتوقف في الرواتب ومش هيدخل الكشوف الجديدة.</li>
            <li>المستحقات (المكافأة والإجازات والأخرى ناقص الخصومات) هتتسجل حافز في كشف شهر آخر يوم. أيام الشهر نفسه بتتحسب في الكشف العادي.</li>
            {dataOf<ExitData>(finish).clearance.some((t) => !t.done) ? <li className="font-semibold text-warn">لسه في مهام إخلاء طرف ما خلصتش.</li> : null}
          </ul>
        </Dialog>
      ) : null}
      {rm.node}
    </div>
  );
}

function ExitDialog({ hrx, row, onClose }: { hrx: Hrx; row: HrDoc | null; onClose: () => void }) {
  const db = useDb();
  const { toast } = useToast();
  const rights = useArea();
  const x = row ? dataOf<ExitData>(row) : null;
  const [v, setV] = useState({ memberId: row?.memberId ?? "", type: x?.type ?? "resignation", reasonId: x?.reasonId ?? hrx.settings.exitReasons[0]?.id ?? "", noticeDate: x?.noticeDate ?? hrx.today, lastDay: x?.lastDay ?? addDays(hrx.today, hrx.settings.noticeDays), answers: x?.answers ?? {}, rehire: x?.rehire ?? true, note: x?.note ?? "", other: toText(x?.other), deductions: toText(x?.deductions), gratuity: x ? toText(x.gratuity) : "", leaveDays: x ? String(x.leaveDays) : "", custom: ((row?.data as { custom?: Record<string, string> })?.custom ?? {}) as Record<string, string> });
  const [busy, setBusy] = useState(false);
  const calc = v.memberId ? settlement(hrx, v.memberId, v.lastDay) : null;
  const gratuity = v.gratuity !== "" ? fromText(v.gratuity) : calc?.gratuity ?? 0;
  const leaveDays = v.leaveDays !== "" ? Number(v.leaveDays) || 0 : calc?.leaveDays ?? 0;
  const leavePay = Math.round(leaveDays * (calc?.wage ?? 0));
  const salaryPay = calc?.salaryPay ?? 0;
  const total = gratuity + leavePay + salaryPay + fromText(v.other) - fromText(v.deductions);
  const save = async () => {
    if (!v.memberId) return toast({ tone: "error", title: "اختر الموظف" });
    if (v.lastDay < v.noticeDate) return toast({ tone: "error", title: "آخر يوم قبل تاريخ الإخطار" });
    setBusy(true);
    try {
      const clearance: TaskState[] = x?.clearance ?? hrx.settings.clearance.map((t) => ({ ...t, done: false, by: "", at: null, note: "" }));
      const data: ExitData & { custom: Record<string, string>; tasks: TaskState[] } = { type: v.type as ExitData["type"], reasonId: v.reasonId, noticeDate: v.noticeDate, lastDay: v.lastDay, clearance, tasks: clearance, answers: v.answers, rehire: v.rehire, gratuity, leaveDays, leavePay, salaryDays: calc?.salaryDays ?? 0, salaryPay, other: fromText(v.other), deductions: fromText(v.deductions), total, note: v.note, by: x?.by ?? hrx.staff?.name ?? "", pushedMoveId: x?.pushedMoveId ?? null, done: false, custom: v.custom };
      await saveDoc(db, row, { kind: K.exit, memberId: v.memberId, name: hrx.name(v.memberId), date: v.noticeDate, status: row?.status ?? "open", data: data as unknown as Record<string, unknown> });
      if (!row) { const { saveFile } = await import("./ops"); await saveFile(db, hrx, v.memberId, { empStatus: "notice" }); }
      toast({ tone: "success", title: "تم الحفظ" }); onClose();
    } catch (e) { toast({ tone: "error", title: "تعذر الحفظ", description: err(e) }); } finally { setBusy(false); }
  };
  return (
    <Dialog open onClose={onClose} size="xl" title={row ? `نهاية خدمة ${row.name}` : "إنهاء خدمة موظف"} footer={<div className="flex items-center justify-between gap-2"><b>الإجمالي {money(hrx, total)} ج.م</b><div className="flex gap-2"><Button variant="ghost" onClick={onClose}>إلغاء</Button>{row?.status === "done" ? null : <Button loading={busy} onClick={save}>حفظ</Button>}</div></div>}>
      <div className="grid gap-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <MemberSelect hrx={hrx} value={v.memberId} onChange={(id) => setV({ ...v, memberId: id })} disabled={!!row} />
          <Sel label="النوع" value={v.type} onChange={(t) => setV({ ...v, type: t as ExitData["type"] })} options={Object.entries(TYPE).map(([value, label]) => ({ value, label }))} />
          <Sel label="السبب" value={v.reasonId} onChange={(r) => setV({ ...v, reasonId: r })} options={hrx.settings.exitReasons.map((r) => ({ value: r.id, label: r.name }))} />
          <Input label="تاريخ الإخطار" type="date" dir="ltr" value={v.noticeDate} onChange={(e) => setV({ ...v, noticeDate: e.target.value })} />
          <Input label="آخر يوم عمل" type="date" dir="ltr" value={v.lastDay} onChange={(e) => setV({ ...v, lastDay: e.target.value })} hint={`فترة الإخطار ${hrx.settings.noticeDays} يوم`} />
          <Switch checked={v.rehire} onChange={(r) => setV({ ...v, rehire: r })} label="ينفع يرجع يشتغل تاني" />
        </div>
        <div className="grid gap-3 rounded-2xl border border-line p-3 sm:grid-cols-3">
          <p className="text-[13.5px] text-muted sm:col-span-3">{calc ? `مدة الخدمة ${calc.years.toFixed(2)} سنة · الراتب ${money(hrx, calc.monthly)} · اليومية ${money(hrx, calc.wage)}${calc.monthly ? "" : " (الراتب مش معروف: اربط الموظف بالرواتب أو سجل عقد)"}` : "اختر الموظف"}</p>
          <Input label="مكافأة نهاية الخدمة" dir="ltr" value={v.gratuity !== "" ? v.gratuity : toText(calc?.gratuity)} onChange={(e) => setV({ ...v, gratuity: e.target.value })} hint="محسوبة من شرائح الإعدادات، وتقدر تعدلها" />
          <Input label="أيام رصيد الإجازات" dir="ltr" value={v.leaveDays !== "" ? v.leaveDays : String(calc?.leaveDays ?? 0)} onChange={(e) => setV({ ...v, leaveDays: e.target.value })} hint={`= ${money(hrx, leavePay)}`} />
          <Input label={`أيام الشهر الأخير (${calc?.salaryDays ?? 0} يوم)`} disabled value={money(hrx, salaryPay)} hint="بتتصرف في كشف الشهر العادي" />
          <Input label="مستحقات أخرى" dir="ltr" value={v.other} onChange={(e) => setV({ ...v, other: e.target.value })} />
          <Input label="خصومات (عهدة، سلف...)" dir="ltr" value={v.deductions} onChange={(e) => setV({ ...v, deductions: e.target.value })} />
        </div>
        {row ? <div className="grid gap-2"><span className="font-bold">إخلاء الطرف</span><TaskList hrx={hrx} row={row} tasks={dataOf<ExitData>(row).clearance} start={dataOf<ExitData>(row).lastDay} readOnly={!rights.edit || row.status === "done"} kind={K.exit} /></div> : <p className="text-[13px] text-muted">مهام إخلاء الطرف بتظهر بعد الحفظ.</p>}
        <div className="grid gap-2">
          <span className="font-bold">مقابلة الخروج</span>
          {hrx.settings.exitQuestions.filter((q) => q.active !== false).map((q) => <Textarea key={q.id} label={q.name} rows={2} value={v.answers[q.id] ?? ""} onChange={(e) => setV({ ...v, answers: { ...v.answers, [q.id]: e.target.value } })} />)}
        </div>
        <Textarea label="ملاحظات" rows={2} value={v.note} onChange={(e) => setV({ ...v, note: e.target.value })} />
        <div className="grid gap-3 sm:grid-cols-2"><CustomInputs fields={hrx.settings.customFields.exit} values={v.custom} onChange={(c) => setV({ ...v, custom: c })} /></div>
      </div>
    </Dialog>
  );
}
