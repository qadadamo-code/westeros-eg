/** تقارير الموارد البشرية: التوزيع على الأقسام والوظائف والفروع، الدوران الوظيفي، تكلفة العمالة كنسبة من المبيعات، الإجازات، الجزاءات، التقييم والتدريب. */
import { useMemo, useState } from "react";
import { useLive } from "@/data/hooks";
import { Card, CardHeader, Input, Table } from "@/ui";
import { BarList } from "@/modules/marketing/ui";
import { ExportButton } from "../ui";
import { PAYROLL, payrollOf, payrollTotals } from "../finance/payroll";
import { K, dataOf, leaveUsed, turnover, type EvaluationData, type ExitData, type ProgressData, type WarningData } from "./model";
import { useHrx } from "./useHrx";
import { Kpi, money } from "./ui";

export default function Reports() {
  const hrx = useHrx();
  const [year, setYear] = useState(hrx.today.slice(0, 4));
  const payrolls = useLive("finDocs", { where: { kind: PAYROLL } }).data.filter((d) => d.status !== "cancelled");
  const accounts = useLive("finAccounts").data;
  const entries = useLive("finEntries").data;
  const active = hrx.visible.filter((m) => m.active);
  const count = (key: (id: string) => string) => { const m = new Map<string, number>(); for (const x of active) { const k = key(x.id); m.set(k, (m.get(k) ?? 0) + 1); } return [...m.entries()].map(([label, value]) => ({ key: label, label, value })).sort((a, b) => b.value - a.value); };
  const byDept = count((id) => hrx.deptOf(id)?.name ?? "من غير قسم");
  const byJob = count((id) => hrx.jobOf(id)?.name ?? hrx.profileBy.get(id)?.position.ar ?? "من غير وظيفة");
  const byBranch = count((id) => hrx.workplace(hrx.memberById.get(id)!));
  const left = hrx.by(K.exit).filter((d) => dataOf<ExitData>(d).lastDay.startsWith(year));
  const hiredIn = hrx.members.filter((m) => (hrx.profileBy.get(m.id)?.hireDate ?? "").startsWith(year));
  const startCount = active.length + left.length - hiredIn.filter((m) => m.active).length;
  const rate = turnover(left.length, Math.max(0, startCount), active.length);
  const reasons = (() => { const m = new Map<string, number>(); for (const d of left) { const r = hrx.settings.exitReasons.find((x) => x.id === dataOf<ExitData>(d).reasonId)?.name ?? "—"; m.set(r, (m.get(r) ?? 0) + 1); } return [...m.entries()].map(([label, value]) => ({ key: label, label, value })); })();
  const revenueIds = useMemo(() => new Set(accounts.filter((a) => a.type === "revenue").map((a) => a.id)), [accounts]);
  const months = Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, "0")}`);
  const labour = months.map((mo) => {
    const cost = payrolls.filter((p) => payrollOf(p).month === mo).reduce((s, p) => s + payrollTotals(payrollOf(p).lines).cost, 0);
    const sales = entries.filter((e) => e.status === "posted" && e.date.startsWith(mo)).reduce((s, e) => s + e.lines.reduce((t, l) => t + (revenueIds.has(l.account) ? l.credit - l.debit : 0), 0), 0);
    return { mo, cost, sales, pct: sales > 0 ? Math.round((cost / sales) * 1000) / 10 : null };
  }).filter((r) => r.cost || r.sales);
  const reqs = hrx.by(K.request);
  const leave = hrx.settings.leaveTypes.map((t) => ({ key: t.id, label: t.name, value: active.reduce((s, m) => s + (leaveUsed(reqs, hrx.settings.requestTypes, m.id, year).get(t.id) ?? 0), 0) })).filter((x) => x.value);
  const warnings = hrx.by(K.warning).filter((w) => w.status !== "cancelled" && (w.date ?? "").startsWith(year));
  const byViol = hrx.settings.violations.map((v) => ({ key: v.id, label: v.name, value: warnings.filter((w) => dataOf<WarningData>(w).violationId === v.id).length })).filter((x) => x.value);
  const evals = hrx.by(K.evaluation).filter((d) => dataOf<EvaluationData>(d).period.startsWith(year));
  const evalDept = hrx.departments.map((d) => { const e = evals.filter((x) => hrx.fileOfMember(x.memberId).departmentId === d.id); return { key: d.id, label: d.name, value: e.length ? Math.round(e.reduce((s, x) => s + dataOf<EvaluationData>(x).total, 0) / e.length) : 0 }; }).filter((x) => x.value);
  const prog = hrx.by(K.progress);
  const trained = prog.filter((p) => dataOf<ProgressData>(p).passed).length;
  return (
    <div className="grid gap-5">
      <div className="flex items-end gap-2"><Input label="السنة" dir="ltr" wrapClassName="w-28" value={year} onChange={(e) => setYear(e.target.value)} /></div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi label="الموظفين الحاليين" value={active.length} />
        <Kpi label={`تعيينات ${year}`} value={hiredIn.length} tone="ok" />
        <Kpi label={`تركوا ${year}`} value={left.length} tone={left.length ? "warn" : "neutral"} />
        <Kpi label="معدل الدوران الوظيفي" value={`${rate}%`} sub="اللي تركوا ÷ متوسط عدد الموظفين" tone={rate > 30 ? "danger" : "neutral"} />
        <Kpi label={`مخالفات ${year}`} value={warnings.length} />
        <Kpi label={`تقييمات ${year}`} value={evals.length} />
        <Kpi label="نسبة إتمام التدريب" value={prog.length ? `${Math.round((trained / prog.length) * 100)}%` : "—"} sub={`${trained} من ${prog.length}`} />
        <Kpi label="طلبات معتمدة" value={reqs.filter((r) => r.status === "approved" && (r.date ?? "").startsWith(year)).length} />
      </div>
      <div className="grid items-start gap-5 lg:grid-cols-3">
        <Card><CardHeader title="الموظفين حسب القسم" /><div className="px-5 pb-5"><BarList rows={byDept} /></div></Card>
        <Card><CardHeader title="حسب الوظيفة" /><div className="px-5 pb-5"><BarList rows={byJob} /></div></Card>
        <Card><CardHeader title="حسب مكان العمل" /><div className="px-5 pb-5"><BarList rows={byBranch} /></div></Card>
        <Card><CardHeader title="أسباب ترك العمل" /><div className="px-5 pb-5">{reasons.length ? <BarList rows={reasons} /> : <p className="text-[13px] text-muted">مفيش.</p>}</div></Card>
        <Card><CardHeader title="أيام الإجازات المعتمدة حسب النوع" /><div className="px-5 pb-5">{leave.length ? <BarList rows={leave} /> : <p className="text-[13px] text-muted">مفيش.</p>}</div></Card>
        <Card><CardHeader title="المخالفات حسب النوع" /><div className="px-5 pb-5">{byViol.length ? <BarList rows={byViol} /> : <p className="text-[13px] text-muted">مفيش.</p>}</div></Card>
        <Card><CardHeader title="متوسط التقييم حسب القسم" /><div className="px-5 pb-5">{evalDept.length ? <BarList rows={evalDept} format={(v) => `${v}%`} /> : <p className="text-[13px] text-muted">مفيش.</p>}</div></Card>
      </div>
      <Card>
        <CardHeader title={`تكلفة العمالة كنسبة من المبيعات ${year}`} subtitle="التكلفة من كشوف الرواتب (الإجمالي + تأمينات الشركة)، والمبيعات من حسابات الإيرادات في القيود المرحلة." action={<ExportButton size="sm" file={`تكلفة العمالة ${year}`} head={["الشهر", "تكلفة العمالة", "المبيعات", "النسبة %"]} rows={() => labour.map((r) => [r.mo, r.cost / 100000, r.sales / 100000, r.pct ?? ""])} />} />
        <Table rows={labour} rowKey={(r) => r.mo} empty="مفيش كشوف رواتب أو مبيعات في السنة دي."
          columns={[{ key: "m", header: "الشهر", cell: (r) => r.mo }, { key: "c", header: "تكلفة العمالة", align: "end", cell: (r) => money(hrx, r.cost) }, { key: "s", header: "المبيعات", align: "end", cell: (r) => money(hrx, r.sales) }, { key: "p", header: "النسبة", align: "end", cell: (r) => (r.pct == null ? "—" : <b className={r.pct > 30 ? "text-danger" : ""}>{r.pct}%</b>) }]} />
      </Card>
    </div>
  );
}
