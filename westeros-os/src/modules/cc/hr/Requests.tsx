/** الطلبات والموافقات: كل طلب بيمشي على خطوات نوعه بالترتيب (المدير المباشر، رئيس القسم، الموارد البشرية، دور أو موظف بعينه)، وأرصدة الإجازات. */
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Check, Inbox, Palmtree, Plus, X } from "lucide-react";
import type { HrDoc } from "@/data/hrDocTypes";
import { useDb } from "@/data/hooks";
import { Badge, Button, Card, CardHeader, Dialog, Input, Segmented, Table, Textarea, useToast } from "@/ui";
import { useArea } from "../useAccess";
import { ExportButton } from "../ui";
import { fromText, Toolbar } from "../finance/ui";
import { K, STEP_LABEL, activeOpts, dataOf, leaveUsed, mayDecide, requestState, spanDays, type DecisionData, type RequestData } from "./model";
import { decide, newRequest } from "./ops";
import { pendingFor } from "./usePending";
import { useHrx, type Hrx } from "./useHrx";
import { CustomInputs, dmy, err, MemberSelect, money, missingCustom, RowActions, Sel, useRemove } from "./ui";

export const REQ_STATUS: Record<string, { label: string; tone: "ok" | "danger" | "warn" | "neutral" }> = { pending: { label: "مستني", tone: "warn" }, approved: { label: "معتمد", tone: "ok" }, rejected: { label: "مرفوض", tone: "danger" }, cancelled: { label: "ملغي", tone: "neutral" } };

export default function Requests() {
  const hrx = useHrx();
  const rights = useArea();
  const rm = useRemove();
  const mine = pendingFor(hrx);
  const [tab, setTab] = useState<"me" | "all" | "leave">(mine.length ? "me" : "all");
  const [status, setStatus] = useState("");
  const [type, setType] = useState("");
  const [member, setMember] = useState("");
  const [open, setOpen] = useState<HrDoc | null>(null);
  const [adding, setAdding] = useState(false);
  const all = useMemo(() => hrx.by(K.request).filter((r) => hrx.visible.some((m) => m.id === r.memberId) && (!status || r.status === status) && (!type || dataOf<RequestData>(r).typeId === type) && (!member || r.memberId === member)).sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [hrx, status, type, member]);
  const rows = tab === "me" ? mine : all;
  const typeName = (r: HrDoc) => hrx.settings.requestTypes.find((t) => t.id === dataOf<RequestData>(r).typeId)?.name ?? r.name;
  return (
    <div className="grid gap-4">
      <Segmented label="الطلبات" value={tab} onChange={setTab} options={[{ value: "me", label: "مستني قراري", badge: mine.length || undefined }, { value: "all", label: "كل الطلبات" }, { value: "leave", label: "أرصدة الإجازات", icon: <Palmtree /> }]} />
      {tab === "leave" ? <Balances hrx={hrx} /> : (
        <>
          <Toolbar collapse actions={<>
            <ExportButton file="الطلبات" head={["رقم", "الموظف", "النوع", "من", "إلى", "المبلغ", "الحالة", "تاريخ الطلب"]} rows={() => rows.map((r) => { const d = dataOf<RequestData>(r); return [r.code, hrx.name(r.memberId), typeName(r), d.from ?? "", d.to ?? "", d.amount ? d.amount / 100000 : "", REQ_STATUS[r.status]?.label ?? r.status, r.date ?? ""]; })} />
            {rights.add ? <Button icon={<Plus />} onClick={() => setAdding(true)}>طلب لموظف</Button> : null}
          </>}>
            {tab === "all" ? <>
              <Sel label="الحالة" value={status} onChange={setStatus} options={[{ value: "", label: "الكل" }, ...Object.entries(REQ_STATUS).map(([value, s]) => ({ value, label: s.label }))]} />
              <Sel label="النوع" value={type} onChange={setType} options={[{ value: "", label: "كل الأنواع" }, ...hrx.settings.requestTypes.map((t) => ({ value: t.id, label: t.name }))]} />
              <MemberSelect hrx={hrx} label="الموظف" all="الكل" value={member} onChange={setMember} filter={() => true} />
            </> : null}
          </Toolbar>
          <Card>
            <Table rows={rows} rowKey={(r) => r.id} onRowClick={setOpen} empty={tab === "me" ? "مفيش طلبات مستنية قرارك." : "مفيش طلبات."}
              columns={[
                { key: "n", header: "الموظف", cell: (r) => <span className="font-semibold">{hrx.name(r.memberId)}</span> },
                { key: "t", header: "الطلب", cell: (r) => { const d = dataOf<RequestData>(r); return <span className="grid"><span>{typeName(r)}</span><span className="text-[12px] text-muted">{d.from ? `${dmy(d.from)}${d.to && d.to !== d.from ? ` ← ${dmy(d.to)} (${spanDays(d.from, d.to)} يوم)` : ""}` : ""}{d.amount ? ` ${money(hrx, d.amount)} ج.م` : ""}</span></span>; } },
                { key: "s", header: "وصل لفين", cell: (r) => <StepCell hrx={hrx} r={r} /> },
                { key: "d", header: "تاريخ الطلب", hideOnMobile: true, cell: (r) => dmy(r.date) },
                { key: "a", header: "", align: "end", cell: (r) => <RowActions onDelete={() => rm.ask(r)} /> },
              ]} />
          </Card>
        </>
      )}
      {open ? <RequestDialog hrx={hrx} r={open} onClose={() => setOpen(null)} /> : null}
      {adding ? <NewRequestDialog hrx={hrx} onClose={() => setAdding(false)} /> : null}
      {rm.node}
    </div>
  );
}

