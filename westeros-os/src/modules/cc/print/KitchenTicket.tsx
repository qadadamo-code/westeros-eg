/** طلبية المطبخ على الورق (Saqr 2026-11-25): what the kitchen printer prints, shaped by ثوابت النظام > التشغيل > شاشة المطبخ. */
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
  lines: { qty: number; name: string; modifiers: string[]; notes: string; toGo?: boolean }[];
}

export function KitchenTicketView({ data, design, paper }: { data: KitchenTicketData; design: KitchenTicketDesign; paper: "58" | "80" }) {
  const fs = design.fontSize;
  const meta = [
    design.channel && data.channel ? data.channel : null,
    design.table && data.table ? `ترابيزة ${data.table}` : null,
    design.customer && data.customer ? data.customer : null,
    design.cashier && data.cashier ? `الكاشير: ${data.cashier}` : null,
  ].filter(Boolean) as string[];
  return (
    <div dir="rtl" data-kitchen-ticket style={{ width: `${PAPER_MM[paper] - 6}mm`, padding: "3mm", background: "#fff", color: "#000", fontSize: fs, lineHeight: 1.35, fontFamily: "inherit" }}>
      {design.header ? <div style={{ textAlign: "center", fontWeight: 800, fontSize: fs * 1.1 }}>{design.header}</div> : null}
      <div style={{ textAlign: "center", fontWeight: 900, fontSize: fs * 2.1, margin: "1mm 0" }} dir="ltr">#{data.number}</div>
      {meta.length ? <div style={{ textAlign: "center", fontWeight: 700 }}>{meta.join(" · ")}</div> : null}
      {design.time ? <div style={{ textAlign: "center", fontSize: fs * 0.85 }} dir="ltr">{new Date(data.at).toLocaleString("en-GB", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" })}</div> : null}
      {data.printer ? <div style={{ textAlign: "center", fontSize: fs * 0.8 }}>{data.printer}</div> : null}
      <div style={{ borderTop: "1.5px dashed #000", margin: "2mm 0" }} />
      {design.notes && data.note ? <div style={{ fontWeight: 800, border: "1.5px solid #000", padding: "1mm 2mm", marginBottom: "2mm" }}>{data.note}</div> : null}
      {data.lines.map((l, i) => (
        <div key={i} style={{ marginBottom: "1.5mm" }}>
          <div style={{ display: "flex", gap: "2mm", fontWeight: 800, fontSize: fs * 1.15 }}>
            <span dir="ltr" style={{ minWidth: "8mm" }}>{l.qty}×</span>
            <span style={{ flex: 1 }}>{l.name}{l.toGo ? " (سفري)" : ""}</span>
          </div>
          {design.modifiers && l.modifiers.length ? <div style={{ paddingInlineStart: "10mm" }}>{l.modifiers.map((m, j) => <div key={j}>+ {m}</div>)}</div> : null}
          {design.notes && l.notes ? <div style={{ paddingInlineStart: "10mm", fontWeight: 700 }}>ملاحظة: {l.notes}</div> : null}
        </div>
      ))}
      <div style={{ borderTop: "1.5px dashed #000", marginTop: "2mm" }} />
    </div>
  );
}

export const SAMPLE_TICKET: KitchenTicketData = {
  number: 42,
  channel: "صالة",
  table: "5",
  customer: "أحمد",
  cashier: "كاشير 1",
  at: new Date().toISOString(),
  printer: "طابعة المطبخ",
  note: "بدون بصل",
  lines: [
    { qty: 2, name: "كلاسيك بيف برجر", modifiers: ["دبل بيف", "جبنة شيدر"], notes: "استوا ميديم" },
    { qty: 1, name: "بطاطس", modifiers: [], notes: "", toGo: true },
  ],
};
