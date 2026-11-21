/**
 * المستخدمين ↔ اكسل: every field of the employee card in one sheet, and back.
 * Import (his rule 2026-11-17): matched by the employee code; an existing code updates that employee, a new code adds
 * one. The code decides the role (each role has its own code range); a role column that names another role leaves
 * the row out. A new employee has no PIN: it is set from his card. The owner has no code and is never imported.
 */
import type { Db } from "@/data/hooks";
import type { Membership, MfgSettings, MfgUserType } from "@/data/types";
import type { ContractType, StaffProfile } from "@/data/hrTypes";
import { listsOf, rangeOf, userTypeOf, userTypesOf } from "../lib";
import { sheetCode, type Cell } from "../xlsx";
import type { ImportField, ImportPlan } from "../catalog/Import";

export const CONTRACTS: { value: ContractType; label: string }[] = [
  { value: "permanent", label: "دائم" },
  { value: "fixed_term", label: "مدة محددة" },
  { value: "part_time", label: "دوام جزئي" },
  { value: "probation", label: "تحت الاختبار" },
  { value: "daily", label: "يومي" },
];

export const USER_FIELDS: ImportField[] = [
  { key: "الكود", aliases: ["كود الموظف", "كود", "رقم الموظف", "code"] },
  { key: "الاسم", aliases: ["اسم الموظف", "الموظف", "name"] },
  { key: "المسمى الوظيفي", aliases: ["الوظيفة", "position"] },
  { key: "الدور", aliases: ["نوع المستخدم", "role"] },
  { key: "مكان العمل", aliases: ["الفرع", "branch"] },
  { key: "الموبايل", aliases: ["رقم الموبايل", "التليفون", "الهاتف", "phone"] },
  { key: "الإيميل", aliases: ["البريد", "email"] },
  { key: "الرقم القومي", aliases: ["رقم البطاقة"] },
  { key: "تاريخ الميلاد" },
  { key: "العنوان" },
  { key: "تاريخ التعيين" },
  { key: "نوع التعاقد", aliases: ["التعاقد"] },
  { key: "رقم البصمة", aliases: ["كود البصمة"] },
  { key: "اسم شخص للطوارئ", aliases: ["الطوارئ"] },
  { key: "موبايل الطوارئ" },
  { key: "الحالة" },
  { key: "ملاحظات" },
];
export const USER_HEAD = USER_FIELDS.map((f) => f.key);

interface Ctx { members: Membership[]; profiles: StaffProfile[]; settings: MfgSettings; branches: { id: string; name: { ar: string } }[] }

const contractLabel = (c: ContractType | undefined) => CONTRACTS.find((x) => x.value === c)?.label ?? "";
const branchesText = (ctx: Ctx, m: Membership) => (m.branchIds.length ? m.branchIds.map((b) => ctx.branches.find((x) => x.id === b)?.name.ar ?? "").join("، ") : "كل الفروع");

/** the rows of the sheet, in the columns of USER_HEAD */
export function exportUsers(ctx: Ctx, members: Membership[]): Cell[][] {
  const lists = listsOf(ctx.settings);
  const codes = ctx.settings.chefCodes ?? {};
  return members.map((m) => {
    const p = ctx.profiles.find((x) => x.membershipId === m.id);
    return [
      codes[m.id] ?? "", m.name, p?.position.ar ?? "", m.role === "owner" ? "صاحب الحساب" : userTypeOf(m, lists)?.name ?? "", branchesText(ctx, m),
      m.phone ?? "", m.email ?? "", p?.nationalId ?? "", p?.birthDate ?? "", p?.address ?? "", p?.hireDate ?? "", contractLabel(p?.contractType),
      p?.deviceUserId ?? "", p?.emergencyContact?.name ?? "", p?.emergencyContact?.phone ?? "", m.active ? "نشط" : "غير نشط", p?.notes ?? "",
    ];
  });
}

