/** الوظائف وصلاحياتها: every job has a department, a role (its permissions, sections and features), a grade and its duties. */
import { useState } from "react";
import { Link } from "react-router-dom";
import { Briefcase, Layers, Plus, ShieldCheck } from "lucide-react";
import type { HrDoc } from "@/data/hrDocTypes";
import { useDb } from "@/data/hooks";
import { Badge, Button, Card, CardHeader, Table, useToast } from "@/ui";
import { useArea } from "../useAccess";
import { ExportButton } from "../ui";
import { screensOfRole } from "../access";
import { SCREENS } from "../lib";
import { K, dataOf, type GradeData, type JobData } from "./model";
import { applyJobToHolders } from "./ops";
import { useHrx, type Hrx } from "./useHrx";
import { DocDialog, money, RowActions, useRemove } from "./ui";

export default function Jobs() {
  const hrx = useHrx();
  const rights = useArea();
  const rm = useRemove();
  const [edit, setEdit] = useState<HrDoc | "new" | null>(null);
  const [grade, setGrade] = useState<HrDoc | "new" | null>(null);
  const holders = (j: HrDoc) => hrx.members.filter((m) => m.active && hrx.fileOfMember(m.id).jobId === j.id);
  const screenNames = (roleId: string | null) => { const r = hrx.roles.find((x) => x.id === roleId); return r ? screensOfRole(r).map((s) => SCREENS.find((x) => x.id === s)?.label ?? s) : []; };
  return (
    <div className="grid gap-5">
      <Card>
        <CardHeader icon={<Briefcase />} title="الوظائف" subtitle={hrx.settings.jobSetsRole ? "كل وظيفة مربوطة بدور: الموظف اللي في الوظيفة بياخد صلاحيات الدور والأقسام اللي يشوفها تلقائياً." : "ربط الوظيفة بالصلاحيات متوقف من الإعدادات."}
          action={<div className="flex flex-wrap gap-2">
            <Link to="/users/roles" className="inline-flex h-9 items-center gap-1.5 rounded-[10px] border border-line px-3 text-[13.5px] font-semibold hover:bg-surface-2"><ShieldCheck className="size-4" />الأدوار والصلاحيات</Link>
            <ExportButton size="sm" file="الوظائف" head={["الوظيفة", "القسم", "الدور", "الدرجة", "العدد المطلوب", "الموجود"]} rows={() => hrx.jobs.map((j) => { const x = dataOf<JobData>(j); return [j.name, hrx.departments.find((d) => d.id === x.departmentId)?.name ?? "", hrx.roleName(x.roleId), hrx.grades.find((g) => g.id === x.gradeId)?.name ?? "", x.headcount || 0, holders(j).length]; })} />
            {rights.add ? <Button size="sm" icon={<Plus />} onClick={() => setEdit("new")}>وظيفة جديدة</Button> : null}
          </div>} />
        <Table rows={hrx.jobs} rowKey={(j) => j.id} empty="لسه مفيش وظائف. أضف مثلاً: شيف، مساعد شيف، كاشير، مندوب توصيل، مدير فرع."
          columns={[
            { key: "n", header: "الوظيفة", cell: (j) => <span className="font-semibold">{j.name}</span> },
            { key: "d", header: "القسم", cell: (j) => hrx.departments.find((d) => d.id === dataOf<JobData>(j).departmentId)?.name ?? "—" },
            { key: "r", header: "الدور والصلاحيات", cell: (j) => { const id = dataOf<JobData>(j).roleId; return id ? <div className="grid gap-0.5"><Badge size="sm" tone="brass">{hrx.roleName(id)}</Badge><span className="text-[12px] text-muted">{screenNames(id).join("، ")}</span></div> : <span className="text-muted">من غير دور</span>; } },
            { key: "g", header: "الدرجة", hideOnMobile: true, cell: (j) => hrx.grades.find((g) => g.id === dataOf<JobData>(j).gradeId)?.name ?? "—" },
            { key: "c", header: "الموظفين", align: "center", cell: (j) => { const n = holders(j).length, need = dataOf<JobData>(j).headcount || 0; return <span className={need && n < need ? "font-bold text-warn" : ""}>{n}{need ? ` / ${need}` : ""}</span>; } },
            { key: "a", header: "", align: "end", cell: (j) => <RowActions onEdit={() => setEdit(j)} onDelete={holders(j).length ? undefined : () => rm.ask(j)} /> },
          ]} />
      </Card>

      <Card>
        <CardHeader icon={<Layers />} title="الدرجات الوظيفية وسلم الرواتب" subtitle="أقل وأعلى راتب لكل درجة. بيظهر تنبيه في ملف الموظف لو راتبه برة الدرجة."
          action={rights.add ? <Button size="sm" variant="outline" icon={<Plus />} onClick={() => setGrade("new")}>درجة جديدة</Button> : null} />
        <Table rows={hrx.grades} rowKey={(g) => g.id} empty="مفيش درجات."
          columns={[
            { key: "n", header: "الدرجة", cell: (g) => <span className="font-semibold">{g.name}</span> },
            { key: "min", header: "من", align: "end", cell: (g) => money(hrx, dataOf<GradeData>(g).min) },
            { key: "max", header: "إلى", align: "end", cell: (g) => money(hrx, dataOf<GradeData>(g).max) },
            { key: "j", header: "الوظائف", cell: (g) => hrx.jobs.filter((j) => dataOf<JobData>(j).gradeId === g.id).map((j) => j.name).join("، ") || "—" },
            { key: "a", header: "", align: "end", cell: (g) => <RowActions onEdit={() => setGrade(g)} onDelete={() => rm.ask(g)} /> },
          ]} />
      </Card>

      {edit ? <JobDialog hrx={hrx} row={edit === "new" ? null : edit} onClose={() => setEdit(null)} /> : null}
      {grade ? <DocDialog hrx={hrx} kind={K.grade} row={grade === "new" ? null : grade} title="الدرجة الوظيفية" onClose={() => setGrade(null)} defaults={{ min: 0, max: 0, note: "" }} check={(v) => (Number(v.max) && Number(v.max) < Number(v.min) ? "أعلى راتب أقل من أقل راتب" : "")}
        fields={[{ key: "name", label: "اسم الدرجة", type: "text", required: true }, { key: "min", label: "أقل راتب", type: "money" }, { key: "max", label: "أعلى راتب", type: "money" }, { key: "note", label: "ملاحظات", type: "textarea" }]} /> : null}
      {rm.node}
    </div>
  );
}

