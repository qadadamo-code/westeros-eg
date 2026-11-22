/** المستخدمين ← الملخص: employees per role and per workplace, who is active, who has a PIN, when they last signed in. */
import { useMemo } from "react";
import { Building2, Clock, KeyRound, ShieldCheck, UserCheck, UserX, Users } from "lucide-react";
import { useLive } from "@/data/hooks";
import { StatTile } from "@/ui";
import { userTypeOf, userTypesOf } from "../lib";
import { useCc } from "../useCc";
import { DonutCard, ListCard } from "../summary/kit";

export default function UsersSummary() {
  const cc = useCc();
  const all = useLive("memberships").data;
  const s = useMemo(() => {
    const active = all.filter((m) => m.active);
    const byRole = new Map<string, number>();
    const byBranch = new Map<string, number>();
    for (const m of active) {
      const role = m.role === "owner" ? "صاحب الحساب" : userTypeOf(m, cc.lists)?.name ?? "بدون دور";
      byRole.set(role, (byRole.get(role) ?? 0) + 1);
      const b = m.branchIds[0] ? cc.branchName(m.branchIds[0]) : "كل الفروع";
      byBranch.set(b, (byBranch.get(b) ?? 0) + 1);
    }
    const now = Date.now();
    const seen = { today: 0, week: 0, older: 0, never: 0 };
    const startOfDay = new Date().setHours(0, 0, 0, 0);
    for (const m of active) {
      const t = m.lastSeenAt ? Date.parse(m.lastSeenAt) : NaN;
      if (!Number.isFinite(t)) seen.never += 1;
      else if (t >= startOfDay) seen.today += 1;
      else if (t >= now - 7 * 86_400_000) seen.week += 1;
      else seen.older += 1;
    }
    const roles = userTypesOf(cc.lists);
    const fill = roles.map((t) => ({ key: t.id, label: `${t.name} (${t.from}–${(t.from ?? 1) + (t.count ?? 100) - 1})`, value: active.filter((m) => m.role !== "owner" && userTypeOf(m, cc.lists)?.id === t.id).length }));
    return {
      active,
      inactive: all.length - active.length,
      noPin: active.filter((m) => !m.hasPin && m.role !== "owner").length,
      roles: roles.length,
      byRole: [...byRole.entries()].map(([k, v]) => ({ key: k, label: k, value: v })),
      byBranch: [...byBranch.entries()].map(([k, v]) => ({ key: k, label: k, value: v })),
      seen: [
        { key: "today", label: "دخل النهارده", value: seen.today },
        { key: "week", label: "خلال آخر 7 أيام", value: seen.week },
        { key: "older", label: "أقدم من 7 أيام", value: seen.older },
        { key: "never", label: "لم يدخل بعد", value: seen.never },
      ],
      fill,
    };
  }, [all, cc]);
  return (
    <div className="grid gap-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile index={0} icon={<UserCheck />} label="موظفين نشطين" value={<span className="num">{s.active.length}</span>} />
        <StatTile index={1} tone={s.inactive ? "warn" : "ok"} icon={<UserX />} label="موظفين متوقفين" value={<span className="num">{s.inactive}</span>} />
        <StatTile index={2} tone="info" icon={<ShieldCheck />} label="الأدوار" value={<span className="num">{s.roles}</span>} />
        <StatTile index={3} tone={s.noPin ? "danger" : "ok"} icon={<KeyRound />} label="بدون رمز دخول" value={<span className="num">{s.noPin}</span>} sub="موظفين نشطين لسه مالهمش PIN" />
      </div>
      <div className="grid items-start gap-5 lg:grid-cols-2">
        <DonutCard icon={<Users />} title="الموظفين حسب الدور" rows={s.byRole} empty="لا يوجد موظفين بعد." />
        <DonutCard icon={<Building2 />} title="الموظفين حسب مكان العمل" rows={s.byBranch} empty="لا يوجد موظفين بعد." />
        <DonutCard icon={<Clock />} title="آخر دخول للسيستم" subtitle="الموظفين النشطين" rows={s.seen} empty="لا يوجد موظفين بعد." />
        <ListCard icon={<ShieldCheck />} title="الأكواد المستخدمة في كل دور" subtitle="عدد الموظفين من مدى أكواد الدور" rows={s.fill} format={(v) => <span className="num">{v} موظف</span>} empty="لا توجد أدوار بعد." />
      </div>
    </div>
  );
}
