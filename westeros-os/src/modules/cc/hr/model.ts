/**
 * الموارد البشرية (Mohammed, 2026-11-23): "كل خانة الها كل مزاياها وكل تفاصيلها، والقدرة على الحذف والتعديل والتطوير
 * والإضافة على كل شيء من الإدارة". Every list the screens choose from lives in the settings row and is edited from
 * الإعدادات; every record is one hr_docs row told apart by `kind`. Pure rules only here (tested in model.test.ts).
 */
import type { HrDoc } from "@/data/hrDocTypes";
import type { Units } from "@/lib/money";

export const K = {
  settings: "settings", file: "file", department: "department", job: "job", grade: "grade", contract: "contract",
  vacancy: "vacancy", candidate: "candidate", onboarding: "onboarding", request: "request", decision: "decision",
  evaluation: "evaluation", course: "course", progress: "progress", warning: "warning", ack: "ack", exit: "exit",
  payslip: "payslip", note: "note",
} as const;

/* ───────── الإعدادات: every list is editable ───────── */

export interface Opt { id: string; name: string; active?: boolean }
export type FieldType = "text" | "number" | "date" | "select" | "yesno" | "textarea";
export interface CustomField { id: string; label: string; type: FieldType; options?: string[]; required?: boolean }
export interface LeaveType extends Opt { days: number; paid: boolean; carry: boolean }
export type Approver = "direct" | "dept" | "hr" | `role:${string}` | `member:${string}`;
export interface RequestType extends Opt { steps: Approver[]; leaveTypeId?: string | null; money?: boolean; dates?: boolean; note?: string }
export interface Criterion extends Opt { weight: number; help?: string }
export interface Penalty { action: "verbal" | "written" | "final" | "deduct" | "suspend" | "terminate"; days: number }
export interface Violation extends Opt { ladder: Penalty[]; resetMonths: number }
export interface TaskTpl { id: string; text: string; who: string; dueDay: number }
export interface Checklist extends Opt { tasks: TaskTpl[] }
export interface Gratuity { fromYears: number; months: number }

export interface HrSettings {
  contractTypes: Opt[];
  docTypes: (Opt & { expires: boolean; required: boolean })[];
  leaveTypes: LeaveType[];
  requestTypes: RequestType[];
  stages: Opt[];
  sources: Opt[];
  criteria: Criterion[];
  violations: Violation[];
  onboarding: Checklist[];
  clearance: TaskTpl[];
  exitReasons: Opt[];
  exitQuestions: Opt[];
  courseCategories: Opt[];
  /** extra fields management adds to a form, by kind (file, candidate, contract, request …) */
  customFields: Record<string, CustomField[]>;
  /** days before an end date that raise an alert */
  alertDays: number;
  probationDays: number;
  noticeDays: number;
  gratuity: Gratuity[];
  /** a month's working days for a day's wage */
  monthDays: number;
  /** people needed on a shift, per branch (branch id → count) */
  minStaff: Record<string, number>;
  /** a job's role becomes the employee's role (permissions) */
  jobSetsRole: boolean;
  /** إنذار ينزل خصمه على الراتب تلقائياً */
  pushDeductions: boolean;
  passMark: number;
}

const o = (id: string, name: string): Opt => ({ id, name, active: true });
const t = (id: string, text: string, who: string, dueDay: number): TaskTpl => ({ id, text, who, dueDay });

