import type { InvoiceDesign, InvoiceTemplate } from "@/data/types";

export const DEFAULT_DESIGN: InvoiceDesign = {
  paper: "80",
  logoDataUrl: null,
  accent: "#0d5a53",
  fontSize: 12,
  fields: {
    branch: true,
    address: true,
    phone: true,
    taxId: true,
    activityCode: true,
    cashier: true,
    table: true,
    guests: true,
    orderType: true,
    customer: true,
    modifiers: true,
    itemNotes: true,
    serviceVatLines: true,
    payments: true,
    etaUuid: true,
    receiptNo: true,
    discounts: true,
    appOrderCode: true,
    driver: true,
    customerAddress: true,
    freeItems: true,
  },
};

/** the receipt's data rows, in their default order (the designer reorders them and moves some under the totals) */
export const META_KEYS: { key: string; label: string }[] = [
  { key: "receiptNo", label: "رقم الإيصال" },
  { key: "orderNo", label: "رقم الطلب" },
  { key: "appOrderCode", label: "كود طلب التطبيق" },
  { key: "date", label: "التاريخ" },
  { key: "orderType", label: "قناة البيع / النوع" },
  { key: "table", label: "الترابيزة" },
  { key: "guests", label: "عدد الأفراد" },
  { key: "cashier", label: "الكاشير" },
  { key: "waiter", label: "الجرسون" },
  { key: "customer", label: "العميل" },
  { key: "phone", label: "موبايل العميل" },
  { key: "address", label: "عنوان العميل" },
  { key: "driver", label: "الطيار" },
];
export const layoutOf = (d: Pick<InvoiceDesign, "layout">) => {
  const saved = d.layout?.order ?? [];
  const order = [...saved.filter((k) => META_KEYS.some((m) => m.key === k)), ...META_KEYS.map((m) => m.key).filter((k) => !saved.includes(k))];
  return { order, bottom: d.layout?.bottom ?? [] };
};

/** The invoice template with every designer field filled (older settings rows have no `design`). */
export function resolveDesign(t: Pick<InvoiceTemplate, "design" | "paperWidth"> | null | undefined): InvoiceDesign {
  const d = t?.design;
  return {
    ...DEFAULT_DESIGN,
    ...(t?.paperWidth ? { paper: String(t.paperWidth) as "58" | "80" } : {}),
    ...(d ?? {}),
    fields: { ...DEFAULT_DESIGN.fields, ...(d?.fields ?? {}) },
  };
}

export const PAPER_MM: Record<InvoiceDesign["paper"], number> = { "58": 58, "80": 80, a4: 210 };
