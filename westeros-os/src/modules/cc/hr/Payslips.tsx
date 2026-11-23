/** قسائم الرواتب: كشوف الرواتب من الحسابات بتتنشر قسائم، وكل موظف بيشوف قسيمته على صفحته. */
import { useState } from "react";
import { Send, Wallet } from "lucide-react";
import { useDb, useLive } from "@/data/hooks";
import { Badge, Button, Card, CardHeader, Table, useToast } from "@/ui";
import { useArea } from "../useAccess";
import { PAYROLL, payrollOf } from "../finance/payroll";
import { K, dataOf, type PayslipData } from "./model";
import { publishPayslips } from "./ops";
import { useHrx } from "./useHrx";
import { err, money, RowActions, useRemove } from "./ui";

export default function Payslips() {
  const hrx = useHrx();
  const db = useDb();
  const { toast } = useToast();
  const rights = useArea();
  const rm = useRemove();
  const runs = useLive("finDocs", { where: { kind: PAYROLL } }).data.filter((d) => d.status !== "cancelled").sort((a, b) => payrollOf(b).month.localeCompare(payrollOf(a).month));
  const slips = hrx.by(K.payslip).sort((a, b) => dataOf<PayslipData>(b).month.localeCompare(dataOf<PayslipData>(a).month) || a.name.localeCompare(b.name, "ar"));
  const [busy, setBusy] = useState<string | null>(null);
  const linked = new Set([...hrx.fileRows.values()].map((r) => (r.data as { finEmployeeId?: string }).finEmployeeId).filter(Boolean));
  return (
    <div className="grid gap-5">
      <Card>
        <CardHeader icon={<Wallet />} title="كشوف الرواتب في الحسابات" subtitle="انشر الكشف عشان كل موظف يشوف قسيمته (الأساسي والإضافي والحوافز والخصومات والصافي) على صفحته. الموظف لازم يكون مربوط بموظف الرواتب من ملفه." />
        <Table rows={runs} rowKey={(d) => d.id} empty="مفيش كشوف رواتب في الحسابات لسه."
          columns={[
            { key: "m", header: "الشهر", cell: (d) => <span className="font-semibold">{payrollOf(d).month}</span> },
            { key: "n", header: "الموظفين", cell: (d) => { const l = payrollOf(d).lines; const n = l.filter((x) => linked.has(x.employeeId)).length; return `${l.length} (${n} مربوط)`; } },
            { key: "net", header: "صافي الكشف", align: "end", cell: (d) => money(hrx, payrollOf(d).net) },
            { key: "p", header: "منشور", cell: (d) => { const n = slips.filter((s) => dataOf<PayslipData>(s).payrollId === d.id).length; return n ? <Badge size="sm" tone="ok">{n} قسيمة</Badge> : <Badge size="sm">لأ</Badge>; } },
            { key: "a", header: "", align: "end", cell: (d) => rights.add ? <Button size="sm" variant="outline" icon={<Send />} loading={busy === d.id} onClick={async () => { setBusy(d.id); try { const n = await publishPayslips(db, hrx, d); toast({ tone: n ? "success" : "error", title: n ? `اتنشرت ${n} قسيمة` : "مفيش موظفين مربوطين في الكشف ده" }); } catch (e) { toast({ tone: "error", title: "تعذر النشر", description: err(e) }); } finally { setBusy(null); } }}>نشر القسائم</Button> : null },
          ]} />
      </Card>
      <Card>
        <CardHeader title="القسائم المنشورة" />
        <Table rows={slips} rowKey={(d) => d.id} empty="مفيش قسائم منشورة."
          columns={[
            { key: "m", header: "الشهر", cell: (d) => dataOf<PayslipData>(d).month },
            { key: "n", header: "الموظف", cell: (d) => d.name },
            { key: "g", header: "الإجمالي", align: "end", cell: (d) => money(hrx, dataOf<PayslipData>(d).gross) },
            { key: "net", header: "الصافي", align: "end", cell: (d) => <b>{money(hrx, dataOf<PayslipData>(d).net)}</b> },
            { key: "a", header: "", align: "end", cell: (d) => <RowActions onDelete={() => rm.ask(d)} /> },
          ]} />
      </Card>
      {rm.node}
    </div>
  );
}
