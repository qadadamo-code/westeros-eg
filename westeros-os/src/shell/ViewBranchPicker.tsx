import { MapPin } from "lucide-react";
import { useSession } from "@/auth/session";
import { useViewBranch } from "@/auth/viewBranch";
import { Badge, Select } from "@/ui";

/** the branch picker at the top of each main section: "كل الفروع" or one branch; fixed for a one-branch user */
export function ViewBranchPicker() {
  const { branches } = useSession();
  const v = useViewBranch();
  const list = v.allowed ? branches.filter((b) => v.allowed!.includes(b.id)) : branches;
  if (v.locked || list.length < 2) {
    const b = list.find((x) => x.id === (v.value ?? list[0]?.id));
    return b ? <Badge tone="neutral" icon={<MapPin />}>{b.name.ar}</Badge> : null;
  }
  return (
    <div className="w-48">
      <Select aria-label="الفرع" value={v.value ?? ""} onChange={(e) => v.set(e.target.value || null)} options={[{ value: "", label: v.allowed ? "كل فروعي" : "كل الفروع" }, ...list.map((b) => ({ value: b.id, label: b.name.ar }))]} />
    </div>
  );
}