export const DEFAULT_SETTINGS: HrSettings = {
  contractTypes: [o("permanent", "دائم"), o("fixed", "محدد المدة"), o("part", "دوام جزئي"), o("daily", "يومية"), o("trainee", "تدريب")],
  docTypes: [
    { ...o("nid", "بطاقة الرقم القومي"), expires: true, required: true },
    { ...o("health", "الشهادة الصحية"), expires: true, required: true },
    { ...o("criminal", "فيش وتشبيه"), expires: true, required: false },
    { ...o("military", "شهادة الموقف من التجنيد"), expires: false, required: false },
    { ...o("contract", "العقد الموقع"), expires: false, required: true },
    { ...o("photo", "صورة شخصية"), expires: false, required: false },
  ],
  leaveTypes: [
    { ...o("annual", "اعتيادية"), days: 21, paid: true, carry: true },
    { ...o("casual", "عارضة"), days: 6, paid: true, carry: false },
    { ...o("sick", "مرضية"), days: 30, paid: true, carry: false },
    { ...o("unpaid", "بدون أجر"), days: 0, paid: false, carry: false },
  ],
  requestTypes: [
    { ...o("leave", "طلب إجازة"), steps: ["direct", "hr"], leaveTypeId: "annual", dates: true },
    { ...o("advance", "طلب سلفة"), steps: ["direct", "hr"], money: true, note: "الصرف من الحسابات بعد الاعتماد." },
    { ...o("swap", "تبديل وردية"), steps: ["direct"], dates: true },
    { ...o("permission", "إذن تأخير أو خروج"), steps: ["direct"], dates: true },
    { ...o("letter", "شهادة راتب أو خطاب"), steps: ["hr"] },
    { ...o("overtime", "اعتماد ساعات إضافية"), steps: ["direct", "hr"], dates: true },
    { ...o("other", "طلب آخر"), steps: ["direct", "hr"] },
  ],
  stages: [o("new", "طلب جديد"), o("screen", "فرز"), o("interview", "مقابلة"), o("trial", "يوم تجربة"), o("offer", "عرض"), o("hired", "تم التعيين"), o("rejected", "مرفوض")],
  sources: [o("walkin", "حضر للمطعم"), o("referral", "ترشيح موظف"), o("facebook", "فيسبوك"), o("wuzzuf", "وظف"), o("other", "أخرى")],
  criteria: [
    { ...o("punctual", "الالتزام بالمواعيد"), weight: 20 },
    { ...o("hygiene", "النظافة وسلامة الغذاء"), weight: 20 },
    { ...o("speed", "السرعة وجودة الشغل"), weight: 20 },
    { ...o("team", "التعاون مع الفريق"), weight: 15 },
    { ...o("guest", "التعامل مع الزبون"), weight: 15 },
    { ...o("recipe", "الالتزام بالوصفات وطريقة التصنيع"), weight: 10 },
  ],
  violations: [
    { ...o("late", "تأخير"), resetMonths: 6, ladder: [{ action: "verbal", days: 0 }, { action: "written", days: 0 }, { action: "deduct", days: 0.5 }, { action: "deduct", days: 1 }, { action: "deduct", days: 3 }] },
    { ...o("absent", "غياب بدون إذن"), resetMonths: 12, ladder: [{ action: "deduct", days: 1 }, { action: "deduct", days: 2 }, { action: "final", days: 3 }, { action: "terminate", days: 0 }] },
    { ...o("hygiene", "مخالفة النظافة وسلامة الغذاء"), resetMonths: 6, ladder: [{ action: "written", days: 0 }, { action: "deduct", days: 1 }, { action: "final", days: 2 }, { action: "terminate", days: 0 }] },
    { ...o("conduct", "سوء سلوك"), resetMonths: 12, ladder: [{ action: "written", days: 0 }, { action: "final", days: 2 }, { action: "terminate", days: 0 }] },
  ],
  onboarding: [{
    ...o("default", "استلام موظف جديد"),
    tasks: [
      t("t1", "توقيع العقد", "hr", 0), t("t2", "استلام المستندات (البطاقة، الشهادة الصحية، الفيش)", "hr", 0), t("t3", "تسليم الزي واليونيفورم", "direct", 0),
      t("t4", "تعريف بالمطعم والفريق", "direct", 1), t("t5", "تسجيل البصمة", "hr", 1), t("t6", "تدريب طريقة التصنيع والوصفات", "direct", 3),
      t("t7", "تدريب سلامة الغذاء", "direct", 5), t("t8", "تقييم نهاية الأسبوع الأول", "direct", 7),
    ],
  }],
  clearance: [t("c1", "رد الزي واليونيفورم", "direct", 0), t("c2", "رد المفاتيح والكروت", "direct", 0), t("c3", "تسوية العهدة والسلف", "hr", 0), t("c4", "إلغاء البصمة والدخول على السيستم", "hr", 0)],
  exitReasons: [o("better", "عرض أفضل"), o("personal", "ظروف شخصية"), o("study", "دراسة أو سفر"), o("performance", "ضعف الأداء"), o("conduct", "مخالفات"), o("contract", "انتهاء العقد"), o("other", "أخرى")],
  exitQuestions: [o("q1", "إيه أكتر حاجة عجبتك في الشغل؟"), o("q2", "إيه أكتر حاجة ضايقتك؟"), o("q3", "رأيك في مديرك المباشر؟"), o("q4", "ممكن ترجع تشتغل معانا؟")],
  courseCategories: [o("mfg", "طريقة التصنيع"), o("safety", "سلامة الغذاء"), o("service", "خدمة الزبائن"), o("cashier", "الكاشير"), o("general", "عام")],
  customFields: {},
  alertDays: 30,
  probationDays: 90,
  noticeDays: 30,
  gratuity: [{ fromYears: 0, months: 0.5 }, { fromYears: 5, months: 1 }],
  monthDays: 30,
  minStaff: {},
  jobSetsRole: true,
  pushDeductions: true,
  passMark: 70,
};