/** a date typed or saved by Excel: 2026-11-21, 21/11/2026, or Excel's day number */
export function sheetDay(s: string): string | null {
  const t = s.trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(t)) return t.slice(0, 10);
  const m = t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  if (/^\d{5}(\.\d+)?$/.test(t)) return new Date(Math.round((Number(t) - 25569) * 86_400_000)).toISOString().slice(0, 10);
  return null;
}
const norm = (s: string) => s.replace(/[أإآ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي").replace(/\s+/g, " ").trim();

/**
 * Reads the rows (only the columns tied in the mapping step are present) and, unless `dry`, saves them.
 * A column left untied keeps what the employee has.
 */
export async function importUsers(db: Db, ctx: Ctx, rows: Record<string, string>[], dry: boolean): Promise<ImportPlan & { reasons: string[] }> {
  const lists = listsOf(ctx.settings);
  const types = userTypesOf(lists);
  const codes: Record<string, number> = { ...(ctx.settings.chefCodes ?? {}) };
  const typeOf: Record<string, string> = { ...(lists.userTypeOf ?? {}) };
  const byCode = new Map(Object.entries(codes).filter(([id]) => ctx.members.some((m) => m.id === id)).map(([id, c]) => [c, id]));
  const plan: ImportPlan & { reasons: string[] } = { added: [], updated: [], skipped: 0, reasons: [] };
  const seen = new Set<number>();
  const skip = (why: string) => { plan.skipped++; if (plan.reasons.length < 8) plan.reasons.push(why); };
  const has = (r: Record<string, string>, k: string) => k in r;
  for (const r of rows) {
    const code = Number(sheetCode(r["الكود"]));
    if (!Number.isInteger(code) || code <= 0) { skip("صف من غير كود"); continue; }
    if (seen.has(code)) { skip(`الكود ${code} متكرر في الملف`); continue; }
    seen.add(code);
    const type = types.find((t) => code >= rangeOf(t).from && code <= rangeOf(t).to);
    if (!type) { skip(`الكود ${code} مش في مدى أكواد أي دور`); continue; }
    const named = (r["الدور"] ?? "").trim();
    if (named && norm(named) !== norm(type.name)) { skip(`الكود ${code} من أكواد "${type.name}" والملف كاتب "${named}"`); continue; }
    const id = byCode.get(code);
    const old = id ? ctx.members.find((m) => m.id === id) : undefined;
    const name = (r["الاسم"] ?? "").trim() || old?.name || "";
    if (!name) { skip(`الكود ${code} جديد ومن غير اسم`); continue; }
    if (old?.role === "owner") { skip("صاحب الحساب مش بيتعدل من الاستيراد"); continue; }
    // مكان العمل: "كل الفروع" or empty = all, else branch names
    let branchIds = old?.branchIds ?? [];
    if (has(r, "مكان العمل")) {
      const v = (r["مكان العمل"] ?? "").trim();
      if (!v || norm(v) === norm("كل الفروع")) branchIds = [];
      else {
        const b = ctx.branches.find((x) => norm(x.name.ar) === norm(v));
        if (!b) { skip(`الفرع "${v}" مش موجود (الكود ${code})`); continue; }
        branchIds = [b.id];
      }
    }
    const day = (k: string, fallback: string | null) => (has(r, k) ? ((r[k] ?? "").trim() ? sheetDay(r[k]) : null) : fallback);
    const prof = old ? ctx.profiles.find((p) => p.membershipId === old.id) : undefined;
    const contractText = (r["نوع التعاقد"] ?? "").trim();
    const contract = contractText ? CONTRACTS.find((c) => norm(c.label) === norm(contractText))?.value : undefined;
    if (contractText && !contract) { skip(`نوع التعاقد "${contractText}" مش معروف (الكود ${code})`); continue; }
    const text = (k: string, fallback: string | null | undefined) => (has(r, k) ? (r[k] ?? "").trim() : fallback ?? "");
    const status = (r["الحالة"] ?? "").trim();
    const active = status ? norm(status) !== norm("غير نشط") && !/موقوف|متوقف/.test(status) : old?.active ?? true;
    (old ? plan.updated : plan.added).push({ code: String(code), name });
    if (dry) continue;
    const base = { name, phone: text("الموبايل", old?.phone) || null, email: text("الإيميل", old?.email) || null, branchIds, role: type.role, active };
    const mid = old ? (await db.update("memberships", old.id, base)).id : (await db.insert("memberships", { ...base, userId: null, color: "#F8BB18", hasPin: false, lastSeenAt: null })).id;
    const em = { name: text("اسم شخص للطوارئ", prof?.emergencyContact?.name), phone: text("موبايل الطوارئ", prof?.emergencyContact?.phone) };
    const card = {
      position: { ar: text("المسمى الوظيفي", prof?.position.ar), en: prof?.position.en ?? "" },
      nationalId: text("الرقم القومي", prof?.nationalId).replace(/\D/g, "") || null,
      birthDate: day("تاريخ الميلاد", prof?.birthDate ?? null),
      address: text("العنوان", prof?.address) || null,
      hireDate: day("تاريخ التعيين", prof?.hireDate ?? null) ?? prof?.hireDate ?? new Date().toISOString().slice(0, 10),
      contractType: contract ?? prof?.contractType ?? "permanent",
      deviceUserId: text("رقم البصمة", prof?.deviceUserId) || null,
      emergencyContact: em.name || em.phone ? { ...em, relation: prof?.emergencyContact?.relation ?? "" } : null,
      notes: text("ملاحظات", prof?.notes),
    };
    if (prof) await db.update("staffProfiles", prof.id, card);
    else await db.insert("staffProfiles", { ...card, membershipId: mid, photoUrl: null, nationality: "EG", contractEnd: null, station: null, foodHandler: false, documents: [], weeklyOff: [5], terminatedAt: null, terminationReason: null });
    codes[mid] = code;
    typeOf[mid] = type.id;
    byCode.set(code, mid);
  }
  if (!dry && (plan.added.length || plan.updated.length)) await db.update("mfgSettings", ctx.settings.id, { chefCodes: codes, lists: { ...lists, userTypes: types as MfgUserType[], userTypeOf: typeOf } });
  return plan;
}
