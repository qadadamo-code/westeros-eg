/** ملف الموظف: البيانات، الوظيفة والقسم والمدير، الراتب وربطه بالرواتب، المستندات، وكل سجله في الموارد البشرية. */
import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowRight, FileText, Plus, Save, StickyNote, Trash2, Wallet } from "lucide-react";
import { useDb } from "@/data/hooks";
import type { StaffDocument } from "@/data/types";
import { Avatar, Badge, Button, Card, CardHeader, Dialog, EmptyState, IconButton, Input, Segmented, Textarea, useToast } from "@/ui";
import { useArea } from "../useAccess";
import { ImageField } from "../ui";
import { employeeOf } from "../finance/payroll";
import { ACTION_LABEL, EMP_STATUS, K, dataOf, evalBand, serviceYears, spanDays, type ContractData, type EvaluationData, type FileData, type GradeData, type ProgressData, type RequestData, type WarningData, newId } from "./model";
import { linkFinEmployee, saveDoc, saveFile } from "./ops";
import { missingDocs } from "./Employees";
import { useHrx, type Hrx } from "./useHrx";
import { CustomInputs, dmy, err, money, Sel, useRemove } from "./ui";

type Tab = "info" | "pay" | "docs" | "record";

export default function EmployeeFile() {
  const { memberId = "" } = useParams();
  const hrx = useHrx();
  const [tab, setTab] = useState<Tab>("info");
  const m = hrx.memberById.get(memberId);
  if (!m || !hrx.visible.some((x) => x.id === memberId)) return <Card><EmptyState title="الموظف مش موجود" action={<Link to="/hr/employees" className="underline">رجوع للموظفين</Link>} /></Card>;
  const f = hrx.fileOfMember(m.id);
  const p = hrx.profileBy.get(m.id);
  const st = EMP_STATUS[m.active ? f.empStatus : "ended"];
  const miss = missingDocs(hrx, m.id);
  return (
    <div className="grid gap-4">
      <Link to="/hr/employees" className="inline-flex items-center gap-1 text-[13.5px] text-muted hover:text-ink"><ArrowRight className="size-4" />الموظفين</Link>
      <Card className="flex flex-wrap items-center gap-4 p-4">
        {p?.photoUrl ? <img src={p.photoUrl} alt="" className="size-16 rounded-2xl object-cover" /> : <Avatar name={m.name} size="lg" />}
        <div className="grid min-w-0 flex-1 gap-1">
          <div className="flex flex-wrap items-center gap-2"><h2 className="text-[20px] font-bold">{m.name}</h2><Badge tone={st.tone}>{st.label}</Badge>{f.employeeNo ? <Badge size="sm">رقم {f.employeeNo}</Badge> : null}</div>
          <p className="text-[14px] text-muted">{[hrx.jobOf(m.id)?.name ?? p?.position.ar, hrx.deptOf(m.id)?.name, hrx.workplace(m)].filter(Boolean).join(" · ")}</p>
          <p className="text-[13px] text-muted">{p?.hireDate ? `اتعين ${dmy(p.hireDate)} · ${serviceYears(p.hireDate, hrx.today).toFixed(1)} سنة خدمة` : ""}{f.managerId ? ` · المدير المباشر: ${hrx.name(f.managerId)}` : ""}</p>
        </div>
        {miss.length && m.active ? <Badge tone="warn">ناقص: {miss.join("، ")}</Badge> : null}
      </Card>
      <Segmented label="ملف الموظف" value={tab} onChange={setTab} options={[{ value: "info", label: "البيانات" }, { value: "pay", label: "الراتب" }, { value: "docs", label: "المستندات" }, { value: "record", label: "السجل" }]} />
      {tab === "info" ? <Info key={m.id + (hrx.fileRows.get(m.id)?.updatedAt ?? "")} hrx={hrx} memberId={m.id} /> : tab === "pay" ? <Pay hrx={hrx} memberId={m.id} /> : tab === "docs" ? <Docs hrx={hrx} memberId={m.id} /> : <Record hrx={hrx} memberId={m.id} />}
    </div>
  );
}

