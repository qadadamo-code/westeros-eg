/** الموظفين: everyone with their department, job, manager, status and missing papers; each one opens their file. */
import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AlertTriangle, IdCard, Plus } from "lucide-react";
import { useDb } from "@/data/hooks";
import { Avatar, Badge, Button, Card, Dialog, Input, Table, useToast } from "@/ui";
import { useArea } from "../useAccess";
import { ExportButton } from "../ui";
import { Toolbar } from "../finance/ui";
import { EMP_STATUS, K, addDays, fileOf, serviceYears, type EmpStatus } from "./model";
import { saveDoc, setRole } from "./ops";
import { useHrx, type Hrx } from "./useHrx";
import { dmy, err, SearchBox, Sel } from "./ui";

export function missingDocs(hrx: Hrx, memberId: string): string[] {
  const p = hrx.profileBy.get(memberId);
  const have = new Set((p?.documents ?? []).map((d) => d.kind as string));
  return hrx.settings.docTypes.filter((t) => t.active !== false && t.required && !have.has(t.id)).map((t) => t.name);
}

export default function Employees() {
  const hrx = useHrx();
  const nav = useNavigate();
  const rights = useArea();
  const [q, setQ] = useState("");
  const [dept, setDept] = useState("");
  const [job, setJob] = useState("");
  const [status, setStatus] = useState("current");
  const [branch, setBranch] = useState("");
  const [adding, setAdding] = useState(false);
  const rows = useMemo(() => hrx.visible.filter((m) => {
    const f = hrx.fileOfMember(m.id);
    const st: EmpStatus = !m.active ? "ended" : f.empStatus;
    if (status === "current" ? st === "ended" : status && st !== status) return false;
    if (dept && f.departmentId !== dept) return false;
    if (job && f.jobId !== job) return false;
    if (branch && !(m.branchIds.includes(branch) || !m.branchIds.length)) return false;
    const s = q.trim();
    return !s || m.name.includes(s) || (m.phone ?? "").includes(s) || f.employeeNo.includes(s) || (hrx.profileBy.get(m.id)?.nationalId ?? "").includes(s);
  }), [hrx, q, dept, job, status, branch]);
  const exportRows = () => rows.map((m) => { const f = hrx.fileOfMember(m.id); const p = hrx.profileBy.get(m.id); return [f.employeeNo, m.name, hrx.deptOf(m.id)?.name ?? "", hrx.jobOf(m.id)?.name ?? p?.position.ar ?? "", hrx.name(f.managerId), hrx.workplace(m), m.phone ?? f.phone, p?.nationalId ?? "", p?.hireDate ?? "", EMP_STATUS[m.active ? f.empStatus : "ended"].label]; });
  return (
    <div className="grid gap-4">
      <Toolbar collapse lead={<SearchBox value={q} onChange={setQ} placeholder="اسم، تليفون، رقم الموظف، الرقم القومي" />}
        actions={<>
          <ExportButton file="الموظفين" head={["رقم الموظف", "الاسم", "القسم", "الوظيفة", "المدير المباشر", "مكان العمل", "التليفون", "الرقم القومي", "تاريخ التعيين", "الحالة"]} rows={exportRows} />
          {rights.add ? <Button icon={<Plus />} onClick={() => setAdding(true)}>موظف جديد</Button> : null}
        </>}>
        <Sel label="الحالة" value={status} onChange={setStatus} options={[{ value: "current", label: "الموظفين الحاليين" }, { value: "", label: "الكل" }, ...Object.entries(EMP_STATUS).map(([value, s]) => ({ value, label: s.label }))]} />
        <Sel label="القسم" value={dept} onChange={setDept} options={[{ value: "", label: "كل الأقسام" }, ...hrx.departments.map((d) => ({ value: d.id, label: d.name }))]} />
        <Sel label="الوظيفة" value={job} onChange={setJob} options={[{ value: "", label: "كل الوظائف" }, ...hrx.jobs.map((d) => ({ value: d.id, label: d.name }))]} />
        {hrx.branches.length > 1 ? <Sel label="الفرع" value={branch} onChange={setBranch} options={[{ value: "", label: "كل الفروع" }, ...hrx.branches.map((b) => ({ value: b.id, label: b.name.ar }))]} /> : null}
      </Toolbar>
      <Card>
        <Table rows={rows} rowKey={(m) => m.id} onRowClick={(m) => nav(`/hr/e/${m.id}`)} empty="مفيش موظفين بالبحث ده."
          columns={[
            { key: "n", header: "الموظف", cell: (m) => <span className="flex items-center gap-2"><Avatar name={m.name} size="sm" /><span className="grid"><span className="font-semibold">{m.name}</span><span className="text-[12px] text-muted">{hrx.fileOfMember(m.id).employeeNo || m.phone || ""}</span></span></span> },
            { key: "d", header: "القسم والوظيفة", cell: (m) => <span className="grid"><span>{hrx.jobOf(m.id)?.name ?? hrx.profileBy.get(m.id)?.position.ar ?? "—"}</span><span className="text-[12px] text-muted">{hrx.deptOf(m.id)?.name ?? ""}</span></span> },
            { key: "w", header: "مكان العمل", hideOnMobile: true, cell: (m) => hrx.workplace(m) },
            { key: "h", header: "مدة الخدمة", hideOnMobile: true, cell: (m) => { const h = hrx.profileBy.get(m.id)?.hireDate; return h ? `${serviceYears(h, hrx.today).toFixed(1)} سنة` : "—"; } },
            { key: "s", header: "الحالة", cell: (m) => { const st = EMP_STATUS[m.active ? hrx.fileOfMember(m.id).empStatus : "ended"]; const miss = missingDocs(hrx, m.id); return <span className="flex flex-wrap items-center gap-1"><Badge size="sm" tone={st.tone}>{st.label}</Badge>{miss.length && m.active ? <Badge size="sm" tone="warn" icon={<AlertTriangle />}>{miss.length} مستند ناقص</Badge> : null}</span>; } },
          ]} />
      </Card>
      <p className="text-[13px] text-muted"><IdCard className="inline size-4" /> الموظفين هم نفس المستخدمين: الدخول والرقم السري من <Link to="/users" className="underline">المستخدمين</Link>، وكل الملف من هنا.</p>
      {adding ? <NewEmployee hrx={hrx} onClose={() => setAdding(false)} onDone={(id) => nav(`/hr/e/${id}`)} /> : null}
    </div>
  );
}

