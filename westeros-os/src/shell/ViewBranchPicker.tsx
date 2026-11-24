import { MapPin } from "lucide-react";
import { useSession } from "@/auth/session";
import { useViewBranch } from "@/auth/viewBranch";
import { Badge, Select } from "@/ui";

/** the branch picker at the top of each main section: "كل الفروع" or one branch; fixed for a one-branch user */
export function ViewBranchPicker({ noCentral }: { noCentral?: boolean } = {}) {
  const { branches, branchId, switchBranch } = useSession();
  const v = useViewBranch();
  // the menu, cashier, kitchen and orders have no central-kitchen choice (Saqr 2026-11-24)
  const list = (v.allowed ? branches.filter((b) => v.allowed!.includes(b.id)) : branches).filter((b) => !noCentral || !b.isCentral);
  const value = v.value && list.some((b) => b.id === v.value) ? v.value : null;
  if (v.locked || list.length < 2) {
    const b = list.find((x) => x.id === (value ?? list[0]?.id));
    return b ? <Badge tone="neutral" icon={<MapPin />}>{b.name.ar}</Badge> : null;
  }
  return (
    <div className="w-48">
      <Select aria-label="الفرع" value={value ?? ""} onChange={(e) => { const id = e.target.value || null; v.set(id); if (id && id !== branchId) switchBranch(id); if (!id && branches.find((b) => b.id === branchId)?.isCentral) { const till = list.find((b) => !b.isCentral); if (till) switchBranch(till.id); } }} options={[{ value: "", label: v.allowed ? "كل فروعي" : "كل الفروع" }, ...list.map((b) => ({ value: b.id, label: b.name.ar }))]} />
    </div>
  );
}