function Info({ hrx, memberId }: { hrx: Hrx; memberId: string }) {
  const db = useDb();
  const { toast } = useToast();
  const edit = useArea().edit;
  const canJob = hrx.may("hr.jobs") || hrx.staff?.role === "owner";
  const p = hrx.profileBy.get(memberId);
  const [f, setF] = useState<FileData>(hrx.fileOfMember(memberId));
  const [card, setCard] = useState({ nationalId: p?.nationalId ?? "", birthDate: p?.birthDate ?? "", hireDate: p?.hireDate ?? "", address: p?.address ?? "", deviceUserId: p?.deviceUserId ?? "", emName: p?.emergencyContact?.name ?? "", emPhone: p?.emergencyContact?.phone ?? "", emRelation: p?.emergencyContact?.relation ?? "", photoUrl: p?.photoUrl ?? null as string | null });
  const [busy, setBusy] = useState(false);
  const set = (x: Partial<FileData>) => setF({ ...f, ...x });
  const job = hrx.jobs.find((j) => j.id === f.jobId);
  const save = async () => {
    setBusy(true);
    try {
      const r = await saveFile(db, hrx, memberId, f);
      const c = { nationalId: card.nationalId.trim() || null, birthDate: card.birthDate || null, address: card.address.trim() || null, deviceUserId: card.deviceUserId.trim() || null, photoUrl: card.photoUrl, emergencyContact: card.emName.trim() || card.emPhone.trim() ? { name: card.emName.trim(), phone: card.emPhone.trim(), relation: card.emRelation.trim() } : null, ...(job ? { position: { ar: job.name, en: p?.position.en ?? "" } } : {}) };
      if (p) await db.update("staffProfiles", p.id, { ...c, ...(card.hireDate ? { hireDate: card.hireDate } : {}) });
      else await db.insert("staffProfiles", { ...c, membershipId: memberId, hireDate: card.hireDate || hrx.today, contractType: "permanent", position: { ar: job?.name ?? "", en: "" }, nationality: "EG", contractEnd: null, station: null, foodHandler: true, documents: [], weeklyOff: [5], terminatedAt: null, terminationReason: null, notes: "" } as never);
      toast({ tone: "success", title: "تم الحفظ", description: r.roleChanged ? `الموظف خد صلاحيات دور "${hrx.roleName(job ? hrx.jobData(job).roleId : null)}"` : undefined });
    } catch (e) { toast({ tone: "error", title: "تعذر الحفظ", description: err(e) }); } finally { setBusy(false); }
  };
  const t = (k: keyof FileData, label: string, ltr?: boolean) => <Input label={label} disabled={!edit} dir={ltr ? "ltr" : undefined} value={String(f[k] ?? "")} onChange={(e) => set({ [k]: e.target.value } as Partial<FileData>)} />;
  const c = (k: keyof typeof card, label: string, type?: string) => <Input label={label} disabled={!edit} type={type} dir={type === "date" || k.endsWith("Phone") || k === "nationalId" || k === "deviceUserId" ? "ltr" : undefined} value={String(card[k] ?? "")} onChange={(e) => setCard({ ...card, [k]: e.target.value })} />;
  return (
    <Card>
      <CardHeader title="بيانات الموظف" action={edit ? <Button size="sm" icon={<Save />} loading={busy} onClick={save}>حفظ</Button> : null} />
      <div className="grid gap-3 px-5 pb-5 sm:grid-cols-2 lg:grid-cols-3">
        <Sel label="القسم" disabled={!edit} value={f.departmentId ?? ""} onChange={(x) => set({ departmentId: x || null })} options={[{ value: "", label: "—" }, ...hrx.departments.map((d) => ({ value: d.id, label: d.name }))]} />
        <Sel label="الوظيفة" disabled={!edit || !canJob} hint={!canJob ? "تغيير الوظيفة محتاج صلاحية" : job && hrx.settings.jobSetsRole && hrx.jobData(job).roleId ? `الصلاحيات: ${hrx.roleName(hrx.jobData(job).roleId)}` : undefined} value={f.jobId ?? ""} onChange={(x) => { const j = hrx.jobs.find((y) => y.id === x); set({ jobId: x || null, ...(j && !f.departmentId ? { departmentId: hrx.jobData(j).departmentId } : {}), ...(j && hrx.jobData(j).gradeId ? { gradeId: hrx.jobData(j).gradeId } : {}) }); }} options={[{ value: "", label: "—" }, ...hrx.jobs.map((j) => ({ value: j.id, label: j.name }))]} />
        <Sel label="المدير المباشر" disabled={!edit} value={f.managerId ?? ""} onChange={(x) => set({ managerId: x || null })} options={[{ value: "", label: "—" }, ...hrx.members.filter((x) => x.active && x.id !== memberId).map((x) => ({ value: x.id, label: x.name }))]} />
        <Sel label="الدرجة" disabled={!edit} value={f.gradeId ?? ""} onChange={(x) => set({ gradeId: x || null })} options={[{ value: "", label: "—" }, ...hrx.grades.map((g) => ({ value: g.id, label: g.name }))]} />
        <Sel label="حالة الموظف" disabled={!edit} value={f.empStatus} onChange={(x) => set({ empStatus: x as FileData["empStatus"] })} options={Object.entries(EMP_STATUS).filter(([k]) => k !== "ended").map(([value, s]) => ({ value, label: s.label }))} />
        {t("employeeNo", "رقم الموظف", true)}
        <Input label="نهاية فترة التجربة" type="date" dir="ltr" disabled={!edit} value={f.probationEnd ?? ""} onChange={(e) => set({ probationEnd: e.target.value || null })} />
        {c("hireDate", "تاريخ التعيين", "date")}
        {c("birthDate", "تاريخ الميلاد", "date")}
        {c("nationalId", "الرقم القومي")}
        {t("phone", "تليفون إضافي", true)}
        {t("email", "الإيميل", true)}
        {c("address", "العنوان")}
        <Sel label="الحالة الاجتماعية" disabled={!edit} value={f.maritalStatus} onChange={(x) => set({ maritalStatus: x })} options={[{ value: "", label: "—" }, ...["أعزب", "متزوج", "مطلق", "أرمل"].map((x) => ({ value: x, label: x }))]} />
        <Input label="عدد الأولاد" disabled={!edit} dir="ltr" value={String(f.children || "")} onChange={(e) => set({ children: Number(e.target.value) || 0 })} />
        {t("education", "المؤهل الدراسي")}
        {c("deviceUserId", "رقم البصمة على الجهاز")}
        {t("bank", "البنك أو المحفظة")}
        {t("iban", "رقم الحساب أو المحفظة", true)}
        {c("emName", "شخص للطوارئ")}
        {c("emPhone", "تليفون الطوارئ")}
        {c("emRelation", "صلة القرابة")}
        <div className="sm:col-span-2 lg:col-span-3"><Textarea label="المهارات" rows={2} disabled={!edit} value={f.skills} onChange={(e) => set({ skills: e.target.value })} /></div>
        <CustomInputs fields={hrx.settings.customFields.file} values={f.custom ?? {}} onChange={(x) => set({ custom: x })} />
        {edit ? <div className="sm:col-span-2 lg:col-span-3"><ImageField value={card.photoUrl} onChange={(x) => setCard({ ...card, photoUrl: x })} /></div> : null}
      </div>
    </Card>
  );
}

