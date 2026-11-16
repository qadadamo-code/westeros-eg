/** Plain-language description of a journalled change (table, what happened, which record, which fields). */
import type { ChangeRow } from "@/data/repo";

type L2 = { ar: string; en: string };

const TABLES: Record<string, L2> = {
  orders: { ar: "طلب", en: "Order" },
  order_items: { ar: "صنف في طلب", en: "Order item" },
  checks: { ar: "شيك", en: "Check" },
  payments: { ar: "دفعة", en: "Payment" },
  receipts: { ar: "إيصال", en: "Receipt" },
  shifts: { ar: "وردية", en: "Shift" },
  menu_items: { ar: "صنف منيو", en: "Menu item" },
  menu_categories: { ar: "قسم منيو", en: "Menu category" },
  modifiers: { ar: "إضافة", en: "Modifier" },
  modifier_groups: { ar: "مجموعة إضافات", en: "Modifier group" },
  customers: { ar: "عميل", en: "Customer" },
  reservations: { ar: "حجز", en: "Reservation" },
  memberships: { ar: "موظف", en: "Staff member" },
  dining_tables: { ar: "ترابيزة", en: "Table" },
  settings: { ar: "الإعدادات", en: "Settings" },
  stock_items: { ar: "خامة", en: "Stock item" },
  stock_moves: { ar: "حركة مخزن", en: "Stock move" },
  stock_batches: { ar: "تشغيلة مخزن", en: "Stock lot" },
  purchase_orders: { ar: "طلب شراء", en: "Purchase order" },
  suppliers: { ar: "مورد", en: "Supplier" },
  recipes: { ar: "وصفة", en: "Recipe" },
  mfg_batches: { ar: "تشغيلة تصنيع", en: "Production batch" },
  mfg_products: { ar: "منتج مصنّع", en: "Manufactured product" },
  checklist_runs: { ar: "قائمة وردية", en: "Checklist run" },
  checklist_templates: { ar: "قالب قائمة", en: "Checklist template" },
  journal_entries: { ar: "قيد محاسبي", en: "Journal entry" },
  expenses: { ar: "مصروف", en: "Expense" },
};

const FIELDS: Record<string, L2> = {
  name: { ar: "الاسم", en: "name" },
  price: { ar: "السعر", en: "price" },
  status: { ar: "الحالة", en: "status" },
  qty: { ar: "الكمية", en: "quantity" },
  available: { ar: "متاح", en: "available" },
  total: { ar: "الإجمالي", en: "total" },
  discount: { ar: "الخصم", en: "discount" },
  phone: { ar: "الموبايل", en: "phone" },
  role: { ar: "الدور", en: "role" },
  note: { ar: "ملاحظة", en: "note" },
  notes: { ar: "ملاحظات", en: "notes" },
  levels: { ar: "حدود المخزون", en: "stock levels" },
  tax: { ar: "الضرايب", en: "tax" },
  invoice: { ar: "الفاتورة", en: "invoice" },
};

const OPS: Record<ChangeRow["op"], L2> = { I: { ar: "إضافة", en: "Added" }, U: { ar: "تعديل", en: "Changed" }, D: { ar: "حذف", en: "Deleted" } };

export const tableLabel = (table: string, lang: "ar" | "en") => TABLES[table]?.[lang] ?? table.replace(/_/g, " ");
export const opLabel = (op: ChangeRow["op"], lang: "ar" | "en") => OPS[op][lang];

/** The record's own name, number or label, whichever it has. */
export function recordName(c: Pick<ChangeRow, "before" | "after">, lang: "ar" | "en"): string {
  const r = c.after ?? c.before ?? {};
  for (const k of ["name", "title", "label"]) {
    const v = r[k];
    if (typeof v === "string" && v) return v;
    if (v && typeof v === "object") {
      const loc = v as Record<string, unknown>;
      const s = loc[lang] ?? loc.ar ?? loc.en;
      if (typeof s === "string" && s) return s;
    }
  }
  for (const k of ["number", "receipt_no", "code"]) {
    const v = r[k];
    if (typeof v === "number" || (typeof v === "string" && v)) return `#${v}`;
  }
  return "";
}

/** Columns whose value differs between before and after (bookkeeping columns left out). */
export function changedFields(c: Pick<ChangeRow, "op" | "before" | "after">): string[] {
  if (c.op !== "U" || !c.before || !c.after) return [];
  const out: string[] = [];
  for (const k of Object.keys(c.after)) {
    if (k === "updated_at") continue;
    if (JSON.stringify(c.after[k]) !== JSON.stringify(c.before[k])) out.push(k);
  }
  return out;
}

export function fieldsText(fields: string[], lang: "ar" | "en"): string {
  const named = fields.filter((f) => FIELDS[f]).map((f) => FIELDS[f][lang]);
  const rest = fields.length - named.length;
  const sep = lang === "ar" ? "، " : ", ";
  if (!named.length) return rest ? (lang === "ar" ? `${rest} حقل` : `${rest} field${rest === 1 ? "" : "s"}`) : "";
  return named.slice(0, 3).join(sep) + (rest + Math.max(0, named.length - 3) ? (lang === "ar" ? ` و${rest + Math.max(0, named.length - 3)} غيرها` : ` +${rest + Math.max(0, named.length - 3)} more`) : "");
}

/** Only the newest change of a record can be undone (the database enforces the same rule). */
export function undoable(c: ChangeRow, all: ChangeRow[]): boolean {
  if (c.undoneAt || c.source !== "app") return false;
  return !all.some((n) => n.table === c.table && n.rowId === c.rowId && n.id > c.id);
}
