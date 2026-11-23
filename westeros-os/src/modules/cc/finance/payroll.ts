/** الرواتب: الموظفون، السلف، كشف رواتب الشهر بقيد استحقاق واحد، وصرفه. */
import type { Db } from "@/data/hooks";
import type { FinDoc, FinEntry, FinLine } from "@/data/financeTypes";
import type { Units } from "@/lib/money";
import { fiscalYear, JournalError } from "./journal";
import { journalContext, postSystem, reverseEntry, submitEntry, type Actor } from "./journalOps";
import { partyAccount } from "./parties";
import { linkedAccount } from "./sales";
import { monthEnd, nextVoucherNo } from "./treasury";

export const EMPLOYEE = "employee";
export const PAYROLL = "payroll";
export const EMPLOYEE_LINK = "employee";

export interface EmployeeData {
  job: string; phone: string; nationalId: string; hired: string;
  /** monthly figures; each one is only the default of the next payroll and can be changed on it */
  salary: Units; allowances: Units; insEmployee: Units; insEmployer: Units; tax: Units;
  centreId: string | null; note: string;
  /** the employee's own account under سلف وعهد الموظفين */
  accountId: string;
}
export const employeeOf = (d: FinDoc): EmployeeData => ({ job: "", phone: "", nationalId: "", hired: "", salary: 0, allowances: 0, insEmployee: 0, insEmployer: 0, tax: 0, centreId: null, note: "", accountId: "", ...(d.data as Partial<EmployeeData>) });

export interface PayLine {
  employeeId: string; name: string; branchId: string | null; centreId: string | null;
  basic: Units; allowances: Units; overtime: Units; bonus: Units;
  /** absence, lateness and penalties: they come off the salary expense */
  deductions: Units;
  insEmployee: Units; insEmployer: Units; tax: Units;
  /** what is taken back from the employee's advance this month */
  advance: Units;
}
export interface PayrollData { month: string; lines: PayLine[]; gross: Units; net: Units; entryId: string | null; payEntryId: string | null; paidFrom: string | null; paidOn: string | null; cancelEntryId?: string | null; note: string; by: string }
export const payrollOf = (d: FinDoc) => d.data as unknown as PayrollData;

export const grossOf = (l: PayLine) => l.basic + l.allowances + l.overtime + l.bonus - l.deductions;
export const netOf = (l: PayLine) => grossOf(l) - l.insEmployee - l.tax - l.advance;
export function payrollTotals(lines: PayLine[]) {
  const sum = (f: (l: PayLine) => Units) => lines.reduce((s, l) => s + f(l), 0);
  return { basic: sum((l) => l.basic + l.allowances), overtime: sum((l) => l.overtime), bonus: sum((l) => l.bonus), deductions: sum((l) => l.deductions), gross: sum(grossOf), insEmployee: sum((l) => l.insEmployee), insEmployer: sum((l) => l.insEmployer), tax: sum((l) => l.tax), advance: sum((l) => l.advance), net: sum(netOf), cost: sum((l) => grossOf(l) + l.insEmployer) };
}
/** the line an employee starts the month with */
export const lineOf = (doc: FinDoc): PayLine => { const e = employeeOf(doc); return { employeeId: doc.id, name: doc.name, branchId: doc.branchId, centreId: e.centreId, basic: e.salary, allowances: e.allowances, overtime: 0, bonus: 0, deductions: 0, insEmployee: e.insEmployee, insEmployer: e.insEmployer, tax: e.tax, advance: 0 }; };

export function payrollProblem(month: string, lines: PayLine[], advances?: Map<string, Units>): string {
  if (!/^\d{4}-\d{2}$/.test(month)) return "اختر الشهر";
  if (!lines.length) return "اختر موظف واحد على الأقل";
  for (const l of lines) {
    if ([l.basic, l.allowances, l.overtime, l.bonus, l.deductions, l.insEmployee, l.insEmployer, l.tax, l.advance].some((x) => x < 0)) return `${l.name}: المبالغ لا تكون بالسالب`;
    if (grossOf(l) < 0) return `${l.name}: الخصومات أكبر من الراتب`;
    if (netOf(l) < 0) return `${l.name}: الصافي بالسالب`;
    if (advances && l.advance > (advances.get(l.employeeId) ?? 0)) return `${l.name}: خصم السلفة أكبر من رصيد سلفته`;
  }
  if (!payrollTotals(lines).gross) return "كشف الرواتب فارغ";
  return "";
}

