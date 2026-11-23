/** الموارد البشرية: everything that writes. Each function takes the db and what the screens already loaded (Hrx). */
import type { Db } from "@/data/hooks";
import type { HrDoc } from "@/data/hrDocTypes";
import type { FinDoc } from "@/data/financeTypes";
import type { Membership } from "@/data/types";
import type { Units } from "@/lib/money";
import { nextUserCode, userTypesOf } from "../lib";
import { saveEmployee, employeeOf, payrollOf } from "../finance/payroll";
import { saveMove, cancelMove } from "../finance/staffMoves";
import type { Actor } from "../finance/journalOps";
import type { Hrx } from "./useHrx";
import {
  K, addDays, dataOf, fileOf, nextCode, requestState,
  type CandidateData, type DecisionData, type ExitData, type FileData, type HrSettings, type OnboardingData, type PayslipData, type RequestData, type TaskState, type WarningData,
} from "./model";

export interface DocFields { kind: string; name?: string; code?: string; memberId?: string | null; branchId?: string | null; status?: string; date?: string | null; data: Record<string, unknown> }

/** add a row, or change one (its data is merged) */
export async function saveDoc(db: Db, row: HrDoc | null, f: DocFields): Promise<HrDoc> {
  if (row) return db.update("hrDocs", row.id, { ...f, data: { ...row.data, ...f.data } });
  const code = f.code ?? nextCode(await db.list("hrDocs", { where: { kind: f.kind } }));
  return db.insert("hrDocs", { name: "", memberId: null, branchId: null, status: "active", date: null, ...f, code });
}
export const removeDoc = (db: Db, id: string) => db.remove("hrDocs", id);

export async function saveSettings(db: Db, hrx: Hrx, patch: Partial<HrSettings>): Promise<HrDoc> {
  return saveDoc(db, hrx.settingsRow, { kind: K.settings, name: "إعدادات الموارد البشرية", data: { ...hrx.settings, ...patch } });
}

/** a role (user type) for one employee: the role's code range gives the next free code, and the database level follows */
export async function setRole(db: Db, hrx: Hrx, member: Membership, roleId: string): Promise<void> {
  const s = (await db.list("mfgSettings"))[0];
  const types = userTypesOf(hrx.lists);
  const t = types.find((x) => x.id === roleId);
  if (!s || !t || member.role === "owner") return;
  const codes = { ...s.chefCodes };
  const c = nextUserCode(t, codes, member.id);
  if (!c) throw new Error(`أكواد "${t.name}" خلصت. زود عدد المستخدمين للدور من المستخدمين ← الأدوار.`);
  codes[member.id] = c;
  await db.update("mfgSettings", s.id, { chefCodes: codes, lists: { ...hrx.lists, userTypes: types, userTypeOf: { ...(hrx.lists.userTypeOf ?? {}), [member.id]: t.id } } });
  if (member.role !== t.role) await db.update("memberships", member.id, { role: t.role });
}

/** ملف الموظف: saving a new job gives the employee the job's role (and so its permissions) when the setting is on */
export async function saveFile(db: Db, hrx: Hrx, memberId: string, patch: Partial<FileData>): Promise<{ roleChanged: boolean }> {
  const row = hrx.fileRows.get(memberId) ?? null;
  const before = fileOf(row);
  const member = hrx.memberById.get(memberId);
  await saveDoc(db, row, { kind: K.file, memberId, name: member?.name ?? "", branchId: member?.branchIds[0] ?? null, status: patch.empStatus ?? before.empStatus, data: { ...before, ...patch } as unknown as Record<string, unknown> });
  const jobId = patch.jobId ?? null;
  if (!member || !jobId || jobId === before.jobId || !hrx.settings.jobSetsRole) return { roleChanged: false };
  const job = hrx.jobs.find((j) => j.id === jobId);
  const roleId = job ? hrx.jobData(job).roleId : null;
  if (!roleId) return { roleChanged: false };
  await setRole(db, hrx, member, roleId);
  return { roleChanged: true };
}

/** a job's role changed: every employee holding the job follows (when the setting is on) */
export async function applyJobToHolders(db: Db, hrx: Hrx, jobId: string, roleId: string | null): Promise<number> {
  if (!roleId || !hrx.settings.jobSetsRole) return 0;
  let n = 0;
  for (const m of hrx.members) if (m.active && hrx.fileOfMember(m.id).jobId === jobId) { await setRole(db, hrx, m, roleId); n++; }
  return n;
}

/** القرار على خطوة من الطلب; the last approval (or any rejection) closes it */
export async function decide(db: Db, hrx: Hrx, req: HrDoc, ok: boolean, note: string): Promise<HrDoc> {
  const r = dataOf<RequestData>(req);
  const type = hrx.settings.requestTypes.find((t) => t.id === r.typeId);
  const decisions = hrx.by(K.decision).filter((d) => dataOf<DecisionData>(d).requestId === req.id);
  const st = requestState(type, decisions);
  if (st.done || st.rejected || req.status !== "pending") throw new Error("الطلب اتقفل بالفعل");
  const me = hrx.staff;
  const dec: DecisionData = { requestId: req.id, step: st.step, ok, note: note.trim(), by: me?.name ?? "", byId: me?.id ?? "" };
  await saveDoc(db, null, { kind: K.decision, memberId: req.memberId, date: hrx.today, status: ok ? "approved" : "rejected", data: dec as unknown as Record<string, unknown> });
  const after = requestState(type, [...decisions, { data: dec } as unknown as HrDoc]);
  if (after.rejected) return db.update("hrDocs", req.id, { status: "rejected" });
  if (after.done) return db.update("hrDocs", req.id, { status: "approved" });
  return req;
}

