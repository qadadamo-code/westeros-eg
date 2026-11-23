/** التوظيف: الوظائف الشاغرة، والمتقدمين على مراحل (لوحة)، المقابلات وتقييمها، والتعيين بضغطة (موظف جديد + ملف + قائمة استلام). */
import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Megaphone, Plus, Star, UserCheck, UserPlus, Users } from "lucide-react";
import type { HrDoc } from "@/data/hrDocTypes";
import { useDb } from "@/data/hooks";
import { Badge, Button, Card, CardHeader, Dialog, IconButton, Input, Segmented, Table, Textarea, useToast } from "@/ui";
import { useArea } from "../useAccess";
import { ExportButton } from "../ui";
import { fromText, Toolbar } from "../finance/ui";
import { K, activeOpts, dataOf, newId, optName, type CandidateData, type Interview, type VacancyData } from "./model";
import { hireCandidate, saveDoc } from "./ops";
import { useHrx, type Hrx } from "./useHrx";
import { DocDialog, dmy, err, money, RowActions, SearchBox, Sel, useRemove } from "./ui";

export default function Recruit() {
  const [tab, setTab] = useState<"board" | "vacancies">("board");
  return (
    <div className="grid gap-4">
      <Segmented label="التوظيف" value={tab} onChange={setTab} options={[{ value: "board", label: "المتقدمين", icon: <Users /> }, { value: "vacancies", label: "الوظائف الشاغرة", icon: <Megaphone /> }]} />
      {tab === "board" ? <Board /> : <Vacancies />}
    </div>
  );
}

function Vacancies() {
  const hrx = useHrx();
  const rights = useArea();
  const rm = useRemove();
  const [edit, setEdit] = useState<HrDoc | "new" | null>(null);
  const rows = hrx.by(K.vacancy).sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
  const count = (v: HrDoc) => hrx.by(K.candidate).filter((c) => dataOf<CandidateData>(c).vacancyId === v.id);
  return (
    <Card>
      <CardHeader icon={<Megaphone />} title="الوظائف الشاغرة" action={rights.add ? <Button size="sm" icon={<Plus />} onClick={() => setEdit("new")}>وظيفة شاغرة</Button> : null} />
      <Table rows={rows} rowKey={(v) => v.id} empty="مفيش وظائف شاغرة."
        columns={[
          { key: "n", header: "الوظيفة", cell: (v) => <span className="grid"><span className="font-semibold">{v.name}</span><span className="text-[12px] text-muted">{hrx.branchName(v.branchId)}</span></span> },
          { key: "c", header: "المطلوب", align: "center", cell: (v) => dataOf<VacancyData>(v).count || 1 },
          { key: "a", header: "المتقدمين", align: "center", cell: (v) => { const c = count(v); return `${c.length} (${c.filter((x) => x.status === "hired").length} اتعين)`; } },
          { key: "d", header: "آخر موعد", hideOnMobile: true, cell: (v) => dmy(dataOf<VacancyData>(v).closes) },
          { key: "s", header: "الحالة", cell: (v) => <Badge size="sm" tone={v.status === "active" ? "ok" : "neutral"}>{v.status === "active" ? "مفتوحة" : "مقفولة"}</Badge> },
          { key: "x", header: "", align: "end", cell: (v) => <RowActions onEdit={() => setEdit(v)} onDelete={count(v).length ? undefined : () => rm.ask(v)} /> },
        ]} />
      {edit ? (
        <DocDialog hrx={hrx} kind={K.vacancy} row={edit === "new" ? null : edit} title="وظيفة شاغرة" onClose={() => setEdit(null)} size="xl"
          defaults={{ date: hrx.today, status: "active", jobId: null, count: 1, description: "", requirements: "", salaryFrom: 0, salaryTo: 0, closes: null, branchId: null }}
          fields={[
            { key: "name", label: "عنوان الوظيفة", type: "text", required: true },
            { key: "jobId", label: "الوظيفة في الهيكل", type: "select", options: [{ value: "", label: "—" }, ...hrx.jobs.map((j) => ({ value: j.id, label: j.name }))] },
            { key: "branchId", label: "الفرع", type: "select", options: [{ value: "", label: "كل الفروع" }, ...hrx.branches.map((b) => ({ value: b.id, label: b.name.ar }))] },
            { key: "count", label: "العدد المطلوب", type: "number" },
            { key: "salaryFrom", label: "الراتب من", type: "money" },
            { key: "salaryTo", label: "الراتب إلى", type: "money" },
            { key: "date", label: "تاريخ الإعلان", type: "date" },
            { key: "closes", label: "آخر موعد للتقديم", type: "date" },
            { key: "status", label: "الحالة", type: "select", options: [{ value: "active", label: "مفتوحة" }, { value: "closed", label: "مقفولة" }] },
            { key: "description", label: "الوصف", type: "textarea" },
            { key: "requirements", label: "الشروط", type: "textarea" },
          ]} />
      ) : null}
      {rm.node}
    </Card>
  );
}