function JobDialog({ hrx, row, onClose }: { hrx: Hrx; row: HrDoc | null; onClose: () => void }) {
  const db = useDb();
  const { toast } = useToast();
  const before = row ? dataOf<JobData>(row).roleId : null;
  const courses = hrx.by(K.course);
  return (
    <DocDialog hrx={hrx} kind={K.job} row={row} title={row ? "تعديل وظيفة" : "وظيفة جديدة"} onClose={onClose} size="xl"
      defaults={{ departmentId: null, roleId: null, gradeId: null, description: "", duties: "", requirements: "", courses: [], headcount: 0 }}
      after={async (_saved, v) => {
        if (row && v.roleId && v.roleId !== before) {
          const n = await applyJobToHolders(db, hrx, row.id, String(v.roleId));
          if (n) toast({ tone: "success", title: `اتغيرت صلاحيات ${n} موظف في الوظيفة دي` });
        }
      }}
      fields={[
        { key: "name", label: "اسم الوظيفة", type: "text", required: true },
        { key: "departmentId", label: "القسم", type: "select", options: [{ value: "", label: "—" }, ...hrx.departments.map((d) => ({ value: d.id, label: d.name }))] },
        { key: "roleId", label: "الدور (الصلاحيات والأقسام)", type: "select", hint: "الصلاحيات نفسها بتتعدل من المستخدمين ← الأدوار", options: [{ value: "", label: "من غير دور" }, ...hrx.roles.map((r) => ({ value: r.id, label: r.name }))] },
        { key: "gradeId", label: "الدرجة", type: "select", options: [{ value: "", label: "—" }, ...hrx.grades.map((g) => ({ value: g.id, label: g.name }))] },
        { key: "headcount", label: "عدد الموظفين المطلوب", type: "number" },
        { key: "description", label: "الوصف الوظيفي", type: "textarea" },
        { key: "duties", label: "المهام والمسؤوليات", type: "textarea" },
        { key: "requirements", label: "المؤهلات والشروط", type: "textarea" },
        { key: "courses", label: "دورات تدريبية لازمة للوظيفة", type: "multi", options: courses.map((c) => ({ value: c.id, label: c.name })) },
      ]} />
  );
}