function Pay({ hrx, memberId }: { hrx: Hrx; memberId: string }) {
  const db = useDb();
  const { toast } = useToast();
  const edit = useArea().edit;
  const seeSalary = hrx.may("hr.salary") || hrx.staff?.role === "owner";
  const f = hrx.fileOfMember(memberId);
  const fin = f.finEmployeeId ? hrx.finById.get(f.finEmployeeId) : null;
  const [pick, setPick] = useState("");
  const [busy, setBusy] = useState(false);
  const salary = hrx.salaryOf(memberId);
  const grade = hrx.grades.find((g) => g.id === f.gradeId);
  const gd = grade ? dataOf<GradeData>(grade) : null;
  const outOfGrade = gd && salary && ((gd.min && salary < gd.min) || (gd.max && salary > gd.max));
  const linked = new Set([...hrx.fileRows.values()].map((r) => (r.data as { finEmployeeId?: string }).finEmployeeId).filter(Boolean) as string[]);
  const free = hrx.finDocs.filter((d) => !linked.has(d.id));
  const link = async (id: string) => { setBusy(true); try { await linkFinEmployee(db, hrx, memberId, id as "new"); toast({ tone: "success", title: "تم الربط" }); } catch (e) { toast({ tone: "error", title: "تعذر الربط", description: err(e) }); } finally { setBusy(false); } };
  const slips = hrx.by(K.payslip).filter((d) => d.memberId === memberId).sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader icon={<Wallet />} title="الراتب" subtitle="الراتب والسلف والعهد والخصومات بتتسجل في الحسابات ← الموظفين. الموظف هنا بيتربط بموظف الرواتب عشان الجزاءات ومستحقات نهاية الخدمة تنزل على راتبه." />
        <div className="grid gap-3 px-5 pb-5">
          {fin ? (
            <div className="grid gap-1 rounded-xl border border-line p-3">
              <p className="font-semibold">مربوط بموظف الرواتب: {fin.name} <Badge size="sm" tone={fin.status === "active" ? "ok" : "neutral"}>{fin.status === "active" ? "في الكشوف" : "موقوف"}</Badge></p>
              {seeSalary ? <p className="text-[14px]">الأساسي {money(hrx, employeeOf(fin).salary)} · البدلات {money(hrx, employeeOf(fin).allowances)} · التأمينات {money(hrx, employeeOf(fin).insEmployee)} · الضريبة {money(hrx, employeeOf(fin).tax)}</p> : <p className="text-[13px] text-muted">الأرقام مخفية: محتاج صلاحية رؤية الرواتب.</p>}
              <div className="flex flex-wrap gap-2 pt-1"><Link to="/finance/payroll" className="text-[13.5px] underline">تعديل الراتب من الحسابات</Link>{edit ? <button className="text-[13.5px] text-muted underline" onClick={() => link("")}>فك الربط</button> : null}</div>
            </div>
          ) : edit ? (
            <div className="flex flex-wrap items-end gap-2">
              <Sel label="ربط بموظف في الرواتب" className="min-w-60" value={pick} onChange={setPick} options={[{ value: "", label: "اختر" }, ...free.map((d) => ({ value: d.id, label: d.name })), { value: "new", label: "+ موظف رواتب جديد بنفس البيانات" }]} />
              <Button loading={busy} disabled={!pick} onClick={() => link(pick)}>ربط</Button>
            </div>
          ) : <p className="text-[14px] text-muted">مش مربوط بموظف في الرواتب.</p>}
          {seeSalary && salary ? <p className="text-[14px]">الراتب الشهري: <b>{money(hrx, salary)}</b>{grade ? ` · الدرجة ${grade.name} (${money(hrx, gd!.min)} إلى ${money(hrx, gd!.max)})` : ""}</p> : null}
          {outOfGrade && seeSalary ? <Badge tone="warn">الراتب برة حدود الدرجة</Badge> : null}
        </div>
      </Card>
      <Card>
        <CardHeader title="قسائم الراتب المنشورة" subtitle="الموظف بيشوفها على صفحته. بتتنشر من الموارد البشرية ← قسائم الرواتب." />
        <ul className="grid gap-2 px-5 pb-5">
          {slips.map((s) => <li key={s.id} className="flex justify-between rounded-xl border border-line px-3 py-2 text-[14px]"><span>شهر {(s.data as { month?: string }).month}</span><b>{money(hrx, Number((s.data as { net?: number }).net ?? 0))}</b></li>)}
          {slips.length ? null : <li className="text-[13.5px] text-muted">مفيش قسائم.</li>}
        </ul>
      </Card>
    </div>
  );
}