function Board() {
  const hrx = useHrx();
  const db = useDb();
  const { toast } = useToast();
  const rights = useArea();
  const [q, setQ] = useState("");
  const [vac, setVac] = useState("");
  const [open, setOpen] = useState<HrDoc | "new" | null>(null);
  const [hire, setHire] = useState<HrDoc | null>(null);
  const stages = activeOpts(hrx.settings.stages);
  const cands = useMemo(() => hrx.by(K.candidate).filter((c) => (!vac || dataOf<CandidateData>(c).vacancyId === vac) && (!q.trim() || c.name.includes(q.trim()) || dataOf<CandidateData>(c).phone.includes(q.trim()))), [hrx, q, vac]);
  const move = async (c: HrDoc, dir: 1 | -1) => {
    const i = stages.findIndex((s) => s.id === dataOf<CandidateData>(c).stage);
    const next = stages[Math.max(0, Math.min(stages.length - 1, i + dir))];
    if (!next) return;
    if (next.id === "hired") return setHire(c);
    try { await saveDoc(db, c, { kind: K.candidate, status: next.id === "rejected" ? "rejected" : "active", data: { stage: next.id } }); } catch (e) { toast({ tone: "error", title: "تعذر النقل", description: err(e) }); }
  };
  return (
    <div className="grid gap-4">
      <Toolbar lead={<SearchBox value={q} onChange={setQ} placeholder="اسم أو تليفون" />} actions={<>
        <ExportButton file="المتقدمين" head={["الاسم", "التليفون", "الوظيفة", "المرحلة", "المصدر", "التقييم", "تاريخ التقديم"]} rows={() => cands.map((c) => { const d = dataOf<CandidateData>(c); return [c.name, d.phone, hrx.by(K.vacancy).find((v) => v.id === d.vacancyId)?.name ?? "", optName(hrx.settings.stages, d.stage), optName(hrx.settings.sources, d.source), d.rating, c.date ?? ""]; })} />
        {rights.add ? <Button icon={<UserPlus />} onClick={() => setOpen("new")}>متقدم جديد</Button> : null}
      </>}>
        <Sel label="الوظيفة" value={vac} onChange={setVac} options={[{ value: "", label: "كل الوظائف" }, ...hrx.by(K.vacancy).map((v) => ({ value: v.id, label: v.name }))]} />
      </Toolbar>
      <div className="grid gap-3 overflow-x-auto pb-2 sm:grid-flow-col sm:auto-cols-[minmax(230px,1fr)]">
        {stages.map((s) => {
          const list = cands.filter((c) => (dataOf<CandidateData>(c).stage || stages[0]?.id) === s.id);
          return (
            <div key={s.id} className="grid content-start gap-2 rounded-2xl border border-line bg-surface-2 p-2">
              <div className="flex items-center justify-between px-1"><span className="font-bold">{s.name}</span><Badge size="sm">{list.length}</Badge></div>
              {list.map((c) => { const d = dataOf<CandidateData>(c); return (
                <Card key={c.id} interactive className="grid gap-1 p-2.5">
                  <button type="button" className="text-start" onClick={() => setOpen(c)}>
                    <span className="block font-semibold">{c.name}</span>
                    <span className="block text-[12px] text-muted">{hrx.by(K.vacancy).find((v) => v.id === d.vacancyId)?.name ?? "—"} · {dmy(c.date)}</span>
                    <span className="flex gap-0.5 pt-0.5">{[1, 2, 3, 4, 5].map((n) => <Star key={n} className={`size-3.5 ${n <= d.rating ? "fill-brass text-brass" : "text-line-strong"}`} />)}</span>
                  </button>
                  {rights.edit ? <div className="flex items-center justify-between">
                    <IconButton label="المرحلة اللي قبل" size="sm" onClick={() => move(c, -1)}><ChevronRight /></IconButton>
                    {c.status === "hired" ? <Badge size="sm" tone="ok" icon={<UserCheck />}>اتعين</Badge> : s.id !== "rejected" ? <Button size="sm" variant="ghost" onClick={() => setHire(c)}>تعيين</Button> : null}
                    <IconButton label="المرحلة اللي بعد" size="sm" onClick={() => move(c, 1)}><ChevronLeft /></IconButton>
                  </div> : null}
                </Card>
              ); })}
            </div>
          );
        })}
      </div>
      {open ? <CandidateDialog hrx={hrx} row={open === "new" ? null : open} onClose={() => setOpen(null)} /> : null}
      {hire ? <HireDialog hrx={hrx} cand={hire} onClose={() => setHire(null)} /> : null}
    </div>
  );
}

