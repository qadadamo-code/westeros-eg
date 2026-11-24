/** طرق الدفع (Mohammed 2026-11-24): in sales (the till) and in purchases and expenses, each tied to a till, safe or bank account. Pure. */
import type { FinSettingsData, PayMethodDef } from "@/data/financeTypes";
import type { PaymentMethod } from "@/data/types";

export type PaySide = "sales" | "buying";
export const BASE_LABEL: Record<NonNullable<PayMethodDef["base"]>, string> = { cash: "كاش (بيحسب الباقي)", card: "فيزا / كارت", wallet: "محفظة إلكترونية", instapay: "انستاباي" };

export const payMethodsOf = (s: Partial<FinSettingsData> | null | undefined, side: PaySide): PayMethodDef[] => s?.payMethods?.[side] ?? [];
export const activePayMethods = (s: Partial<FinSettingsData> | null | undefined, side: PaySide): PayMethodDef[] => payMethodsOf(s, side).filter((m) => m.active);

/** the till's tender for a sales method */
export const tenderOf = (m: Pick<PayMethodDef, "base">): PaymentMethod => m.base ?? "card";

/** what is wrong with a method before it is saved, or "" */
export function payMethodProblem(m: Pick<PayMethodDef, "name" | "accountId">, list: PayMethodDef[], id?: string): string {
  const n = m.name.trim();
  if (!n) return "اكتب اسم طريقة الدفع";
  if (list.some((x) => x.id !== id && x.name.trim() === n)) return "الاسم موجود";
  if (!m.accountId) return "اختر الخزينة أو البنك";
  return "";
}