export interface PayrollAccounts { salaries: string; overtime: string; bonuses: string; employer: string; insurance: string; tax: string; payable: string; advanceOf: (employeeId: string) => string }
/** قيد الاستحقاق: the month's cost by branch and cost centre against what is owed to the staff, the insurance, the tax and the advances taken back. */
export function payrollLines(lines: PayLine[], ids: PayrollAccounts): FinLine[] {
  const out = new Map<string, FinLine>();
  const add = (account: string, debit: Units, credit: Units, l: Pick<PayLine, "branchId" | "centreId">, memo?: string, split = true) => {
    if (!debit && !credit) return;
    const key = [account, split ? l.branchId ?? "" : "", split ? l.centreId ?? "" : "", memo ?? ""].join("|");
    const had = out.get(key);
    if (had) { had.debit += debit; had.credit += credit; }
    else out.set(key, { account, debit, credit, ...(memo ? { memo } : {}), branchId: split ? l.branchId : null, centreId: split ? l.centreId : null });
  };
  for (const l of lines) {
    add(ids.salaries, l.basic + l.allowances - l.deductions, 0, l);
    add(ids.overtime, l.overtime, 0, l);
    add(ids.bonuses, l.bonus, 0, l);
    add(ids.employer, l.insEmployer, 0, l);
    add(ids.insurance, 0, l.insEmployee + l.insEmployer, l, undefined, false);
    add(ids.tax, 0, l.tax, l, undefined, false);
    if (l.advance) add(ids.advanceOf(l.employeeId), 0, l.advance, l, `خصم سلفة ${l.name}`, false);
    add(ids.payable, 0, netOf(l), l, undefined, false);
  }
  return [...out.values()];
}

/** what each employee still owes on their advance account */
export function advanceBalances(employees: FinDoc[], entries: FinEntry[]): Map<string, Units> {
  const byAccount = new Map(employees.map((d) => [employeeOf(d).accountId, d.id]).filter(([a]) => a) as [string, string][]);
  const out = new Map<string, Units>();
  for (const e of entries) if (e.status === "posted") for (const l of e.lines) { const id = byAccount.get(l.account); if (id) out.set(id, (out.get(id) ?? 0) + l.debit - l.credit); }
  return out;
}

const nextNo = (docs: FinDoc[]) => String(Math.max(0, ...docs.map((d) => Number(d.code) || 0)) + 1);

export async function saveEmployee(db: Db, row: FinDoc | null, f: { name: string; branchId: string | null; active: boolean; data: Omit<EmployeeData, "accountId"> }): Promise<FinDoc> {
  const name = f.name.trim();
  if (!name) throw new JournalError("اكتب اسم الموظف");
  if ([f.data.salary, f.data.allowances, f.data.insEmployee, f.data.insEmployer, f.data.tax].some((x) => x < 0)) throw new JournalError("المبالغ لا تكون بالسالب");
  const all = await db.list("finDocs", { where: { kind: EMPLOYEE } });
  if (all.some((d) => d.id !== row?.id && d.name.trim() === name)) throw new JournalError("يوجد موظف بنفس الاسم");
  const fields = { kind: EMPLOYEE, name, branchId: f.branchId, status: f.active ? "active" : "stopped", date: f.data.hired || null };
  const doc = row ? await db.update("finDocs", row.id, { ...fields, data: { ...row.data, ...f.data } }) : await db.insert("finDocs", { ...fields, code: nextNo(all), data: { ...f.data, accountId: "" } });
  const acc = await partyAccount(db, { key: "staff.advances", linkType: EMPLOYEE_LINK, linkId: doc.id, name, kind: "employee" });
  return employeeOf(doc).accountId === acc.id ? doc : db.update("finDocs", doc.id, { data: { ...doc.data, accountId: acc.id } });
}

/** سلفة موظف: a payment voucher on the employee's own account. */
export async function giveAdvance(db: Db, v: { employeeId: string; date: string; moneyId: string; amount: Units; memo: string; branchId: string | null; paidIn?: { currency: string; amount: Units; rate: number } }, actor: Actor): Promise<FinEntry> {
  if (!v.moneyId) throw new JournalError("اختر الخزينة أو البنك");
  if (!(v.amount > 0)) throw new JournalError("اكتب المبلغ");
  const emp = await db.get("finDocs", v.employeeId);
  if (!emp || emp.kind !== EMPLOYEE) throw new JournalError("الموظف غير موجود");
  const acc = await partyAccount(db, { key: "staff.advances", linkType: EMPLOYEE_LINK, linkId: emp.id, name: emp.name, kind: "employee" });
  const j = await journalContext(db);
  const year = fiscalYear(v.date, j.settings.yearStartMonth);
  const voucherNo = nextVoucherNo(j.entries, "payment", year);
  return submitEntry(db, null, {
    date: v.date, memo: v.memo.trim() || `سلفة للموظف ${emp.name}`, branchId: v.branchId, kind: "payment", sourceType: "voucher", sourceId: `payment:${year}:${voucherNo}`,
    lines: [{ account: acc.id, debit: v.amount, credit: 0 }, { account: v.moneyId, debit: 0, credit: v.amount }], meta: { voucherNo, party: emp.name, employeeId: emp.id, advance: true, ...(v.paidIn ? { paidIn: v.paidIn } : {}) },
  }, actor);
}