function CandidateDialog({ hrx, row, onClose }: { hrx: Hrx; row: HrDoc | null; onClose: () => void }) {
  const stages = activeOpts(hrx.settings.stages);
  return (
    <DocDialog hrx={hrx} kind={K.candidate} row={row} title={row ? row.name : "متقدم جديد"} onClose={onClose} size="xl"
      defaults={{ date: hrx.today, status: "active", phone: "", email: "", vacancyId: null, stage: stages[0]?.id ?? "new", source: hrx.settings.sources[0]?.id ?? "", rating: 0, expected: 0, cv: null, notes: "", interviews: [] }}
      fields={[
        { key: "name", label: "الاسم", type: "text", required: true },
        { key: "phone", label: "التليفون", type: "text", required: true },
        { key: "email", label: "الإيميل", type: "text" },
        { key: "vacancyId", label: "الوظيفة", type: "select", options: [{ value: "", label: "—" }, ...hrx.by(K.vacancy).map((v) => ({ value: v.id, label: v.name }))] },
        { key: "stage", label: "المرحلة", type: "select", options: stages.filter((s) => s.id !== "hired").map((s) => ({ value: s.id, label: s.name })) },
        { key: "source", label: "المصدر", type: "select", options: activeOpts(hrx.settings.sources).map((s) => ({ value: s.id, label: s.name })) },
        { key: "rating", label: "التقييم (من 5)", type: "select", options: [0, 1, 2, 3, 4, 5].map((n) => ({ value: String(n), label: n ? "★".repeat(n) : "بدون" })) },
        { key: "expected", label: "الراتب المتوقع", type: "money" },
        { key: "date", label: "تاريخ التقديم", type: "date" },
        { key: "notes", label: "ملاحظات", type: "textarea" },
      ]}
      check={(v) => { v.rating = Number(v.rating) || 0; return ""; }}
      extra={(v, set) => <Interviews hrx={hrx} list={(v.interviews as Interview[]) ?? []} onChange={(interviews) => set({ interviews })} />} />
  );
}

