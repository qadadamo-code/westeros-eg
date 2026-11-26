/** التشغيل > اعدادات التشغيل (Saqr 2026-11-25): the branch's printing setup, moved out of ثوابت النظام. */
import { useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import { useSession } from "@/auth/session";
import { useLive } from "@/data/hooks";
import { PageHeader } from "@/shell/PageHeader";
import { Card, EmptyState, Select, Skeleton } from "@/ui";
import OpsConstants from "../constants/OpsConstants";
import { AreaGate, useArea } from "../useAccess";

export default function OpsSettingsPage() {
  const { branchId, branches } = useSession();
  const [branch, setBranch] = useState(branchId ?? branches[0]?.id ?? "");
  // الفرع فوق في نفس مكان زر المنيو (Saqr 2026-11-26)
  const picker = branches.length > 1 ? (
    <div className="w-48"><Select aria-label="الفرع" value={branch} onChange={(e) => setBranch(e.target.value)} options={branches.map((b) => ({ value: b.id, label: b.isCentral ? `${b.name.ar} (مطبخ مركزي)` : b.name.ar }))} /></div>
  ) : null;
  return (
    <div className="grid gap-5">
      <PageHeader icon={<SlidersHorizontal />} title="اعدادات التشغيل" subtitle="الطابعات وشكل الفاتورة وطلبية المطبخ ومحطة الطباعة، لكل فرع لوحده" actions={picker} />
      <AreaGate id="ops.settings"><Body branch={branch} /></AreaGate>
    </div>
  );
}

function Body({ branch }: { branch: string }) {
  const settings = useLive("mfgSettings");
  const readOnly = !useArea().edit;
  const s = settings.data[0];
  if (!s) return settings.loading ? <Skeleton className="h-40" /> : <Card><EmptyState icon={<SlidersHorizontal />} title="لا توجد ثوابت لهذا المطعم" /></Card>;
  return (
    <div className="grid gap-5">
      {branch ? <OpsConstants key={branch} settings={s} branchId={branch} readOnly={readOnly} /> : null}
    </div>
  );
}