function Docs({ hrx, memberId }: { hrx: Hrx; memberId: string }) {
  const db = useDb();
  const { toast } = useToast();
  const r = useArea();
  const p = hrx.profileBy.get(memberId);
  const [edit, setEdit] = useState<StaffDocument | null>(null);
  const docs = p?.documents ?? [];
  const typeName = (k: string) => hrx.settings.docTypes.find((t) => t.id === k)?.name ?? k;
  const put = async (list: StaffDocument[]) => {
    try { if (p) await db.update("staffProfiles", p.id, { documents: list }); else throw new Error("احفظ بيانات الموظف الأول"); toast({ tone: "success", title: "تم الحفظ" }); setEdit(null); }
    catch (e) { toast({ tone: "error", title: "تعذر الحفظ", description: err(e) }); }
  };
  return (
    <Card>
      <CardHeader icon={<FileText />} title="المستندات" subtitle={`تنبيه قبل الانتهاء بـ ${hrx.settings.alertDays} يوم`} action={r.edit ? <Button size="sm" icon={<Plus />} onClick={() => setEdit({ id: newId(), kind: (hrx.settings.docTypes[0]?.id ?? "other") as StaffDocument["kind"], number: "", issuedAt: null, expiresAt: null, fileUrl: null, note: "" })}>مستند</Button> : null} />
      <ul className="grid gap-2 px-5 pb-5">
        {docs.map((d) => {
          const left = d.expiresAt ? Math.round((Date.parse(d.expiresAt) - Date.parse(hrx.today)) / 86400000) : null;
          return (
            <li key={d.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-line p-3">
              {d.fileUrl ? <a href={d.fileUrl} target="_blank" rel="noreferrer"><img src={d.fileUrl} alt="" className="size-12 rounded-lg object-cover" /></a> : <FileText className="size-6 text-muted" />}
              <div className="grid flex-1"><span className="font-semibold">{typeName(d.kind)}</span><span className="text-[13px] text-muted">{[d.number, d.expiresAt ? `ينتهي ${dmy(d.expiresAt)}` : "", d.note].filter(Boolean).join(" · ")}</span></div>
              {left != null ? <Badge size="sm" tone={left < 0 ? "danger" : left <= hrx.settings.alertDays ? "warn" : "ok"}>{left < 0 ? "منتهي" : `باقي ${left} يوم`}</Badge> : null}
              {r.edit ? <Button size="sm" variant="ghost" onClick={() => setEdit(d)}>تعديل</Button> : null}
              {r.delete ? <IconButton label="حذف" size="sm" onClick={() => put(docs.filter((x) => x.id !== d.id))}><Trash2 /></IconButton> : null}
            </li>
          );
        })}
        {docs.length ? null : <li className="text-[13.5px] text-muted">مفيش مستندات متسجلة.</li>}
      </ul>
      {edit ? (
        <Dialog open onClose={() => setEdit(null)} title="مستند" footer={<div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => setEdit(null)}>إلغاء</Button><Button onClick={() => put(docs.some((x) => x.id === edit.id) ? docs.map((x) => (x.id === edit.id ? edit : x)) : [...docs, edit])}>حفظ</Button></div>}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Sel label="نوع المستند" value={edit.kind} onChange={(x) => setEdit({ ...edit, kind: x as StaffDocument["kind"] })} options={hrx.settings.docTypes.map((t) => ({ value: t.id, label: t.name }))} />
            <Input label="الرقم" dir="ltr" value={edit.number} onChange={(e) => setEdit({ ...edit, number: e.target.value })} />
            <Input label="تاريخ الإصدار" type="date" dir="ltr" value={edit.issuedAt ?? ""} onChange={(e) => setEdit({ ...edit, issuedAt: e.target.value || null })} />
            <Input label="تاريخ الانتهاء" type="date" dir="ltr" value={edit.expiresAt ?? ""} onChange={(e) => setEdit({ ...edit, expiresAt: e.target.value || null })} />
            <div className="sm:col-span-2"><Input label="ملاحظات" value={edit.note} onChange={(e) => setEdit({ ...edit, note: e.target.value })} /></div>
            <div className="sm:col-span-2"><ImageField value={edit.fileUrl} onChange={(x) => setEdit({ ...edit, fileUrl: x })} /></div>
          </div>
        </Dialog>
      ) : null}
    </Card>
  );
}

