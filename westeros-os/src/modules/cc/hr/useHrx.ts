/** Everything the HR screens read: the HR rows, the settings, the employees (users) with their files, roles and branches. */
import { useMemo } from "react";
import { useSession } from "@/auth/session";
import { useLive } from "@/data/hooks";
import type { HrDoc } from "@/data/hrDocTypes";
import type { Membership, StaffProfile } from "@/data/types";
import { listsOf, userTypeOf, userTypesOf } from "../lib";
import { memberCan } from "../perms";
import { EMPLOYEE, employeeOf } from "../finance/payroll";
import { K, dataOf, fileOf, settingsOf, type Ctx, type DepartmentData, type FileData, type JobData } from "./model";
import { today as todayCairo } from "../finance/ui";

export function useHrx() {
  const { staff, branches: myBranches } = useSession();
  const docsLive = useLive("hrDocs");
  const docs = docsLive.data;
  const allMembers = useLive("memberships", { orderBy: [{ field: "name" }] }).data;
  const profiles = useLive("staffProfiles").data;
  const mfg = useLive("mfgSettings").data[0];
  const finDocs = useLive("finDocs", { where: { kind: EMPLOYEE } }).data;
  const branchRows = useLive("branches").data;
  return useMemo(() => {
    const lists = listsOf(mfg);
    const roles = userTypesOf(lists);
    const by = (kind: string) => docs.filter((d) => d.kind === kind);
    const settingsRow = docs.find((d) => d.kind === K.settings) ?? null;
    const settings = settingsOf(settingsRow);
    const members = allMembers.filter((m) => m.role !== "platform_admin");
    const memberById = new Map(members.map((m) => [m.id, m]));
    const profileBy = new Map<string, StaffProfile>(profiles.map((p) => [p.membershipId, p]));
    const fileRows = new Map<string, HrDoc>(by(K.file).filter((d) => d.memberId).map((d) => [d.memberId!, d]));
    const fileOfMember = (id: string | null | undefined): FileData => fileOf(id ? fileRows.get(id) : null);
    const departments = by(K.department).sort((a, b) => a.name.localeCompare(b.name, "ar"));
    const jobs = by(K.job).sort((a, b) => a.name.localeCompare(b.name, "ar"));
    const grades = by(K.grade);
    const may = (perm: "hr.approve" | "hr.salary" | "hr.branches" | "hr.jobs") => memberCan(staff, lists, perm);
    const allBranches = may("hr.branches") || staff?.role === "owner" || !myBranches.length;
    const mine = new Set(myBranches.map((b) => b.id));
    /** the employees this user may see: all branches, or the ones working in their branches (no workplace = every branch) */
    const visible = members.filter((m) => allBranches || !m.branchIds.length || m.branchIds.some((b) => mine.has(b)));
    const name = (id: string | null | undefined) => memberById.get(id ?? "")?.name ?? "—";
    const roleName = (id: string | null | undefined) => roles.find((r) => r.id === id)?.name ?? "—";
    const deptOf = (memberId: string) => departments.find((d) => d.id === fileOfMember(memberId).departmentId) ?? null;
    const jobOf = (memberId: string) => jobs.find((j) => j.id === fileOfMember(memberId).jobId) ?? null;
    const ctx: Ctx = {
      directOf: (m) => fileOfMember(m).managerId,
      headOf: (m) => { const d = deptOf(m); return d ? dataOf<DepartmentData>(d).headId : null; },
      roleOf: (m) => { const x = memberById.get(m); return x ? userTypeOf(x, lists)?.id ?? null : null; },
      isHr: (m) => { const x = memberById.get(m); return !!x && (x.role === "owner" || memberCan(x, lists, "hr.approve")); },
    };
    const finById = new Map(finDocs.map((d) => [d.id, d]));
    /** monthly salary from the linked payroll employee, else from the latest contract */
    const salaryOf = (memberId: string): number => {
      const f = finById.get(fileOfMember(memberId).finEmployeeId ?? "");
      if (f) { const e = employeeOf(f); return e.salary + e.allowances; }
      const c = by(K.contract).filter((d) => d.memberId === memberId && d.status !== "cancelled").sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""))[0];
      return c ? Number((c.data as { salary?: number }).salary ?? 0) : 0;
    };
    const branches = [...branchRows].sort((a, b) => Number(b.isDefault) - Number(a.isDefault) || (a.code ?? 1e9) - (b.code ?? 1e9));
    const branchName = (id: string | null | undefined) => branchRows.find((b) => b.id === id)?.name.ar ?? "كل الفروع";
    const workplace = (m: Membership) => (m.branchIds.length ? m.branchIds.map(branchName).join("، ") : "كل الفروع");
    return {
      loading: docsLive.loading, docs, by, settingsRow, settings, members, visible, memberById, profileBy, fileRows, fileOfMember, departments, jobs, grades,
      lists, roles, roleName, name, deptOf, jobOf, ctx, may, staff, finDocs, finById, salaryOf, branches, branchName, workplace, today: todayCairo(),
      jobData: (j: HrDoc) => dataOf<JobData>(j),
    };
  }, [docs, docsLive.loading, allMembers, profiles, mfg, finDocs, branchRows, staff, myBranches]);
}
export type Hrx = ReturnType<typeof useHrx>;