export async function newRequest(db: Db, hrx: Hrx, memberId: string, d: Omit<RequestData, "by">): Promise<HrDoc> {
  const type = hrx.settings.requestTypes.find((t) => t.id === d.typeId);
  if (!type) throw new Error("اختر نوع الطلب");
  if (type.dates && !d.from) throw new Error("اختر التاريخ");
  if (d.to && d.from && d.to < d.from) throw new Error("تاريخ النهاية قبل البداية");
  if (type.money && !(d.amount > 0)) throw new Error("اكتب المبلغ");
  return db.insert("hrDocs", { kind: K.request, code: String(Date.now()).slice(-7), name: type.name, memberId, branchId: hrx.memberById.get(memberId)?.branchIds[0] ?? null, status: "pending", date: hrx.today, data: { ...d, by: hrx.staff?.name ?? "" } });
}

/** a warning's deduction goes to الحسابات > حركات الموظفين as a خصم waiting for the month's payroll */
export async function pushDeduction(db: Db, hrx: Hrx, w: HrDoc, actor: Actor): Promise<HrDoc> {
  const d = dataOf<WarningData>(w);
  const finId = hrx.fileOfMember(w.memberId).finEmployeeId;
  if (!finId) throw new Error("الموظف مش مربوط بموظف في الرواتب. اربطه من ملفه الأول.");
  if (!(d.amount > 0)) throw new Error("مفيش مبلغ خصم");
  const month = d.month ?? (w.date ?? hrx.today).slice(0, 7);
  const move = await saveMove(db, { type: "deduction", employeeId: finId, date: w.date ?? hrx.today, amount: d.amount, month, memo: `جزاء: ${w.name} (${d.incident || "إنذار رقم " + w.code})` }, actor);
  return db.update("hrDocs", w.id, { data: { ...w.data, pushedMoveId: move.id, month } });
}
export async function cancelWarning(db: Db, hrx: Hrx, w: HrDoc, actor: Actor): Promise<void> {
  const d = dataOf<WarningData>(w);
  if (d.pushedMoveId) await cancelMove(db, d.pushedMoveId, actor, hrx.today);
  await db.update("hrDocs", w.id, { status: "cancelled" });
}

/** تعيين متقدم: a new employee (no PIN yet), their card and HR file, and their onboarding list */
export async function hireCandidate(db: Db, hrx: Hrx, cand: HrDoc, v: { roleId: string; branchId: string | null; jobId: string | null; departmentId: string | null; start: string; salary: Units; onboardingId: string | null }): Promise<Membership> {
  const c = dataOf<CandidateData>(cand);
  const role = hrx.roles.find((r) => r.id === v.roleId);
  if (!role) throw new Error("اختر الدور");
  const member = await db.insert("memberships", { name: cand.name, phone: c.phone || null, email: c.email || null, branchIds: v.branchId ? [v.branchId] : [], userId: null, role: role.role, color: "#F8BB18", hasPin: false, active: true, lastSeenAt: null } as never) as Membership;
  await db.insert("staffProfiles", { membershipId: member.id, nationalId: null, birthDate: null, address: null, hireDate: v.start, contractType: "probation", position: { ar: v.jobId ? hrx.jobs.find((j) => j.id === v.jobId)?.name ?? "" : "", en: "" }, deviceUserId: null, emergencyContact: null, notes: `اتعين من التوظيف (${cand.name})`, photoUrl: null, nationality: "EG", contractEnd: null, station: null, foodHandler: true, documents: [], weeklyOff: [5], terminatedAt: null, terminationReason: null } as never);
  await setRole(db, hrx, member, role.id);
  const probationEnd = addDays(v.start, hrx.settings.probationDays);
  await saveDoc(db, null, { kind: K.file, memberId: member.id, name: cand.name, branchId: v.branchId, status: "probation", data: { ...fileOf(null), jobId: v.jobId, departmentId: v.departmentId, phone: c.phone, email: c.email, probationEnd, empStatus: "probation", custom: c.custom ?? {} } as unknown as Record<string, unknown> });
  if (v.salary > 0) await saveDoc(db, null, { kind: K.contract, memberId: member.id, name: cand.name, date: v.start, status: "active", data: { typeId: hrx.settings.contractTypes[0]?.id ?? "", start: v.start, end: null, probationEnd, salary: v.salary, hours: 8, terms: "", renewedFrom: null, custom: {} } });
  if (v.onboardingId) await startOnboarding(db, hrx, member.id, cand.name, v.onboardingId, v.start);
  await db.update("hrDocs", cand.id, { status: "hired", data: { ...cand.data, stage: "hired", hiredMemberId: member.id } });
  return member;
}