function Record({ hrx, memberId }: { hrx: Hrx; memberId: string }) {
  const db = useDb();
  const { toast } = useToast();
  const r = useArea();
  const rm = useRemove();
  const [note, setNote] = useState("");
  const mine = useMemo(() => hrx.docs.filter((d) => d.memberId === memberId), [hrx.docs, memberId]);
  const of = (k: string) => mine.filter((d) => d.kind === k).sort((a, b) => (b.date ?? b.createdAt).localeCompare(a.date ?? a.createdAt));
  const block = (title: string, to: string, rows: { id: string; text: string; sub?: string; tone?: "ok" | "warn" | "danger" | "info" | "neutral"; badge?: string }[]) => (
    <Card>
      <CardHeader title={title} action={<Link to={to} className="text-[13px] underline">فتح</Link>} />
      <ul className="grid gap-1.5 px-5 pb-4">
        {rows.map((x) => <li key={x.id} className="flex flex-wrap items-center gap-2 text-[14px]"><span className="flex-1">{x.text}{x.sub ? <span className="text-muted"> · {x.sub}</span> : null}</span>{x.badge ? <Badge size="sm" tone={x.tone ?? "neutral"}>{x.badge}</Badge> : null}</li>)}
        {rows.length ? null : <li className="text-[13px] text-muted">لا شيء.</li>}
      </ul>
    </Card>
  );
  const leaveTypes = hrx.settings.requestTypes;
  return (
    <div className="grid items-start gap-4 lg:grid-cols-2">
      {block("العقود", "/hr/contracts", of(K.contract).map((d) => { const c = dataOf<ContractData>(d); return { id: d.id, text: hrx.settings.contractTypes.find((t) => t.id === c.typeId)?.name ?? "عقد", sub: `${dmy(c.start)} إلى ${c.end ? dmy(c.end) : "مفتوح"}`, badge: d.status === "active" ? "ساري" : d.status === "renewed" ? "اتجدد" : "منتهي", tone: d.status === "active" ? "ok" : "neutral" }; }))}
      {block("الطلبات", "/hr/requests", of(K.request).map((d) => { const x = dataOf<RequestData>(d); return { id: d.id, text: leaveTypes.find((t) => t.id === x.typeId)?.name ?? d.name, sub: x.from ? `${dmy(x.from)}${x.to && x.to !== x.from ? ` إلى ${dmy(x.to)} (${spanDays(x.from, x.to)} يوم)` : ""}` : dmy(d.date), badge: d.status === "approved" ? "معتمد" : d.status === "rejected" ? "مرفوض" : d.status === "cancelled" ? "ملغي" : "مستني", tone: d.status === "approved" ? "ok" : d.status === "rejected" ? "danger" : "warn" }; }))}
      {block("التقييمات", "/hr/evaluations", of(K.evaluation).map((d) => { const x = dataOf<EvaluationData>(d); const b = evalBand(x.total); return { id: d.id, text: `تقييم ${x.period}`, sub: x.by, badge: `${x.total}% ${b.label}`, tone: b.tone === "brass" ? "info" : b.tone }; }))}
      {block("الإنذارات والجزاءات", "/hr/discipline", of(K.warning).map((d) => { const x = dataOf<WarningData>(d); return { id: d.id, text: hrx.settings.violations.find((v) => v.id === x.violationId)?.name ?? d.name, sub: `${dmy(d.date)} · المرة ${x.level}`, badge: d.status === "cancelled" ? "ملغي" : ACTION_LABEL[x.action], tone: d.status === "cancelled" ? "neutral" : "danger" }; }))}
      {block("التدريب", "/hr/training", of(K.progress).map((d) => { const x = dataOf<ProgressData>(d); return { id: d.id, text: hrx.by(K.course).find((c) => c.id === x.courseId)?.name ?? "دورة", sub: x.completedAt ? `خلص ${dmy(x.completedAt)}` : `${x.done.length} درس`, badge: x.passed ? `نجح ${x.score ?? ""}%` : "جاري", tone: x.passed ? "ok" : "info" }; }))}
      {block("الاستلام ونهاية الخدمة", "/hr/onboarding", [...of(K.onboarding).map((d) => ({ id: d.id, text: "استلام موظف جديد", sub: dmy(d.date), badge: d.status === "done" ? "خلص" : "جاري", tone: (d.status === "done" ? "ok" : "info") as "ok" | "info" })), ...of(K.exit).map((d) => ({ id: d.id, text: "نهاية الخدمة", sub: dmy(d.date), badge: d.status === "done" ? "انتهت" : "جاري", tone: "warn" as const }))])}
      <Card className="lg:col-span-2">
        <CardHeader icon={<StickyNote />} title="ملاحظات الإدارة" subtitle="ملاحظات داخلية على الموظف، ما بتظهرش له." />
        <div className="grid gap-2 px-5 pb-5">
          {of(K.note).map((d) => <div key={d.id} className="flex items-start gap-2 rounded-xl border border-line p-2.5 text-[14px]"><span className="flex-1 whitespace-pre-wrap">{String((d.data as { text?: string }).text ?? "")}<span className="block text-[12px] text-muted">{dmy(d.date)} · {String((d.data as { by?: string }).by ?? "")}</span></span>{r.delete ? <IconButton label="حذف" size="sm" onClick={() => rm.ask(d)}><Trash2 /></IconButton> : null}</div>)}
          {r.edit ? <div className="flex gap-2"><Textarea aria-label="ملاحظة" rows={2} placeholder="اكتب ملاحظة" value={note} onChange={(e) => setNote(e.target.value)} /><Button disabled={!note.trim()} onClick={async () => { try { await saveDoc(db, null, { kind: K.note, memberId, name: hrx.name(memberId), date: hrx.today, data: { text: note.trim(), by: hrx.staff?.name ?? "" } }); setNote(""); } catch (e) { toast({ tone: "error", title: "تعذر الحفظ", description: err(e) }); } }}>إضافة</Button></div> : null}
        </div>
      </Card>
      {rm.node}
    </div>
  );
}
