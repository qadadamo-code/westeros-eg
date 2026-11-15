/**
 * The batch sticker: product, batch number, production and expiry dates, the chef who made it, quantity and storage.
 * One sticker per product of the batch, printed on a label printer installed as a system printer (the page is the
 * label size, so each sticker is one page).
 */
import type { ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import type { MfgBatch, MfgBatchOutput } from "@/data/types";
import { qrMatrix } from "@/lib/receipt/qr";

export interface LabelSize {
  id: string;
  w: number;
  h: number;
}
export const LABEL_SIZES: LabelSize[] = [
  { id: "60x40", w: 60, h: 40 },
  { id: "50x30", w: 50, h: 30 },
  { id: "80x50", w: 80, h: 50 },
];
const SIZE_KEY = "westeros-os.labelSize";
export const savedLabelSize = (): LabelSize => {
  try {
    return LABEL_SIZES.find((s) => s.id === localStorage.getItem(SIZE_KEY)) ?? LABEL_SIZES[0];
  } catch {
    return LABEL_SIZES[0];
  }
};
export const saveLabelSize = (id: string) => {
  try {
    localStorage.setItem(SIZE_KEY, id);
  } catch {
    /* private mode */
  }
};

const TEMP: Record<MfgBatchOutput["storageTemp"], string> = { chilled: "مبرد 0-4°", frozen: "مجمد -18°", room: "حرارة الغرفة" };
const d2 = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { timeZone: "Africa/Cairo", day: "2-digit", month: "2-digit", year: "numeric" });
const t2 = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { timeZone: "Africa/Cairo", hour: "2-digit", minute: "2-digit" });

export type LabelBatch = Pick<MfgBatch, "number" | "madeAt" | "chefName" | "chefCode">;

/** Sized in millimetres; all type scales with the label height so the three sizes share one layout. */
export function BatchLabel({ batch, output, size, index, of }: { batch: LabelBatch; output: MfgBatchOutput; size: LabelSize; index?: number; of?: number }) {
  const u = size.h / 40; // 1u = 1mm on the 60×40 label
  const qr = qrMatrix(batch.number, "M");
  const qty = output.unit === "pc" ? `${output.count ?? 0} قطعة` : `${Math.round((output.weightKg ?? 0) * 1000) / 1000} كجم`;
  const Line = ({ k, v, bold }: { k: string; v: ReactNode; bold?: boolean }) => (
    <div style={{ display: "flex", justifyContent: "space-between", gap: `${1.5 * u}mm`, fontSize: `${2.55 * u}mm`, lineHeight: 1.25 }}>
      <span style={{ fontWeight: 500 }}>{k}</span>
      <span dir="ltr" style={{ fontWeight: bold ? 800 : 700, whiteSpace: "nowrap" }}>{v}</span>
    </div>
  );
  return (
    <div
      dir="rtl"
      className="mfg-label"
      style={{ width: `${size.w}mm`, height: `${size.h}mm`, boxSizing: "border-box", padding: `${1.6 * u}mm ${2 * u}mm`, background: "#fff", color: "#000", fontFamily: "'Tajawal','IBM Plex Sans Arabic',system-ui,sans-serif", display: "flex", flexDirection: "column", overflow: "hidden" }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: `${0.3 * u}mm solid #000`, paddingBottom: `${0.7 * u}mm` }}>
        <span dir="ltr" style={{ fontSize: `${2.3 * u}mm`, fontWeight: 800, letterSpacing: "0.12em" }}>WESTEROS</span>
        <span style={{ fontSize: `${2.2 * u}mm`, fontWeight: 700 }}>{TEMP[output.storageTemp]}{output.storageMethod ? ` · ${output.storageMethod}` : ""}</span>
      </div>
      <div style={{ fontSize: `${4.3 * u}mm`, fontWeight: 800, lineHeight: 1.15, margin: `${0.9 * u}mm 0 ${0.6 * u}mm`, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{output.name.ar}</div>
      <div style={{ display: "flex", gap: `${2 * u}mm`, flex: 1, minHeight: 0 }}>
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
          <Line k="إنتاج" v={`${d2(batch.madeAt)} ${t2(batch.madeAt)}`} />
          <Line k="انتهاء" v={d2(output.expiresAt)} bold />
          <Line k="الشيف" v={<span dir="rtl">{batch.chefName} ({batch.chefCode})</span>} />
          <Line k="الكمية" v={<span dir="rtl">{qty}{of && of > 1 ? ` · ${index}/${of}` : ""}</span>} />
          <div dir="ltr" style={{ fontSize: `${2.9 * u}mm`, fontWeight: 800, textAlign: "center", border: `${0.3 * u}mm solid #000`, borderRadius: `${0.8 * u}mm`, padding: `${0.3 * u}mm 0`, marginTop: `${0.4 * u}mm`, letterSpacing: "0.02em" }}>{batch.number}</div>
        </div>
        <svg viewBox={`0 0 ${qr.size} ${qr.size}`} shapeRendering="crispEdges" style={{ width: `${15 * u}mm`, height: `${15 * u}mm`, alignSelf: "center", flexShrink: 0 }} aria-hidden>
          <path d={qr.path} fill="#000" />
        </svg>
      </div>
    </div>
  );
}

const ROOT_ID = "ws-label-root";

/** Prints `copies` stickers for each product of the batch through the browser's print dialog. */
export function printLabels(batch: LabelBatch, outputs: MfgBatchOutput[], size: LabelSize, copies: number): Promise<void> {
  if (typeof document === "undefined") return Promise.resolve();
  document.getElementById(ROOT_ID)?.remove();
  document.getElementById(`${ROOT_ID}-css`)?.remove();
  const host = document.createElement("div");
  host.id = ROOT_ID;
  const css = document.createElement("style");
  css.id = `${ROOT_ID}-css`;
  css.textContent = `
#${ROOT_ID}{position:fixed;inset:auto auto 0 -10000px;}
@media print{
  @page{size:${size.w}mm ${size.h}mm;margin:0}
  html,body{background:#fff!important;height:auto!important;overflow:visible!important;margin:0!important}
  body>*:not(#${ROOT_ID}){display:none!important}
  #${ROOT_ID}{position:static!important;display:block!important}
  #${ROOT_ID} .mfg-label{break-after:page;page-break-after:always}
}`;
  document.head.appendChild(css);
  document.body.appendChild(host);
  const root = createRoot(host);
  const n = Math.max(1, Math.min(200, Math.round(copies)));
  flushSync(() =>
    root.render(
      <>
        {outputs.flatMap((o, oi) => Array.from({ length: n }, (_, i) => <BatchLabel key={`${oi}-${i}`} batch={batch} output={o} size={size} index={i + 1} of={n} />))}
      </>,
    ),
  );
  return new Promise<void>((resolve) => {
    let finished = false;
    const done = () => {
      if (finished) return;
      finished = true;
      window.removeEventListener("afterprint", done);
      setTimeout(() => {
        root.unmount();
        host.remove();
        css.remove();
        resolve();
      }, 50);
    };
    window.addEventListener("afterprint", done);
    const ready = (document as Document & { fonts?: { ready: Promise<unknown> } }).fonts?.ready ?? Promise.resolve();
    ready.then(() => {
      try {
        window.print();
      } finally {
        setTimeout(done, 1500);
      }
    });
  });
}
