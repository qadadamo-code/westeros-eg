/** العقود والمستندات: العقود وتجديدها وطباعتها، وتنبيهات العقود والمستندات وفترات التجربة اللي قربت تخلص أو خلصت. */
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { BellRing, FileSignature, Plus, Printer, RefreshCw } from "lucide-react";
import type { HrDoc } from "@/data/hrDocTypes";
import { Badge, Button, Card, CardHeader, IconButton, Table } from "@/ui";
import { useArea } from "../useAccess";
import { ExportButton } from "../ui";
import { esc, printDoc, Toolbar } from "../finance/ui";
import { K, addDays, dataOf, daysBetween, expiries, optName, type ContractData } from "./model";
import { saveDoc } from "./ops";
import { useHrx, type Hrx } from "./useHrx";
import { DocDialog, dmy, money, RowActions, Sel, useRemove } from "./ui";

export function alertsOf(hrx: Hrx) {
  const items: { memberId: string; what: string; date: string | null }[] = [];
  for (const m of hrx.visible) {
    if (!m.active) continue;
    const f = hrx.fileOfMember(m.id);
    if (f.empStatus === "probation" && f.probationEnd) items.push({ memberId: m.id, what: "نهاية فترة التجربة", date: f.probationEnd });
    for (const d of hrx.profileBy.get(m.id)?.documents ?? []) if (d.expiresAt) items.push({ memberId: m.id, what: optName(hrx.settings.docTypes, d.kind, d.kind), date: d.expiresAt });
  }
  for (const c of hrx.by(K.contract)) if (c.status === "active" && c.memberId && hrx.memberById.get(c.memberId)?.active) items.push({ memberId: c.memberId, what: "انتهاء العقد", date: dataOf<ContractData>(c).end });
  return expiries(items, hrx.today, hrx.settings.alertDays);
}

export default function Contracts() {
  const hrx = useHrx();
  const rights = useArea();
  const rm = useRemove();
  const [status, setStatus] = useState("active");
  const [edit, setEdit] = useState<{ row: HrDoc | null; renew?: HrDoc } | null>(null);
  const rows = useMemo(() => hrx.by(K.contract).filter((c) => (!status || c.status === status) && hrx.visible.some((m) => m.id === c.memberId)).sort((a, b) => (b.date ?? "").localeCompare(a.date ?? "")), [hrx, status]);
  const alerts = alertsOf(hrx);
  const print = (c: HrDoc) => {
    const d = dataOf<ContractData>(c);
    const p = hrx.profileBy.get(c.memberId ?? "");
    printDoc(`عقد ${c.name}`, `<h1>عقد عمل</h1><div class="row"><span>رقم العقد: ${esc(c.code)}</span><span>التاريخ: ${dmy(c.date)}</span></div>
      <div class="box"><div class="row"><span class="lbl">الموظف</span><b>${esc(c.name)}</b></div><div class="row"><span class="lbl">الرقم القومي</span><span>${esc(p?.nationalId ?? "")}</span></div>
      <div class="row"><span class="lbl">الوظيفة</span><span>${esc(hrx.jobOf(c.memberId ?? "")?.name ?? p?.position.ar ?? "")}</span></div><div class="row"><span class="lbl">نوع العقد</span><span>${esc(optName(hrx.settings.contractTypes, d.typeId))}</span></div>
      <div class="row"><span class="lbl">المدة</span><span>من ${dmy(d.start)} إلى ${d.end ? dmy(d.end) : "غير محدد"}</span></div><div class="row"><span class="lbl">فترة التجربة حتى</span><span>${dmy(d.probationEnd)}</span></div>
      <div class="row"><span class="lbl">الأجر الشهري</span><b>${money(hrx, d.salary)} ج.م</b></div><div class="row"><span class="lbl">ساعات العمل اليومية</span><span>${d.hours || ""}</span></div></div>
      <p style="white-space:pre-wrap">${esc(d.terms)}</p><div class="sign"><span>الطرف الأول (صاحب العمل)</span><span>الطرف الثاني (الموظف)</span></div>`);
  };
  return (
    <div className="grid gap-5">
      <Card>
        <CardHeader icon={<BellRing />} title="تنبيهات" subtitle={`العقود والمستندات وفترات التجربة اللي خلصت أو هتخلص خلال ${hrx.settings.alertDays} يوم`} />
        <ul className="grid gap-1.5 px-5 pb-5">
          {alerts.map((a, i) => (
            <li key={i} className="flex flex-wrap items-center gap-2 rounded-xl border border-line px-3 py-2 text-[14px]">
              <Link to={`/hr/e/${a.memberId}`} className="font-semibold underline">{hrx.name(a.memberId)}</Link><span>{a.what}</span><span className="text-muted">{dmy(a.date)}</span>
              <span className="flex-1" /><Badge size="sm" tone={a.left < 0 ? "danger" : "warn"}>{a.left < 0 ? `خلص من ${-a.left} يوم` : a.left === 0 ? "النهارده" : `باقي ${a.left} يوم`}</Badge>
            </li>
          ))}
          {alerts.length ? null : <li className="text-[13.5px] text-muted">مفيش تنبيهات.</li>}
        </ul>
      </Card>
      <Toolbar actions={<>
        <ExportButton file="العقود" head={["رقم", "الموظف", "النوع", "من", "إلى", "نهاية التجربة", "الراتب", "الحالة"]} rows={() => rows.map((c) => { const d = dataOf<ContractData>(c); return [c.code, c.name, optName(hrx.settings.contractTypes, d.typeId), d.start, d.end ?? "", d.probationEnd ?? "", money(hrx, d.salary), c.status]; })} />
        {rights.add ? <Button icon={<Plus />} onClick={() => setEdit({ row: null })}>عقد جديد</Button> : null}
      </>}>
        <Sel label="الحالة" value={status} onChange={setStatus} options={[{ value: "active", label: "سارية" }, { value: "renewed", label: "اتجددت" }, { value: "ended", label: "منتهية" }, { value: "", label: "الكل" }]} />
      </Toolbar>
      <Card>
        <CardHeader icon={<FileSignature />} title="العقود" />
        <Table rows={rows} rowKey={(c) => c.id} empty="مفيش عقود."
          columns={[
            { key: "n", header: "الموظف", cell: (c) => <Link to={`/hr/e/${c.memberId}`} className="font-semibold hover:underline">{c.name}</Link> },
            { key: "t", header: "النوع", cell: (c) => optName(hrx.settings.contractTypes, dataOf<ContractData>(c).typeId) },
            { key: "p", header: "المدة", cell: (c) => { const d = dataOf<ContractData>(c); return `${dmy(d.start)} ← ${d.end ? dmy(d.end) : "مفتوح"}`; } },
            { key: "l", header: "الباقي", hideOnMobile: true, cell: (c) => { const e = dataOf<ContractData>(c).end; if (!e || c.status !== "active") return "—"; const l = daysBetween(hrx.today, e); return <Badge size="sm" tone={l < 0 ? "danger" : l <= hrx.settings.alertDays ? "warn" : "ok"}>{l < 0 ? "خلص" : `${l} يوم`}</Badge>; } },
            { key: "s", header: "الراتب", align: "end", hideOnMobile: true, cell: (c) => money(hrx, dataOf<ContractData>(c).salary) },
            { key: "st", header: "الحالة", cell: (c) => <Badge size="sm" tone={c.status === "active" ? "ok" : "neutral"}>{c.status === "active" ? "ساري" : c.status === "renewed" ? "اتجدد" : "منتهي"}</Badge> },
            { key: "a", header: "", align: "end", cell: (c) => <RowActions onEdit={() => setEdit({ row: c })} onDelete={() => rm.ask(c)}>
              <IconButton label="طباعة" size="sm" onClick={() => print(c)}><Printer /></IconButton>
              {rights.add && c.status === "active" ? <IconButton label="تجديد" size="sm" onClick={() => setEdit({ row: null, renew: c })}><RefreshCw /></IconButton> : null}
            </RowActions> },
          ]} />
      </Card>
      {edit ? <ContractDialog hrx={hrx} row={edit.row} renew={edit.renew} onClose={() => setEdit(null)} /> : null}
      {rm.node}
    </div>
  );
}