function StepCell({ hrx, r }: { hrx: Hrx; r: HrDoc }) {
  const type = hrx.settings.requestTypes.find((t) => t.id === dataOf<RequestData>(r).typeId);
  const st = requestState(type, hrx.by(K.decision).filter((d) => dataOf<DecisionData>(d).requestId === r.id));
  const s = REQ_STATUS[r.status] ?? REQ_STATUS.pending;
  if (r.status !== "pending") return <Badge size="sm" tone={s.tone}>{s.label}</Badge>;
  const step = type?.steps[st.step];
  return <span className="grid"><Badge size="sm" tone="warn">مستني {step ? STEP_LABEL(step, hrx.roleName, hrx.name) : ""}</Badge><span className="text-[11.5px] text-muted">خطوة {st.step + 1} من {type?.steps.length ?? 1}</span></span>;
}

function RequestDialog({ hrx, r, onClose }: { hrx: Hrx; r: HrDoc; onClose: () => void }) {
  const db = useDb();
  const { toast } = useToast();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const d = dataOf<RequestData>(r);
  const type = hrx.settings.requestTypes.find((t) => t.id === d.typeId);
  const decisions = hrx.by(K.decision).filter((x) => dataOf<DecisionData>(x).requestId === r.id).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const st = requestState(type, decisions);
  const can = r.status === "pending" && !!hrx.staff && mayDecide(type?.steps[st.step], r.memberId ?? "", hrx.staff, hrx.ctx);
  const go = async (ok: boolean) => { setBusy(true); try { const after = await decide(db, hrx, r, ok, note); toast({ tone: "success", title: ok ? (after.status === "approved" ? "الطلب اتعتمد" : "اتوافق على الخطوة واتبعت للخطوة اللي بعدها") : "الطلب اترفض" }); onClose(); } catch (e) { toast({ tone: "error", title: "تعذر", description: err(e) }); } finally { setBusy(false); } };
  const used = type?.leaveTypeId && r.memberId ? leaveUsed(hrx.by(K.request), hrx.settings.requestTypes, r.memberId, (d.from ?? hrx.today).slice(0, 4)).get(type.leaveTypeId) ?? 0 : null;
  const lt = hrx.settings.leaveTypes.find((l) => l.id === type?.leaveTypeId);
  return (
    <Dialog open onClose={onClose} size="lg" title={`${type?.name ?? r.name}: ${hrx.name(r.memberId)}`}
      footer={can ? <div className="flex justify-end gap-2"><Button variant="danger-soft" icon={<X />} loading={busy} onClick={() => go(false)}>رفض</Button><Button icon={<Check />} loading={busy} onClick={() => go(true)}>موافقة</Button></div> : undefined}>
      <div className="grid gap-3 text-[14.5px]">
        <div className="grid gap-1 rounded-xl border border-line p-3">
          {d.from ? <p>التاريخ: {dmy(d.from)}{d.to && d.to !== d.from ? ` إلى ${dmy(d.to)} (${spanDays(d.from, d.to)} يوم)` : ""}</p> : null}
          {d.amount ? <p>المبلغ: {money(hrx, d.amount)} ج.م</p> : null}
          {d.text ? <p className="whitespace-pre-wrap">{d.text}</p> : null}
          {Object.entries(d.custom ?? {}).filter(([, x]) => x).map(([k, x]) => <p key={k}>{hrx.settings.customFields.request?.find((f) => f.id === k)?.label ?? k}: {x}</p>)}
          {lt && used != null ? <p className="text-muted">رصيد {lt.name}: {lt.days} يوم، المستخدم المعتمد {used}، الباقي {lt.days - used}</p> : null}
          <p className="text-[12.5px] text-muted">اتقدم {dmy(r.date)}{d.by && d.by !== hrx.name(r.memberId) ? ` بواسطة ${d.by}` : ""} · <Link to={`/hr/e/${r.memberId}`} className="underline">ملف الموظف</Link></p>
        </div>
        <div className="grid gap-1.5">
          <span className="text-[13px] font-semibold">خطوات الموافقة</span>
          {(type?.steps ?? []).map((s, i) => {
            const dec = decisions.map((x) => dataOf<DecisionData>(x)).find((x) => x.step === i);
            return <div key={i} className="flex flex-wrap items-center gap-2 rounded-lg border border-line px-3 py-1.5"><span>{i + 1}. {STEP_LABEL(s, hrx.roleName, hrx.name)}</span><span className="flex-1" />{dec ? <><Badge size="sm" tone={dec.ok ? "ok" : "danger"}>{dec.ok ? "وافق" : "رفض"}</Badge><span className="text-[12.5px] text-muted">{dec.by}{dec.note ? `: ${dec.note}` : ""}</span></> : i === st.step && r.status === "pending" ? <Badge size="sm" tone="warn">دلوقتي</Badge> : <span className="text-[12.5px] text-muted">—</span>}</div>;
          })}
          {type?.note ? <p className="text-[12.5px] text-muted">{type.note}</p> : null}
        </div>
        {can ? <Textarea label="ملاحظة على القرار" rows={2} value={note} onChange={(e) => setNote(e.target.value)} /> : r.status === "pending" ? <p className="text-[13px] text-muted">الخطوة دي مش ليك.</p> : null}
      </div>
    </Dialog>
  );
}