/** كشف رواتب الشهر: one document and one accrual entry dated the last day of the month. An employee is paid once a month. */
export async function runPayroll(db: Db, v: { month: string; lines: PayLine[]; note: string; date?: string }, actor: Actor): Promise<FinDoc> {
  const employees = await db.list("finDocs", { where: { kind: EMPLOYEE } });
  const j = await journalContext(db);
  const lines = v.lines.filter((l) => grossOf(l) || l.insEmployer);
  const problem = payrollProblem(v.month, lines, advanceBalances(employees, j.entries));
  if (problem) throw new JournalError(problem);
  const docs = await db.list("finDocs", { where: { kind: PAYROLL } });
  const done = new Set(docs.filter((d) => d.status !== "cancelled" && payrollOf(d).month === v.month).flatMap((d) => payrollOf(d).lines.map((l) => l.employeeId)));
  const twice = lines.find((l) => done.has(l.employeeId));
  if (twice) throw new JournalError(`${twice.name} له كشف رواتب مسجل عن نفس الشهر`);
  const accountOf = new Map(employees.map((d) => [d.id, employeeOf(d).accountId]));
  const t = payrollTotals(lines);
  const data: PayrollData = { month: v.month, lines, gross: t.gross, net: t.net, entryId: null, payEntryId: null, paidFrom: null, paidOn: null, note: v.note.trim(), by: actor.name };
  const date = v.date ?? monthEnd(v.month);
  const doc = await db.insert("finDocs", { kind: PAYROLL, code: nextNo(docs), name: `رواتب ${v.month.split("-").reverse().join("/")}`, branchId: null, status: "posted", date, data: data as unknown as Record<string, unknown> });
  const e = await postSystem(db, {
    date, memo: `استحقاق رواتب ${v.month.split("-").reverse().join("/")}`, branchId: null, kind: "auto", sourceType: PAYROLL, sourceId: doc.id, meta: { month: v.month, employees: lines.length },
    lines: payrollLines(lines, { salaries: linkedAccount(j, "salaries"), overtime: linkedAccount(j, "overtime"), bonuses: linkedAccount(j, "bonuses"), employer: linkedAccount(j, "social.employer"), insurance: linkedAccount(j, "social.insurance"), tax: linkedAccount(j, "tax.payroll"), payable: linkedAccount(j, "salaries.payable"),
      advanceOf: (id) => { const a = accountOf.get(id); if (!a) throw new JournalError("موظف في الكشف ليس له حساب سلف"); return a; } }),
  }, j);
  return db.update("finDocs", doc.id, { data: { ...data, entryId: e?.id ?? null } as unknown as Record<string, unknown> });
}

/** صرف الرواتب: the whole net of the payroll leaves one till or bank. */
export async function payPayroll(db: Db, id: string, v: { date: string; moneyId: string }): Promise<FinDoc> {
  const doc = await db.get("finDocs", id);
  if (!doc || doc.kind !== PAYROLL) throw new JournalError("كشف الرواتب غير موجود");
  if (doc.status !== "posted") throw new JournalError(doc.status === "paid" ? "الكشف مصروف بالفعل" : "الكشف ملغي");
  if (!v.moneyId) throw new JournalError("اختر الخزينة أو البنك");
  const d = payrollOf(doc);
  const j = await journalContext(db);
  const e = await postSystem(db, { date: v.date, memo: `صرف ${doc.name}`, branchId: null, kind: "auto", sourceType: "payroll-pay", sourceId: doc.id, meta: { month: d.month }, lines: [{ account: linkedAccount(j, "salaries.payable"), debit: d.net, credit: 0 }, { account: v.moneyId, debit: 0, credit: d.net }] }, j);
  return db.update("finDocs", id, { status: "paid", data: { ...d, payEntryId: e?.id ?? null, paidFrom: v.moneyId, paidOn: v.date } as unknown as Record<string, unknown> });
}

export async function cancelPayroll(db: Db, id: string, actor: Actor, today: string): Promise<FinDoc> {
  const doc = await db.get("finDocs", id);
  if (!doc || doc.kind !== PAYROLL) throw new JournalError("كشف الرواتب غير موجود");
  if (doc.status === "paid") throw new JournalError("الكشف مصروف. اعكس قيد الصرف من القيود أولا.");
  if (doc.status !== "posted") throw new JournalError("الكشف ملغي بالفعل");
  const d = payrollOf(doc);
  const rev = d.entryId ? await reverseEntry(db, d.entryId, { date: doc.date ?? today, memo: `إلغاء ${doc.name}` }, actor) : null;
  return db.update("finDocs", id, { status: "cancelled", data: { ...d, cancelEntryId: rev?.id ?? null } as unknown as Record<string, unknown> });
}
