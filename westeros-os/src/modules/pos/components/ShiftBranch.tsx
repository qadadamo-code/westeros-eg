import { MapPin } from "lucide-react";
import { useSession } from "@/auth/session";
import { setViewBranch } from "@/auth/viewBranch";

/**
 * الفرع جنب زر فتح الوردية (Saqr 2026-11-24): the branch the cashier works in. A user held to one branch sees its name;
 * a user of more than one branch picks it here (never the central kitchen), and the shift, menu and orders follow it.
 */
export function ShiftBranch() {
  const { branches, branchId, switchBranch } = useSession();
  const list = branches.filter((b) => !b.isCentral);
  const cur = list.find((b) => b.id === branchId) ?? null;
  if (list.length < 2)
    return cur ? <span className="flex items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1.5 text-[13px] font-semibold text-ink-2"><MapPin className="size-4" />{cur.name.ar}</span> : null;
  return (
    <label className="flex items-center gap-1.5 rounded-full border border-line bg-surface ps-3 text-[13px] font-semibold text-ink-2">
      <MapPin className="size-4 shrink-0" aria-hidden />
      <select aria-label="الفرع" value={cur?.id ?? ""} onChange={(e) => { setViewBranch(e.target.value); switchBranch(e.target.value); }} className="h-8 rounded-full bg-transparent pe-2 outline-none">
        {cur ? null : <option value="">اختار الفرع</option>}
        {list.map((b) => <option key={b.id} value={b.id}>{b.name.ar}</option>)}
      </select>
    </label>
  );
}