export function NewRequestDialog({ hrx, onClose, self }: { hrx: Hrx; onClose: () => void; self?: boolean }) {
  const db = useDb();
  const { toast } = useToast();
  const types = activeOpts(hrx.settings.requestTypes);
  const [v, setV] = useState({ memberId: self ? hrx.staff?.id ?? "" : "", typeId: types[0]?.id ?? "", from: "", to: "", amount: "", text: "", custom: {} as Record<string, string> });
  const [busy, setBusy] = useState(false);
  const type = types.find((t) => t.id === v.typeId);
  const save = async () => {
    if (!v.memberId) return toast({ tone: "error", title: "اختر الموظف" });
    const miss = missingCustom(hrx.settings.customFields.request, v.custom);
    if (miss) return toast({ tone: "error", title: `اكتب ${miss}` });
    setBusy(true);
    try { await newRequest(db, hrx, v.memberId, { typeId: v.typeId, from: v.from || null, to: v.to || v.from || null, amount: fromText(v.amount), text: v.text.trim(), custom: v.custom }); toast({ tone: "success", title: "الطلب اتبعت" }); onClose(); }
    catch (e) { toast({ tone: "error", title: "تعذر الإرسال", description: err(e) }); } finally { setBusy(false); }
  };
  const lt = hrx.settings.leaveTypes.find((l) => l.id === type?.leaveTypeId);
  const used = lt && v.memberId ? leaveUsed(hrx.by(K.request), hrx.settings.requestTypes, v.memberId, (v.from || hrx.today).slice(0, 4)).get(lt.id) ?? 0 : 0;
  return (
    <Dialog open onClose={onClose} size="lg" title={self ? "طلب جديد" : "طلب لموظف"} footer={<div className="flex justify-end gap-2"><Button variant="ghost" onClick={onClose}>إلغاء</Button><Button loading={busy} onClick={save}>إرسال</Button></div>}>
      <div className="grid gap-3 sm:grid-cols-2">
        {self ? null : <MemberSelect hrx={hrx} value={v.memberId} onChange={(x) => setV({ ...v, memberId: x })} />}
        <Sel label="نوع الطلب" value={v.typeId} onChange={(x) => setV({ ...v, typeId: x })} options={types.map((t) => ({ value: t.id, label: t.name }))} />
        {type?.dates ? <><Input label="من" type="date" dir="ltr" value={v.from} onChange={(e) => setV({ ...v, from: e.target.value })} /><Input label="إلى" type="date" dir="ltr" value={v.to} onChange={(e) => setV({ ...v, to: e.target.value })} hint={v.from ? `${spanDays(v.from, v.to || v.from)} يوم` : undefined} /></> : null}
        {type?.money ? <Input label="المبلغ" dir="ltr" inputMode="decimal" value={v.amount} onChange={(e) => setV({ ...v, amount: e.target.value })} /> : null}
        <div className="sm:col-span-2"><Textarea label="التفاصيل" rows={3} value={v.text} onChange={(e) => setV({ ...v, text: e.target.value })} /></div>
        <CustomInputs fields={hrx.settings.customFields.request} values={v.custom} onChange={(c) => setV({ ...v, custom: c })} />
        {lt ? <p className="text-[13px] text-muted sm:col-span-2">رصيد {lt.name}: {lt.days} يوم، المستخدم {used}، الباقي {lt.days - used}</p> : null}
        {type?.steps.length ? <p className="text-[12.5px] text-muted sm:col-span-2">بيتبعت لـ: {type.steps.map((s) => STEP_LABEL(s, hrx.roleName, hrx.name)).join(" ← ")}</p> : null}
        {type?.note ? <p className="text-[12.5px] text-muted sm:col-span-2">{type.note}</p> : null}
      </div>
    </Dialog>
  );
}