export const settingsOf = (row: HrDoc | null | undefined): HrSettings => ({ ...DEFAULT_SETTINGS, ...((row?.data ?? {}) as Partial<HrSettings>) });
export const activeOpts = <T extends Opt>(l: T[]) => l.filter((x) => x.active !== false);
export const optName = (l: Opt[], id: string | null | undefined, none = "—") => l.find((x) => x.id === id)?.name ?? none;

/* ───────── records ───────── */

export type EmpStatus = "active" | "probation" | "notice" | "suspended" | "ended";
export const EMP_STATUS: Record<EmpStatus, { label: string; tone: "ok" | "info" | "warn" | "danger" | "neutral" }> = {
  active: { label: "على رأس العمل", tone: "ok" }, probation: { label: "فترة تجربة", tone: "info" }, notice: { label: "فترة إخطار", tone: "warn" },
  suspended: { label: "موقوف", tone: "danger" }, ended: { label: "انتهت خدمته", tone: "neutral" },
};
/** ملف الموظف في الموارد البشرية (one per membership): what the users card does not hold */
export interface FileData {
  departmentId: string | null; jobId: string | null; managerId: string | null; gradeId: string | null;
  /** the employee in الحسابات > الرواتب (fin_docs kind employee) */
  finEmployeeId: string | null;
  employeeNo: string; probationEnd: string | null; empStatus: EmpStatus;
  phone: string; email: string; address: string; maritalStatus: string; children: number; education: string;
  bank: string; iban: string; skills: string; custom: Record<string, string>;
}
export const fileOf = (d: HrDoc | null | undefined): FileData => ({
  departmentId: null, jobId: null, managerId: null, gradeId: null, finEmployeeId: null, employeeNo: "", probationEnd: null, empStatus: "active",
  phone: "", email: "", address: "", maritalStatus: "", children: 0, education: "", bank: "", iban: "", skills: "", custom: {},
  ...((d?.data ?? {}) as Partial<FileData>),
});

export interface DepartmentData { parentId: string | null; headId: string | null; description: string; color: string }
export interface JobData { departmentId: string | null; roleId: string | null; gradeId: string | null; description: string; duties: string; requirements: string; courses: string[]; headcount: number }
export interface GradeData { min: Units; max: Units; note: string }
export interface ContractData { typeId: string; start: string; end: string | null; probationEnd: string | null; salary: Units; hours: number; terms: string; renewedFrom: string | null; custom: Record<string, string> }
export interface VacancyData { jobId: string | null; count: number; description: string; requirements: string; salaryFrom: Units; salaryTo: Units; closes: string | null }
export interface Interview { id: string; date: string; by: string; score: number; note: string }
export interface CandidateData { phone: string; email: string; vacancyId: string | null; stage: string; source: string; rating: number; expected: Units; cv: string | null; notes: string; interviews: Interview[]; custom: Record<string, string>; hiredMemberId?: string | null }
export interface TaskState extends TaskTpl { done: boolean; by: string; at: string | null; note: string }
export interface OnboardingData { templateId: string; start: string; tasks: TaskState[] }
export interface RequestData { typeId: string; from: string | null; to: string | null; amount: Units; text: string; by: string; custom: Record<string, string> }
export interface DecisionData { requestId: string; step: number; ok: boolean; note: string; by: string; byId: string }
export interface EvaluationData { period: string; scores: Record<string, number>; total: number; strengths: string; improve: string; goals: string; by: string }
export interface Lesson { id: string; title: string; body: string; url: string }
export interface Question { id: string; q: string; options: string[]; answer: number }
export interface CourseData { categoryId: string; description: string; lessons: Lesson[]; quiz: Question[]; passMark: number; jobs: string[]; validMonths: number; minutes: number }
export interface ProgressData { courseId: string; done: string[]; score: number | null; passed: boolean; completedAt: string | null; answers: number[]; tries: number }
export interface WarningData { violationId: string; level: number; action: Penalty["action"]; days: number; amount: Units; incident: string; text: string; by: string; pushedMoveId: string | null; month: string | null }
export interface ExitData { type: "resignation" | "termination" | "contract" | "other"; reasonId: string; noticeDate: string; lastDay: string; clearance: TaskState[]; answers: Record<string, string>; rehire: boolean; gratuity: Units; leaveDays: number; leavePay: Units; salaryDays: number; salaryPay: Units; other: Units; deductions: Units; total: Units; note: string; by: string; pushedMoveId: string | null; done: boolean }
export interface PayslipData { month: string; payrollId: string; line: Record<string, number | string | null>; net: Units; gross: Units }

