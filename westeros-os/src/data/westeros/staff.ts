/**
 * Small constants the sign-in screens need. Kept apart from ./seed.ts so the login screens do not pull the whole
 * demo seed (hundreds of KB) into the first download.
 */
import type { Role } from "@/auth/roles";

export const WESTEROS_SLUG = "westeros";
export const WESTEROS_PASSWORD = "westeros2026";
export const BRAND = { navy: "#0D0D0D", gold: "#F8BB18" } as const;

/** First accounts: role placeholders to rename in Staff. */
export const WESTEROS_STAFF: { key: string; name: string; role: Role; pin: string; email?: string; color: string; phone: string }[] = [
  { key: "owner", name: "إدارة وستروس", role: "owner", pin: "1000", email: "owner@westeros.local", color: "#0D0D0D", phone: "" },
  { key: "admin", name: "مدير النظام", role: "admin", pin: "2000", email: "admin@westeros.local", color: "#6b4fa0", phone: "" },
  { key: "manager", name: "مدير الفرع", role: "manager", pin: "3000", email: "manager@westeros.local", color: "#a8700c", phone: "" },
  { key: "cashier1", name: "كاشير 1", role: "cashier", pin: "4000", color: "#c2412d", phone: "" },
  { key: "cashier2", name: "كاشير 2", role: "cashier", pin: "4100", color: "#2f6f9f", phone: "" },
  { key: "waiter1", name: "جرسون 1", role: "waiter", pin: "5000", color: "#1d7f4a", phone: "" },
  { key: "waiter2", name: "جرسون 2", role: "waiter", pin: "5100", color: "#b4531f", phone: "" },
  { key: "chef", name: "شيف 1", role: "chef", pin: "6000", color: "#7a5a12", phone: "" },
  { key: "chef2", name: "شيف 2", role: "chef", pin: "6100", color: "#4b6b3a", phone: "" },
  { key: "chef3", name: "شيف 3", role: "chef", pin: "6200", color: "#3a5f7a", phone: "" },
  { key: "chef4", name: "شيف 4", role: "chef", pin: "6300", color: "#9a3b6b", phone: "" },
  { key: "kitchen", name: "مساعد مطبخ", role: "kitchen", pin: "7000", color: "#5f7a3a", phone: "" },
  { key: "delivery", name: "طيار 1", role: "delivery", pin: "8000", color: "#7a3a5f", phone: "" },
  { key: "accountant", name: "المحاسب", role: "accountant", pin: "9000", email: "accountant@westeros.local", color: "#5b6a64", phone: "" },
];