export async function startOnboarding(db: Db, hrx: Hrx, memberId: string, name: string, templateId: string, start: string): Promise<HrDoc> {
  const tpl = hrx.settings.onboarding.find((x) => x.id === templateId);
  if (!tpl) throw new Error("اختر قائمة الاستلام");
  const tasks: TaskState[] = tpl.tasks.map((t) => ({ ...t, done: false, by: "", at: null, note: "" }));
  const data: OnboardingData = { templateId, start, tasks };
  return saveDoc(db, null, { kind: K.onboarding, memberId, name, date: start, status: "open", data: data as unknown as Record<string, unknown> });
}

/** إنهاء الخدمة: the employee stops (no sign-in, out of new payrolls); their dues go to the month's payroll as a حافز */
export async function finishExit(db: Db, hrx: Hrx, ex: HrDoc, actor: Actor): Promise<void> {
  const d = dataOf<ExitData>(ex);
  const memberId = ex.memberId!;
  const member = hrx.memberById.get(memberId);
  if (member && member.role !== "owner") await db.update("memberships", memberId, { active: false });
  const prof = hrx.profileBy.get(memberId);
  if (prof) await db.update("staffProfiles", prof.id, { terminatedAt: d.lastDay, terminationReason: hrx.settings.exitReasons.find((r) => r.id === d.reasonId)?.name ?? d.type });
  await saveFile(db, hrx, memberId, { empStatus: "ended" });
  const finId = hrx.fileOfMember(memberId).finEmployeeId;
  let pushed: string | null = d.pushedMoveId;
  const fin = finId ? hrx.finById.get(finId) : null;
  if (fin) {
    const e = employeeOf(fin);
    await saveEmployee(db, fin, { name: fin.name, branchId: fin.branchId, active: false, data: { job: e.job, phone: e.phone, nationalId: e.nationalId, hired: e.hired, salary: e.salary, allowances: e.allowances, insEmployee: e.insEmployee, insEmployer: e.insEmployer, tax: e.tax, centreId: e.centreId, note: e.note } });
    const dues = d.gratuity + d.leavePay + d.other - d.deductions;
    if (!pushed && dues > 0) pushed = (await saveMove(db, { type: "bonus", employeeId: fin.id, date: d.lastDay, amount: dues, month: d.lastDay.slice(0, 7), memo: `مستحقات نهاية الخدمة: ${ex.name}` }, actor)).id;
  }
  await db.update("hrDocs", ex.id, { status: "done", data: { ...ex.data, done: true, pushedMoveId: pushed } });
}

/** ربط موظف الرواتب: an existing payroll employee, or a new one made from the HR file */
export async function linkFinEmployee(db: Db, hrx: Hrx, memberId: string, finId: string | "new", salary?: { salary: Units; allowances: Units }): Promise<FinDoc | null> {
  const member = hrx.memberById.get(memberId);
  if (!member) return null;
  let fin: FinDoc | null = finId === "new" ? null : hrx.finById.get(finId) ?? null;
  if (finId === "new") {
    const p = hrx.profileBy.get(memberId);
    fin = await saveEmployee(db, null, { name: member.name, branchId: member.branchIds[0] ?? null, active: true, data: { job: hrx.jobOf(memberId)?.name ?? p?.position.ar ?? "", phone: member.phone ?? "", nationalId: p?.nationalId ?? "", hired: p?.hireDate ?? "", salary: salary?.salary ?? 0, allowances: salary?.allowances ?? 0, insEmployee: 0, insEmployer: 0, tax: 0, centreId: null, note: "" } });
  }
  await saveFile(db, hrx, memberId, { finEmployeeId: fin?.id ?? null });
  return fin;
}

/** نشر قسائم كشف رواتب: one payslip per linked employee, shown on their page (again = updated) */
export async function publishPayslips(db: Db, hrx: Hrx, payroll: FinDoc): Promise<number> {
  const p = payrollOf(payroll);
  const memberOfFin = new Map<string, string>();
  for (const [memberId, row] of hrx.fileRows) { const f = fileOf(row).finEmployeeId; if (f) memberOfFin.set(f, memberId); }
  const have = hrx.by(K.payslip);
  let n = 0;
  for (const l of p.lines) {
    const memberId = memberOfFin.get(l.employeeId);
    if (!memberId) continue;
    const gross = l.basic + l.allowances + l.overtime + l.bonus - l.deductions;
    const net = gross - l.insEmployee - l.tax - l.advance - (l.savings ?? 0);
    const data: PayslipData = { month: p.month, payrollId: payroll.id, line: { ...l } as unknown as Record<string, number | string | null>, net, gross };
    const row = have.find((d) => d.memberId === memberId && dataOf<PayslipData>(d).payrollId === payroll.id) ?? null;
    await saveDoc(db, row, { kind: K.payslip, memberId, name: l.name, date: payroll.date, status: "published", data: data as unknown as Record<string, unknown> });
    n++;
  }
  return n;
}