export const dataOf = <T>(d: HrDoc) => d.data as unknown as T;

/* ───────── rules ───────── */

export const ACTION_LABEL: Record<Penalty["action"], string> = { verbal: "لفت نظر شفهي", written: "إنذار كتابي", final: "إنذار نهائي", deduct: "خصم من الراتب", suspend: "إيقاف عن العمل", terminate: "إحالة للفصل" };

const dayMs = 86_400_000;
const toTime = (d: string) => Date.parse(`${d}T00:00:00Z`);
export const addDays = (d: string, n: number) => new Date(toTime(d) + n * dayMs).toISOString().slice(0, 10);
export const daysBetween = (a: string, b: string) => Math.round((toTime(b) - toTime(a)) / dayMs);
export const addMonths = (d: string, n: number) => { const x = new Date(toTime(d)); x.setUTCMonth(x.getUTCMonth() + n); return x.toISOString().slice(0, 10); };
/** inclusive count of days of a leave */
export const spanDays = (from: string | null, to: string | null) => (from ? Math.max(1, daysBetween(from, to || from) + 1) : 0);
/** years of service, with fractions */
export const serviceYears = (hired: string | null | undefined, until: string) => (hired ? Math.max(0, daysBetween(hired, until) / 365.25) : 0);

/** the next step of a warning: how many of the same violation in the reset window, and what the ladder says */
export function nextPenalty(v: Violation, past: { date: string | null; violationId: string; status: string }[], on: string): { level: number; penalty: Penalty } {
  const since = addMonths(on, -Math.max(0, v.resetMonths || 0));
  const n = past.filter((p) => p.violationId === v.id && p.status !== "cancelled" && p.date && (v.resetMonths ? p.date >= since : true) && p.date <= on).length;
  const ladder = v.ladder.length ? v.ladder : [{ action: "written", days: 0 } as Penalty];
  return { level: n + 1, penalty: ladder[Math.min(n, ladder.length - 1)] };
}
/** a day's wage from the monthly salary */
export const dayWage = (monthly: Units, monthDays: number) => (monthDays > 0 ? Math.round(monthly / monthDays) : 0);

/** weighted score in percent; each criterion out of 5 */
export function evalTotal(criteria: Criterion[], scores: Record<string, number>): number {
  const used = criteria.filter((c) => c.active !== false && c.weight > 0);
  const w = used.reduce((s, c) => s + c.weight, 0);
  if (!w) return 0;
  return Math.round((used.reduce((s, c) => s + (Math.min(5, Math.max(0, scores[c.id] ?? 0)) / 5) * c.weight, 0) / w) * 1000) / 10;
}
export const evalBand = (pct: number) => (pct >= 90 ? { label: "ممتاز", tone: "ok" as const } : pct >= 75 ? { label: "جيد جداً", tone: "info" as const } : pct >= 60 ? { label: "جيد", tone: "brass" as const } : pct >= 50 ? { label: "مقبول", tone: "warn" as const } : { label: "ضعيف", tone: "danger" as const });

