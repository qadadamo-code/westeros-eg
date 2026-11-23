/** التقييم والأداء: تقييم دوري لكل موظف بمعايير تحددها الإدارة وأوزانها، النتيجة والتقدير، نقاط وأهداف، وموظف الشهر. */
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Award, Crown, Plus, Trophy } from "lucide-react";
import type { HrDoc } from "@/data/hrDocTypes";
import { useDb } from "@/data/hooks";
import { Badge, Button, Card, CardHeader, Dialog, Input, Table, Textarea, useToast } from "@/ui";
import { cn } from "@/lib/cn";
import { useArea } from "../useAccess";
import { ExportButton } from "../ui";
import { Toolbar } from "../finance/ui";
import { K, activeOpts, dataOf, evalBand, evalTotal, type EvaluationData } from "./model";
import { saveDoc } from "./ops";
import { useHrx, type Hrx } from "./useHrx";
import { CustomInputs, dmy, err, MemberSelect, missingCustom, RowActions, useRemove } from "./ui";

export default function Evaluations() {
  const hrx = useHrx();
  const rights = useArea();
  const rm = useRemove();
  const [period, setPeriod] = useState(hrx.today.slice(0, 7));
  const [edit, setEdit] = useState<HrDoc | "new" | null>(null);
  const all = hrx.by(K.evaluation).filter((d) => hrx.visible.some((m) => m.id === d.memberId));
  const rows = useMemo(() => all.filter((d) => !period || dataOf<EvaluationData>(d).period === period).sort((a, b) => dataOf<EvaluationData>(b).total - dataOf<EvaluationData>(a).total), [all, period]);
  const best = rows[0];
  const year = (period || hrx.today).slice(0, 4);
  const ranking = useMemo(() => {
    const m = new Map<string, { sum: number; n: number }>();
    for (const d of all) { const x = dataOf<EvaluationData>(d); if (!x.period.startsWith(year) || !d.memberId) continue; const r = m.get(d.memberId) ?? { sum: 0, n: 0 }; r.sum += x.total; r.n++; m.set(d.memberId, r); }
    return [...m.entries()].map(([id, r]) => ({ id, avg: Math.round((r.sum / r.n) * 10) / 10, n: r.n, points: Math.round(r.sum / 10) })).sort((a, b) => b.avg - a.avg);
  }, [all, year]);
  const notYet = hrx.visible.filter((m) => m.active && period && !rows.some((d) => d.memberId === m.id));
  return (
    <div className="grid gap-5">
      <Toolbar actions={<>
        <ExportButton file={`التقييمات ${period}`} head={["الموظف", "الفترة", ...activeOpts(hrx.settings.criteria).map((c) => c.name), "النتيجة %", "التقدير", "المقيم"]} rows={() => rows.map((d) => { const x = dataOf<EvaluationData>(d); return [hrx.name(d.memberId), x.period, ...activeOpts(hrx.settings.criteria).map((c) => x.scores[c.id] ?? ""), x.total, evalBand(x.total).label, x.by]; })} />
        {rights.add ? <Button icon={<Plus />} onClick={() => setEdit("new")}>تقييم جديد</Button> : null}
      </>}>
        <Input label="الشهر" type="month" dir="ltr" value={period} onChange={(e) => setPeriod(e.target.value)} />
      </Toolbar>
      <div className="grid items-start gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader icon={<Crown />} title={`موظف الشهر ${period}`} />
          <div className="px-5 pb-5">
            {best ? <div className="grid justify-items-center gap-1 rounded-2xl bg-brass/10 p-4 text-center"><Trophy className="size-8 text-brass-text" /><Link to={`/hr/e/${best.memberId}`} className="text-[18px] font-bold hover:underline">{hrx.name(best.memberId)}</Link><Badge tone="brass">{dataOf<EvaluationData>(best).total}% {evalBand(dataOf<EvaluationData>(best).total).label}</Badge><span className="text-[13px] text-muted">{hrx.jobOf(best.memberId ?? "")?.name ?? ""}</span></div> : <p className="text-[13.5px] text-muted">مفيش تقييمات في الشهر ده.</p>}
            {notYet.length ? <p className="mt-3 text-[13px] text-muted">لسه ما اتقيموش ({notYet.length}): {notYet.slice(0, 12).map((m) => m.name).join("، ")}{notYet.length > 12 ? "…" : ""}</p> : null}
          </div>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader icon={<Award />} title={`تقييمات ${period || "كل الفترات"}`} />
          <Table rows={rows} rowKey={(d) => d.id} onRowClick={rights.edit ? setEdit : undefined} empty="مفيش تقييمات."
            columns={[
              { key: "n", header: "الموظف", cell: (d) => <span className="font-semibold">{hrx.name(d.memberId)}</span> },
              { key: "t", header: "النتيجة", cell: (d) => { const x = dataOf<EvaluationData>(d); const b = evalBand(x.total); return <span className="flex items-center gap-2"><span className="h-2 w-20 overflow-hidden rounded-full bg-surface-2"><span className="block h-full bg-brass" style={{ width: `${x.total}%` }} /></span><Badge size="sm" tone={b.tone}>{x.total}% {b.label}</Badge></span>; } },
              { key: "b", header: "المقيم", hideOnMobile: true, cell: (d) => `${dataOf<EvaluationData>(d).by} · ${dmy(d.date)}` },
              { key: "a", header: "", align: "end", cell: (d) => <RowActions onEdit={() => setEdit(d)} onDelete={() => rm.ask(d)} /> },
            ]} />
        </Card>
      </div>
      <Card>
        <CardHeader icon={<Trophy />} title={`ترتيب الأداء ${year}`} subtitle="متوسط التقييمات في السنة، والنقاط = مجموع النتائج ÷ 10." />
        <Table rows={ranking} rowKey={(r) => r.id} empty="مفيش تقييمات في السنة دي."
          columns={[{ key: "i", header: "#", width: "3rem", cell: (r) => ranking.indexOf(r) + 1 }, { key: "n", header: "الموظف", cell: (r) => hrx.name(r.id) }, { key: "a", header: "المتوسط", cell: (r) => <Badge size="sm" tone={evalBand(r.avg).tone}>{r.avg}%</Badge> }, { key: "c", header: "عدد التقييمات", align: "center", cell: (r) => r.n }, { key: "p", header: "النقاط", align: "center", cell: (r) => <b>{r.points}</b> }]} />
      </Card>
      {edit ? <EvalDialog hrx={hrx} row={edit === "new" ? null : edit} period={period || hrx.today.slice(0, 7)} onClose={() => setEdit(null)} /> : null}
      {rm.node}
    </div>
  );
}

