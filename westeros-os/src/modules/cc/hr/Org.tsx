/** الهيكل التنظيمي: الأقسام (قسم جوه قسم)، رئيس كل قسم، والموظفين تحت كل قسم في شكل شجرة. */
import { useState } from "react";
import { Link } from "react-router-dom";
import { Building2, Network, Plus, UserRound } from "lucide-react";
import type { HrDoc } from "@/data/hrDocTypes";
import { Badge, Button, Card, CardHeader } from "@/ui";
import { useArea } from "../useAccess";
import { ExportButton } from "../ui";
import { K, dataOf, type DepartmentData } from "./model";
import { useHrx, type Hrx } from "./useHrx";
import { DocDialog, RowActions, useRemove } from "./ui";

export default function Org() {
  const hrx = useHrx();
  const rights = useArea();
  const rm = useRemove();
  const [edit, setEdit] = useState<HrDoc | "new" | null>(null);
  const roots = hrx.departments.filter((d) => !dataOf<DepartmentData>(d).parentId || !hrx.departments.some((x) => x.id === dataOf<DepartmentData>(d).parentId));
  const noDept = hrx.visible.filter((m) => m.active && !hrx.fileOfMember(m.id).departmentId);
  return (
    <div className="grid gap-5">
      <Card>
        <CardHeader icon={<Network />} title="الهيكل التنظيمي" subtitle="الأقسام وتحت كل قسم أقسامه الفرعية وموظفيه. رئيس القسم بيوافق على طلبات موظفيه لما نوع الطلب يطلب رئيس القسم."
          action={<div className="flex gap-2">
            <ExportButton size="sm" file="الأقسام" head={["القسم", "القسم الرئيسي", "رئيس القسم", "عدد الموظفين"]} rows={() => hrx.departments.map((d) => { const x = dataOf<DepartmentData>(d); return [d.name, hrx.departments.find((p) => p.id === x.parentId)?.name ?? "", hrx.name(x.headId), hrx.members.filter((m) => m.active && hrx.fileOfMember(m.id).departmentId === d.id).length]; })} />
            {rights.add ? <Button size="sm" icon={<Plus />} onClick={() => setEdit("new")}>قسم جديد</Button> : null}
          </div>} />
        <div className="grid gap-3 px-5 pb-5">
          {roots.map((d) => <Node key={d.id} hrx={hrx} d={d} depth={0} onEdit={setEdit} onDelete={rm.ask} />)}
          {hrx.departments.length ? null : <p className="rounded-xl border border-dashed border-line px-3 py-6 text-center text-[14px] text-muted">لسه مفيش أقسام. أضف مثلاً: المطبخ، الصالة، الكاشير، التوصيل، الإدارة.</p>}
          {noDept.length ? (
            <div className="rounded-xl border border-dashed border-line p-3">
              <p className="mb-2 text-[13px] font-semibold text-muted">موظفين من غير قسم ({noDept.length})</p>
              <div className="flex flex-wrap gap-1.5">{noDept.map((m) => <Link key={m.id} to={`/hr/e/${m.id}`} className="rounded-full border border-line px-2.5 py-0.5 text-[13px] hover:bg-surface-2">{m.name}</Link>)}</div>
            </div>
          ) : null}
        </div>
      </Card>
      {edit ? <DeptDialog hrx={hrx} row={edit === "new" ? null : edit} onClose={() => setEdit(null)} /> : null}
      {rm.node}
    </div>
  );
}

function Node({ hrx, d, depth, onEdit, onDelete }: { hrx: Hrx; d: HrDoc; depth: number; onEdit: (d: HrDoc) => void; onDelete: (d: HrDoc) => void }) {
  const x = dataOf<DepartmentData>(d);
  const kids = hrx.departments.filter((k) => dataOf<DepartmentData>(k).parentId === d.id);
  const people = hrx.visible.filter((m) => m.active && hrx.fileOfMember(m.id).departmentId === d.id);
  return (
    <div className="grid gap-2 rounded-2xl border border-line p-3" style={{ borderInlineStartColor: x.color || undefined, borderInlineStartWidth: x.color ? 4 : undefined }}>
      <div className="flex flex-wrap items-center gap-2">
        <Building2 className="size-4 text-brass-text" />
        <span className="font-bold">{d.name}</span>
        <Badge size="sm">{people.length} موظف</Badge>
        {x.headId ? <span className="text-[13px] text-muted">رئيس القسم: <Link className="underline" to={`/hr/e/${x.headId}`}>{hrx.name(x.headId)}</Link></span> : null}
        <span className="flex-1" />
        <RowActions onEdit={() => onEdit(d)} onDelete={kids.length || people.length ? undefined : () => onDelete(d)} />
      </div>
      {x.description ? <p className="text-[13px] text-muted">{x.description}</p> : null}
      {people.length ? (
        <div className="flex flex-wrap gap-1.5">
          {people.map((m) => { const job = hrx.jobOf(m.id); return <Link key={m.id} to={`/hr/e/${m.id}`} className="inline-flex items-center gap-1 rounded-full border border-line px-2.5 py-0.5 text-[13px] hover:bg-surface-2"><UserRound className="size-3.5" />{m.name}{job ? <span className="text-muted">· {job.name}</span> : null}</Link>; })}
        </div>
      ) : null}
      {kids.length ? <div className="grid gap-2 ps-3 sm:ps-6">{kids.map((k) => <Node key={k.id} hrx={hrx} d={k} depth={depth + 1} onEdit={onEdit} onDelete={onDelete} />)}</div> : null}
    </div>
  );
}

function DeptDialog({ hrx, row, onClose }: { hrx: Hrx; row: HrDoc | null; onClose: () => void }) {
  const others = hrx.departments.filter((d) => d.id !== row?.id);
  return (
    <DocDialog hrx={hrx} kind={K.department} row={row} title={row ? "تعديل قسم" : "قسم جديد"} onClose={onClose}
      defaults={{ parentId: null, headId: null, description: "", color: "" }}
      check={(v) => (row && v.parentId === row.id ? "القسم ما ينفعش يكون تحت نفسه" : "")}
      fields={[
        { key: "name", label: "اسم القسم", type: "text", required: true },
        { key: "parentId", label: "تحت قسم", type: "select", options: [{ value: "", label: "قسم رئيسي" }, ...others.map((d) => ({ value: d.id, label: d.name }))] },
        { key: "headId", label: "رئيس القسم", type: "member" },
        { key: "color", label: "لون القسم", type: "select", options: [{ value: "", label: "بدون" }, { value: "#F8BB18", label: "ذهبي" }, { value: "#2f6f9f", label: "أزرق" }, { value: "#3c8d5a", label: "أخضر" }, { value: "#b5452f", label: "أحمر" }, { value: "#7a4fb0", label: "بنفسجي" }] },
        { key: "description", label: "وصف القسم", type: "textarea" },
      ]} />
  );
}