export function ContractDialog({ hrx, row, renew, memberId, onClose }: { hrx: Hrx; row: HrDoc | null; renew?: HrDoc; memberId?: string; onClose: () => void }) {
  const old = renew ? dataOf<ContractData>(renew) : null;
  const start = old?.end ? addDays(old.end, 1) : hrx.today;
  const span = old?.end ? daysBetween(old.start, old.end) : 365;
  return (
    <DocDialog hrx={hrx} kind={K.contract} row={row} title={renew ? `تجديد عقد ${renew.name}` : row ? "تعديل عقد" : "عقد جديد"} onClose={onClose} size="xl"
      defaults={{ memberId: renew?.memberId ?? memberId ?? null, date: start, status: "active", typeId: old?.typeId ?? hrx.settings.contractTypes[0]?.id ?? "", start, end: old?.end ? addDays(start, span) : null, probationEnd: renew ? null : addDays(hrx.today, hrx.settings.probationDays), salary: old?.salary ?? 0, hours: old?.hours ?? 8, terms: old?.terms ?? "", renewedFrom: renew?.id ?? null }}
      check={(v) => (v.end && v.start && String(v.end) < String(v.start) ? "نهاية العقد قبل بدايته" : "")}
      after={async (_saved, _v, db) => { if (renew) await saveDoc(db, renew, { kind: K.contract, status: "renewed", data: {} }); }}
      fields={[
        { key: "memberId", label: "الموظف", type: "member", required: true },
        { key: "typeId", label: "نوع العقد", type: "select", required: true, options: hrx.settings.contractTypes.filter((t) => t.active !== false).map((t) => ({ value: t.id, label: t.name })) },
        { key: "start", label: "بداية العقد", type: "date", required: true },
        { key: "end", label: "نهاية العقد", type: "date", hint: "سيبها فاضية للعقد المفتوح" },
        { key: "probationEnd", label: "نهاية فترة التجربة", type: "date" },
        { key: "date", label: "تاريخ التوقيع", type: "date" },
        ...(hrx.may("hr.salary") || hrx.staff?.role === "owner" ? [{ key: "salary", label: "الأجر الشهري", type: "money" as const }] : []),
        { key: "hours", label: "ساعات العمل اليومية", type: "number" },
        { key: "status", label: "الحالة", type: "select", options: [{ value: "active", label: "ساري" }, { value: "renewed", label: "اتجدد" }, { value: "ended", label: "منتهي" }] },
        { key: "terms", label: "بنود العقد", type: "textarea" },
      ]} />
  );
}
