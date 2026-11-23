/** الحضور والبصمة: the attendance board (phone check-in inside the restaurant, ZKTeco fingerprint devices, lateness, absence, overtime) and its rules. */
import { lazy, useState } from "react";
import { Segmented } from "@/ui";
import { useArea } from "../useAccess";

const Board = lazy(() => import("@/modules/staff/AttendancePage"));
const Rules = lazy(() => import("@/modules/staff/HrSettingsPage"));

export default function AttendanceTab() {
  const edit = useArea().edit;
  const [tab, setTab] = useState<"board" | "rules">("board");
  return (
    <div className="grid gap-4">
      {edit ? <Segmented label="الحضور" value={tab} onChange={setTab} options={[{ value: "board", label: "سجل الحضور والبصمة" }, { value: "rules", label: "قواعد التأخير والإضافي والبصمة والإجازات" }]} /> : null}
      {tab === "board" || !edit ? <Board /> : <Rules />}
    </div>
  );
}