export function EvalDialog({ hrx, row, period, onClose, memberId }: { hrx: Hrx; row: HrDoc | null; period: string; onClose: () => void; memberId?: string }) {
  const db = useDb();
  const { toast } = useToast();
  const x = row ? dataOf<EvaluationData>(row) : null;
  const crit = activeOpts(hrx.settings.criteria);
  const [v, setV] = useState({ memberId: row?.memberId ?? memberId ?? "", period: x?.period ?? period, scores: x?.scores ?? ({} as Record<string, number>), strengths: x?.strengths ?? "", improve: x?.improve ?? "", goals: x?.goals ?? "", custom: ((row?.data as { custom?: Record<string, string> })?.custom ?? {}) as Record<string, string> });
  const [busy, setBusy] = useState(false);
  const total = evalTotal(crit, v.scores);
  const band = evalBand(total);
  const save = async () => {
    if (!v.memberId) return toast({ tone: "error", title: "اختر الموظف" });
    if (crit.some((c) => v.scores[c.id] == null)) return toast({ tone: "error", title: "قيّم كل المعايير" });
    const miss = missingCustom(hrx.settings.customFields.evaluation, v.custom);
    if (miss) return toast({ tone: "error", title: `اكتب ${miss}` });
    if (!row && hrx.by(K.evaluation).some((d) => d.memberId === v.memberId && dataOf<EvaluationData>(d).period === v.period)) return toast({ tone: "error", title: "الموظف ده اتقيم في الشهر ده بالفعل" });
    setBusy(true);
    try { await saveDoc(db, row, { kind: K.evaluation, memberId: v.memberId, name: hrx.name(v.memberId), date: row?.date ?? hrx.today, data: { period: v.period, scores: v.scores, total, strengths: v.strengths, improve: v.improve, goals: v.goals, custom: v.custom, by: x?.by ?? hrx.staff?.name ?? "" } }); toast({ tone: "success", title: "تم حفظ التقييم" }); onClose(); }
    catch (e) { toast({ tone: "error", title: "تعذر الحفظ", description: err(e) }); } finally { setBusy(false); }
  };
  return (
    <Dialog open onClose={onClose} size="xl" title={row ? `تقييم ${row.name}` : "تقييم جديد"} footer={<div className="flex items-center justify-between gap-2"><Badge tone={band.tone}>{total}% {band.label}</Badge><div className="flex gap-2"><Button variant="ghost" onClick={onClose}>إلغاء</Button><Button loading={busy} onClick={save}>حفظ</Button></div></div>}>
      <div className="grid gap-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <MemberSelect hrx={hrx} value={v.memberId} onChange={(id) => setV({ ...v, memberId: id })} disabled={!!row} />
          <Input label="الشهر" type="month" dir="ltr" value={v.period} onChange={(e) => setV({ ...v, period: e.target.value })} />
        </div>
        <div className="grid gap-2">
          {crit.map((c) => (
            <div key={c.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-line p-2.5">
              <span className="grid min-w-40 flex-1"><span className="font-semibold">{c.name} <span className="text-[12px] text-muted">(وزن {c.weight})</span></span>{c.help ? <span className="text-[12px] text-muted">{c.help}</span> : null}</span>
              <span className="flex gap-1">{[0, 1, 2, 3, 4, 5].map((n) => <button key={n} type="button" onClick={() => setV({ ...v, scores: { ...v.scores, [c.id]: n } })} className={cn("size-9 rounded-lg border text-[14px] font-bold", v.scores[c.id] === n ? "border-brass bg-brass text-black" : "border-line")}>{n}</button>)}</span>
            </div>
          ))}
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <Textarea label="نقاط القوة" rows={3} value={v.strengths} onChange={(e) => setV({ ...v, strengths: e.target.value })} />
          <Textarea label="محتاج يتحسن في" rows={3} value={v.improve} onChange={(e) => setV({ ...v, improve: e.target.value })} />
          <Textarea label="أهداف الفترة الجاية" rows={3} value={v.goals} onChange={(e) => setV({ ...v, goals: e.target.value })} />
        </div>
        <div className="grid gap-3 sm:grid-cols-2"><CustomInputs fields={hrx.settings.customFields.evaluation} values={v.custom} onChange={(c) => setV({ ...v, custom: c })} /></div>
      </div>
    </Dialog>
  );
}
