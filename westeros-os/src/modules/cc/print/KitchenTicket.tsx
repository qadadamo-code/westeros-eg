/** طلبية المطبخ على الورق (Saqr 2026-11-25): what the kitchen printer prints, shaped by التشغيل > اعدادات التشغيل > شاشة المطبخ. */
import type { KitchenTicketDesign } from "@/data/types";
import { PAPER_MM } from "@/lib/receipt";

export interface KitchenTicketData {
  number: number | string;
  channel: string | null;
  table: string | null;
  customer: string | null;
  cashier: string | null;
  at: string;
  printer: string | null;
  note?: string | null;
  /** كود الطلب في تطبيق التوصيل */
  appCode?: string | null;
  lines: { qty: number; name: string; modifiers: string[]; notes: string; toGo?: boolean }[];
}

export function KitchenTicketView({ data, design, paper }: { data: KitchenTicketData; design: KitchenTicketDesign; paper: "58" | "80" }) {
  const fs = design.fontSize;
  const { order, bottom } = ticketLayout(design);
  const value: Record<string, string | null> = {
    appCode: design.appCode !== false && data.appCode ? `كود الطلب: ${data.appCode}` : null,
    channel: design.channel && data.channel ? data.channel : null,
    table: design.table && data.table ? `ترابيزة ${data.table}` : null,
    customer: design.customer && data.customer ? data.customer : null,
    cashier: design.cashier && data.cashier ? `الكاشير: ${data.cashier}` : null,
    time: design.time ? new Date(data.at).toLocaleString("en-GB", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" }) : null,
    printer: data.printer,
  };
  const row = (k: string) => (value[k] ? <div key={k} style={{ textAlign: "center", fontWeight: k === "time" || k === "printer" ? 400 : 700, fontSize: k === "printer" ? fs * 0.8 : k === "time" ? fs * 0.85 : fs }} dir={k === "time" ? "ltr" : undefined}>{value[k]}</div> : null);
  const top = order.filter((k) => !bottom.includes(k));
  const under = order.filter((k) => bottom.includes(k) && value[k]);
  return (
    <div dir="rtl" data-kitchen-ticket style={{ width: `${PAPER_MM[paper] - 6}mm`, padding: "3mm", background: "#fff", color: "#000", fontSize: fs, lineHeight: 1.35, fontFamily: "inherit" }}>
      {design.header ? <div style={{ textAlign: "center", fontWeight: 800, fontSize: fs * 1.1 }}>{design.header}</div> : null}
      <div style={{ textAlign: "center", fontWeight: 900, fontSize: fs * 2.1, margin: "1mm 0" }} dir="ltr">#{data.number}</div>
      {top.map(row)}
      <div style={{ borderTop: "1.5px dashed #000", margin: "2mm 0" }} />
      {design.notes && data.note ? <div style={{ fontWeight: 800, border: "1.5px solid #000", padding: "1mm 2mm", marginBottom: "2mm" }}>{data.note}</div> : null}
      {data.lines.map((l, i) => (
        <div key={i} style={{ marginBottom: "1.5mm" }}>
          <div style={{ display: "flex", gap: "2mm", fontWeight: 800, fontSize: fs * 1.15 }}>
            <span dir="ltr" style={{ minWidth: "8mm" }}>{l.qty}×</span>
            <span style={{ flex: 1 }}>{l.name}{l.toGo ? " (سفري)" : ""}</span>
          </div>
          {design.notes && l.notes ? <div style={{ paddingInlineStart: "10mm", fontWeight: 700 }}>* {l.notes}</div> : null}
          {design.modifiers && l.modifiers.length ? <div style={{ paddingInlineStart: "10mm" }}>{l.modifiers.map((m, j) => <div key={j}>+ {m}</div>)}</div> : null}
        </div>
      ))}
      <div style={{ borderTop: "1.5px dashed #000", marginTop: "2mm" }} />
      {under.length ? <div style={{ marginTop: "1.5mm" }}>{under.map(row)}</div> : null}
    </div>
  );
}

/** the ticket's data rows in their default order (the design reorders them and moves some under the items) */
export const TICKET_KEYS: { key: string; label: string }[] = [
  { key: "appCode", label: "كود الطلب (تطبيق توصيل)" },
  { key: "channel", label: "قناة البيع" },
  { key: "table", label: "رقم الترابيزة" },
  { key: "customer", label: "اسم العميل" },
  { key: "cashier", label: "الموظف" },
  { key: "time", label: "الوقت" },
  { key: "printer", label: "اسم الطابعة" },
];
export function ticketLayout(d: Pick<KitchenTicketDesign, "layout">) {
  const saved = d.layout?.order ?? [];
  const order = [...saved.filter((k) => TICKET_KEYS.some((m) => m.key === k)), ...TICKET_KEYS.map((m) => m.key).filter((k) => !saved.includes(k))];
  return { order, bottom: d.layout?.bottom ?? [] };
}

export const SAMPLE_TICKET: KitchenTicketData = {
  number: 42,
  channel: "صالة",
  table: "5",
  customer: "أحمد",
  cashier: "كاشير 1",
  at: new Date().toISOString(),
  printer: "طابعة المطبخ",
  note: "الطلب مستعجل",
  appCode: "TLB-48213",
  lines: [
    { qty: 2, name: "كلاسيك بيف برجر", modifiers: ["دبل بيف", "جبنة شيدر"], notes: "استوا ميديم" },
    { qty: 1, name: "بطاطس", modifiers: [], notes: "", toGo: true },
  ],
};