/** quiz result in percent */
export function quizScore(quiz: Question[], answers: number[]): number {
  if (!quiz.length) return 100;
  return Math.round((quiz.filter((q, i) => answers[i] === q.answer).length / quiz.length) * 100);
}

/** مكافأة نهاية الخدمة: months of salary per year of service, by the band the years reach */
export function gratuityOf(rules: Gratuity[], years: number, monthly: Units): Units {
  const sorted = [...rules].sort((a, b) => a.fromYears - b.fromYears);
  let total = 0;
  for (let i = 0; i < sorted.length; i++) {
    const from = sorted[i].fromYears, to = sorted[i + 1]?.fromYears ?? Infinity;
    const inBand = Math.max(0, Math.min(years, to) - from);
    total += inBand * sorted[i].months * monthly;
  }
  return Math.round(total);
}

/** leave used this year per leave type (approved leave requests) */
export function leaveUsed(requests: HrDoc[], types: RequestType[], memberId: string, year: string): Map<string, number> {
  const out = new Map<string, number>();
  for (const r of requests) {
    if (r.kind !== K.request || r.memberId !== memberId || r.status !== "approved") continue;
    const d = dataOf<RequestData>(r);
    const lt = types.find((x) => x.id === d.typeId)?.leaveTypeId;
    if (!lt || !(d.from ?? "").startsWith(year)) continue;
    out.set(lt, (out.get(lt) ?? 0) + spanDays(d.from, d.to));
  }
  return out;
}

/** who decides each step of a request; the step is open to anyone listed */
export interface Ctx { directOf: (memberId: string) => string | null; headOf: (memberId: string) => string | null; roleOf: (memberId: string) => string | null; isHr: (memberId: string) => boolean }
export function mayDecide(step: Approver | undefined, requester: string, me: { id: string; role: string }, c: Ctx): boolean {
  if (!step) return false;
  if (me.role === "owner") return true;
  if (me.id === requester) return false;
  if (step === "direct") return c.directOf(requester) === me.id || (!c.directOf(requester) && c.isHr(me.id));
  if (step === "dept") return c.headOf(requester) === me.id || (!c.headOf(requester) && c.isHr(me.id));
  if (step === "hr") return c.isHr(me.id);
  if (step.startsWith("role:")) return c.roleOf(me.id) === step.slice(5);
  if (step.startsWith("member:")) return me.id === step.slice(7);
  return false;
}
/** where a request stands: the step waiting and the decisions so far */
export function requestState(type: RequestType | undefined, decisions: HrDoc[]): { step: number; rejected: boolean; done: boolean } {
  const steps = type?.steps ?? [];
  const ds = decisions.map((d) => dataOf<DecisionData>(d)).sort((a, b) => a.step - b.step);
  let step = 0;
  for (const d of ds) {
    if (d.step !== step) continue;
    if (!d.ok) return { step, rejected: true, done: false };
    step++;
  }
  return { step, rejected: false, done: step >= steps.length };
}
export const STEP_LABEL = (s: Approver, roleName: (id: string) => string, memberName: (id: string) => string) =>
  s === "direct" ? "المدير المباشر" : s === "dept" ? "رئيس القسم" : s === "hr" ? "الموارد البشرية" : s.startsWith("role:") ? `دور: ${roleName(s.slice(5))}` : `موظف: ${memberName(s.slice(7))}`;

/** expiring things: contracts and documents ending within `days` (or already ended) */
export interface Expiry { memberId: string; what: string; date: string; left: number }
export function expiries(items: { memberId: string; what: string; date: string | null }[], today: string, days: number): Expiry[] {
  return items.filter((x) => x.date).map((x) => ({ memberId: x.memberId, what: x.what, date: x.date!, left: daysBetween(today, x.date!) })).filter((x) => x.left <= days).sort((a, b) => a.left - b.left);
}

/** معدل الدوران: people who left in the period over the average headcount, percent */
export const turnover = (left: number, startCount: number, endCount: number) => { const avg = (startCount + endCount) / 2; return avg > 0 ? Math.round((left / avg) * 1000) / 10 : 0; };

export const nextCode = (docs: HrDoc[]) => String(Math.max(0, ...docs.map((d) => Number(d.code) || 0)) + 1);
export const newId = () => (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`).slice(0, 8);