function Balances({ hrx }: { hrx: Hrx }) {
  const year = hrx.today.slice(0, 4);
  const types = activeOpts(hrx.settings.leaveTypes).filter((l) => l.days > 0);
  const reqs = hrx.by(K.request);
  const people = hrx.visible.filter((m) => m.active);
  return (
    <Card>
      <CardHeader icon={<Inbox />} title={`أرصدة الإجازات ${year}`} subtitle="الرصيد السنوي من الإعدادات ناقص الإجازات المعتمدة. الأيام المستخدمة / الرصيد." action={<ExportButton size="sm" file={`أرصدة الإجازات ${year}`} head={["الموظف", ...types.map((t) => `${t.name} (مستخدم)`), ...types.map((t) => `${t.name} (باقي)`)]} rows={() => people.map((m) => { const u = leaveUsed(reqs, hrx.settings.requestTypes, m.id, year); return [m.name, ...types.map((t) => u.get(t.id) ?? 0), ...types.map((t) => t.days - (u.get(t.id) ?? 0))]; })} />} />
      <Table rows={people} rowKey={(m) => m.id} empty="مفيش موظفين."
        columns={[{ key: "n", header: "الموظف", cell: (m) => m.name }, ...types.map((t) => ({ key: t.id, header: t.name, align: "center" as const, cell: (m: (typeof people)[number]) => { const u = leaveUsed(reqs, hrx.settings.requestTypes, m.id, year).get(t.id) ?? 0; return <span className={u > t.days ? "font-bold text-danger" : ""}>{u} / {t.days}</span>; } }))]} />
    </Card>
  );
}