function NewEmployee({ hrx, onClose, onDone }: { hrx: Hrx; onClose: () => void; onDone: (id: string) => void }) {
  const db = useDb();
  const { toast } = useToast();
  const [v, setV] = useState({ name: "", phone: "", jobId: "", roleId: hrx.roles[0]?.id ?? "", departmentId: "", branchId: "", hireDate: hrx.today, managerId: "" });
  const [busy, setBusy] = useState(false);
  const job = hrx.jobs.find((j) => j.id === v.jobId);
  const roleFromJob = job ? hrx.jobData(job).roleId : null;
  const save = async () => {
    if (!v.name.trim()) return toast({ tone: "error", title: "اكتب الاسم" });
    const roleId = roleFromJob ?? v.roleId;
    const role = hrx.roles.find((r) => r.id === roleId);
    if (!role) return toast({ tone: "error", title: "اختر الدور أو وظيفة مربوطة بدور" });
    setBusy(true);
    try {
      const m = await db.insert("memberships", { name: v.name.trim(), phone: v.phone.trim() || null, email: null, branchIds: v.branchId ? [v.branchId] : [], userId: null, role: role.role, color: "#F8BB18", hasPin: false, active: true, lastSeenAt: null } as never);
      await db.insert("staffProfiles", { membershipId: m.id, nationalId: null, birthDate: null, address: null, hireDate: v.hireDate, contractType: "probation", position: { ar: job?.name ?? "", en: "" }, deviceUserId: null, emergencyContact: null, notes: "", photoUrl: null, nationality: "EG", contractEnd: null, station: null, foodHandler: true, documents: [], weeklyOff: [5], terminatedAt: null, terminationReason: null } as never);
      await setRole(db, hrx, m as never, role.id);
      await saveDoc(db, null, { kind: K.file, memberId: m.id, name: v.name.trim(), branchId: v.branchId || null, status: "probation", data: { ...fileOf(null), jobId: v.jobId || null, departmentId: v.departmentId || (job ? hrx.jobData(job).departmentId : null), managerId: v.managerId || null, phone: v.phone.trim(), probationEnd: addDays(v.hireDate, hrx.settings.probationDays), empStatus: "probation" } as unknown as Record<string, unknown> });
      toast({ tone: "success", title: "تم إضافة الموظف", description: "الرقم السري للدخول بيتحدد من المستخدمين." });
      onDone(m.id);
    } catch (e) { toast({ tone: "error", title: "تعذر الحفظ", description: err(e) }); } finally { setBusy(false); }
  };
  return (
    <Dialog open onClose={onClose} size="lg" title="موظف جديد" footer={<div className="flex justify-end gap-2"><Button variant="ghost" onClick={onClose}>إلغاء</Button><Button loading={busy} onClick={save}>إضافة</Button></div>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Input label="الاسم *" autoFocus value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} />
        <Input label="التليفون" dir="ltr" value={v.phone} onChange={(e) => setV({ ...v, phone: e.target.value })} />
        <Sel label="الوظيفة" value={v.jobId} onChange={(x) => setV({ ...v, jobId: x })} options={[{ value: "", label: "—" }, ...hrx.jobs.map((j) => ({ value: j.id, label: j.name }))]} />
        {roleFromJob ? <Input label="الدور" disabled value={hrx.roleName(roleFromJob)} hint="من الوظيفة" /> : <Sel label="الدور (الصلاحيات) *" value={v.roleId} onChange={(x) => setV({ ...v, roleId: x })} options={hrx.roles.map((r) => ({ value: r.id, label: r.name }))} />}
        <Sel label="القسم" value={v.departmentId} onChange={(x) => setV({ ...v, departmentId: x })} options={[{ value: "", label: job ? "قسم الوظيفة" : "—" }, ...hrx.departments.map((d) => ({ value: d.id, label: d.name }))]} />
        <Sel label="مكان العمل" value={v.branchId} onChange={(x) => setV({ ...v, branchId: x })} options={[{ value: "", label: "كل الفروع" }, ...hrx.branches.map((b) => ({ value: b.id, label: b.name.ar }))]} />
        <Input label="تاريخ التعيين" type="date" dir="ltr" value={v.hireDate} onChange={(e) => setV({ ...v, hireDate: e.target.value })} hint={`نهاية التجربة ${dmy(addDays(v.hireDate || hrx.today, hrx.settings.probationDays))}`} />
        <Sel label="المدير المباشر" value={v.managerId} onChange={(x) => setV({ ...v, managerId: x })} options={[{ value: "", label: "—" }, ...hrx.members.filter((m) => m.active).map((m) => ({ value: m.id, label: m.name }))]} />
      </div>
    </Dialog>
  );
}