function Interviews({ hrx, list, onChange }: { hrx: Hrx; list: Interview[]; onChange: (l: Interview[]) => void }) {
  const [n, setN] = useState<Interview>({ id: "", date: hrx.today, by: hrx.staff?.name ?? "", score: 3, note: "" });
  return (
    <div className="grid gap-2 sm:col-span-2">
      <span className="text-[13px] font-semibold">المقابلات ({list.length})</span>
      {list.map((i) => <div key={i.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-line px-3 py-2 text-[13.5px]"><span>{dmy(i.date)}</span><span className="text-muted">{i.by}</span><Badge size="sm" tone="brass">{i.score}/5</Badge><span className="flex-1">{i.note}</span><button type="button" className="text-muted" onClick={() => onChange(list.filter((x) => x.id !== i.id))}>حذف</button></div>)}
      <div className="grid gap-2 rounded-xl border border-dashed border-line p-2 sm:grid-cols-4">
        <Input label="التاريخ" type="date" dir="ltr" value={n.date} onChange={(e) => setN({ ...n, date: e.target.value })} />
        <Input label="أجرى المقابلة" value={n.by} onChange={(e) => setN({ ...n, by: e.target.value })} />
        <Sel label="الدرجة" value={String(n.score)} onChange={(x) => setN({ ...n, score: Number(x) })} options={[1, 2, 3, 4, 5].map((x) => ({ value: String(x), label: `${x}/5` }))} />
        <div className="flex items-end"><Button size="sm" variant="outline" onClick={() => { onChange([...list, { ...n, id: newId() }]); setN({ ...n, note: "" }); }}>إضافة مقابلة</Button></div>
        <div className="sm:col-span-4"><Textarea label="ملاحظات المقابلة" rows={2} value={n.note} onChange={(e) => setN({ ...n, note: e.target.value })} /></div>
      </div>
    </div>
  );
}

function HireDialog({ hrx, cand, onClose }: { hrx: Hrx; cand: HrDoc; onClose: () => void }) {
  const db = useDb();
  const { toast } = useToast();
  const c = dataOf<CandidateData>(cand);
  const vac = hrx.by(K.vacancy).find((v) => v.id === c.vacancyId);
  const vjob = vac ? dataOf<VacancyData>(vac).jobId : null;
  const job0 = hrx.jobs.find((j) => j.id === vjob);
  const [v, setV] = useState({ jobId: vjob ?? "", roleId: (job0 ? hrx.jobData(job0).roleId : null) ?? hrx.roles[0]?.id ?? "", branchId: vac?.branchId ?? "", departmentId: job0 ? hrx.jobData(job0).departmentId ?? "" : "", start: hrx.today, salary: c.expected ? String(c.expected / 100000) : "", onboardingId: hrx.settings.onboarding[0]?.id ?? "" });
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      await hireCandidate(db, hrx, cand, { roleId: v.roleId, branchId: v.branchId || null, jobId: v.jobId || null, departmentId: v.departmentId || null, start: v.start, salary: fromText(v.salary), onboardingId: v.onboardingId || null });
      toast({ tone: "success", title: `${cand.name} اتعين`, description: "اتعمل له مستخدم (من غير رقم سري) وملف وعقد وقائمة استلام." });
      onClose();
    } catch (e) { toast({ tone: "error", title: "تعذر التعيين", description: err(e) }); } finally { setBusy(false); }
  };
  return (
    <Dialog open onClose={onClose} size="lg" title={`تعيين ${cand.name}`} footer={<div className="flex justify-end gap-2"><Button variant="ghost" onClick={onClose}>إلغاء</Button><Button loading={busy} icon={<UserCheck />} onClick={save}>تعيين</Button></div>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Sel label="الوظيفة" value={v.jobId} onChange={(x) => { const j = hrx.jobs.find((y) => y.id === x); setV({ ...v, jobId: x, ...(j && hrx.jobData(j).roleId ? { roleId: hrx.jobData(j).roleId! } : {}), ...(j && hrx.jobData(j).departmentId ? { departmentId: hrx.jobData(j).departmentId! } : {}) }); }} options={[{ value: "", label: "—" }, ...hrx.jobs.map((j) => ({ value: j.id, label: j.name }))]} />
        <Sel label="الدور (الصلاحيات)" value={v.roleId} onChange={(x) => setV({ ...v, roleId: x })} options={hrx.roles.map((r) => ({ value: r.id, label: r.name }))} />
        <Sel label="القسم" value={v.departmentId} onChange={(x) => setV({ ...v, departmentId: x })} options={[{ value: "", label: "—" }, ...hrx.departments.map((d) => ({ value: d.id, label: d.name }))]} />
        <Sel label="مكان العمل" value={v.branchId} onChange={(x) => setV({ ...v, branchId: x })} options={[{ value: "", label: "كل الفروع" }, ...hrx.branches.map((b) => ({ value: b.id, label: b.name.ar }))]} />
        <Input label="تاريخ البداية" type="date" dir="ltr" value={v.start} onChange={(e) => setV({ ...v, start: e.target.value })} />
        {hrx.may("hr.salary") || hrx.staff?.role === "owner" ? <Input label="الراتب في العقد" dir="ltr" inputMode="decimal" value={v.salary} onChange={(e) => setV({ ...v, salary: e.target.value })} hint={c.expected ? `المتوقع ${money(hrx, c.expected)}` : undefined} /> : null}
        <Sel label="قائمة الاستلام" value={v.onboardingId} onChange={(x) => setV({ ...v, onboardingId: x })} options={[{ value: "", label: "من غير قائمة" }, ...hrx.settings.onboarding.map((o) => ({ value: o.id, label: o.name }))]} />
      </div>
    </Dialog>
  );
}
