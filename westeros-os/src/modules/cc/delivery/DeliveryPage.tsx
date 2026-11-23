/** خدمة التوصيل: its own main menu under الإعدادات (it was a tab of ثوابت النظام until 2026-11-23). */
import { Truck } from "lucide-react";
import { PageHeader } from "@/shell/PageHeader";
import { AreaGate, useArea } from "../useAccess";
import DeliveryList from "./DeliveryList";

export default function DeliveryPage() {
  return <AreaGate id="delivery"><Body /></AreaGate>;
}

function Body() {
  const readOnly = !useArea().edit;
  return (
    <div className="grid gap-5">
      <PageHeader icon={<Truck />} title="خدمة التوصيل" />
      {readOnly ? <p className="rounded-xl border border-line px-3 py-2 text-[13.5px] text-muted">للمشاهدة بس: الدور بتاعك مالوش صلاحية تعديل خدمة التوصيل.</p> : null}
      <DeliveryList readOnly={readOnly} />
    </div>
  );
}
