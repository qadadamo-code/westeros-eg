/**
 * The batch sticker: product, batch number, production and expiry dates, the chef who made it, quantity and storage.
 * One sticker per product of the batch, printed on a label printer installed as a system printer. The page is the
 * label size, so the browser picks the orientation from the printer's paper, and the sticker is drawn as a share of
 * the page (not in fixed millimetres) so it fills whatever page the browser ends up with. The printer's stock must be
 * defined as width × height of the label (50 × 25 mm): defined the other way round it prints sideways or at half width.
 */
import type { CSSProperties, ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import type { MfgBatch, MfgBatchOutput } from "@/data/types";
import { COST_CONTROL_ONLY } from "@/costControl";
import { qrMatrix } from "@/lib/receipt/qr";

export interface LabelSize {
  id: string;
  w: number;
  h: number;
}
export const LABEL_SIZES: LabelSize[] = [
  { id: "50x25", w: 50, h: 25 },
  { id: "60x40", w: 60, h: 40 },
  { id: "50x30", w: 50, h: 30 },
  { id: "80x50", w: 80, h: 50 },
];
/** The built-in sizes plus the ones the restaurant added (width × height in mm). */
export function labelSizes(extra?: { w: number; h: number }[] | null): LabelSize[] {
  const out = [...LABEL_SIZES];
  for (const e of extra ?? []) {
    const id = `${e.w}x${e.h}`;
    if (e.w > 0 && e.h > 0 && !out.some((s) => s.id === id)) out.push({ id, w: e.w, h: e.h });
  }
  return out;
}
const SIZE_KEY = "westeros-os.labelSize";
export const savedLabelSize = (sizes: LabelSize[] = LABEL_SIZES): LabelSize => {
  try {
    return sizes.find((s) => s.id === localStorage.getItem(SIZE_KEY)) ?? sizes[0];
  } catch {
    return sizes[0];
  }
};
/** عدد النسخ: one sticker per storage unit, so the produced quantity over what one unit holds, rounded up. */
export function labelCopies(output: Pick<MfgBatchOutput, "unit" | "count" | "weightKg">, storageQty: number | null | undefined): number {
  const made = output.unit === "pc" ? output.count ?? 0 : output.weightKg ?? 0;
  if (!storageQty || storageQty <= 0 || made <= 0) return 1;
  return Math.max(1, Math.ceil(made / storageQty - 1e-9));
}
export const saveLabelSize = (id: string) => {
  try {
    localStorage.setItem(SIZE_KEY, id);
  } catch {
    /* private mode */
  }
};

/** إزاحة الطباعة: how far this device's printer needs the sticker moved (mm; x to the right, y down). Kept per device, because it belongs to the printer. */
export interface LabelShift {
  x: number;
  y: number;
}
const SHIFT_KEY = "westeros-os.labelShift";
export const savedLabelShift = (): LabelShift => {
  try {
    const v = JSON.parse(localStorage.getItem(SHIFT_KEY) ?? "null") as Partial<LabelShift> | null;
    const n = (k: number | undefined) => (typeof k === "number" && Number.isFinite(k) ? Math.max(-15, Math.min(15, k)) : 0);
    return { x: n(v?.x), y: n(v?.y) };
  } catch {
    return { x: 0, y: 0 };
  }
};
export const saveLabelShift = (v: LabelShift) => {
  try {
    localStorage.setItem(SHIFT_KEY, JSON.stringify(v));
  } catch {
    /* private mode */
  }
};

const TEMP: Record<MfgBatchOutput["storageTemp"], string> = { chilled: "مبرد 0-4°", frozen: "مجمد -18°", room: "حرارة الغرفة" };
const d2 = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { timeZone: "Africa/Cairo", day: "2-digit", month: "2-digit", year: "numeric" });
const t2 = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { timeZone: "Africa/Cairo", hour: "2-digit", minute: "2-digit" });

export type LabelBatch = Pick<MfgBatch, "number" | "madeAt" | "chefName" | "chefCode">;

/** كود المسح: the link of the batch in سجل التشغيلات, so scanning the sticker opens the run it came from. */
export function batchLink(number: string): string {
  const origin = typeof location === "undefined" ? "" : location.origin;
  return `${origin}${import.meta.env.BASE_URL}${COST_CONTROL_ONLY ? "manufacturing/log" : "production/batches"}?b=${encodeURIComponent(number)}`;
}

/** Sized in millimetres; all type scales with the label height so the three sizes share one layout. */
export function BatchLabel({ batch, output, size, index, of, fit, shift }: { batch: LabelBatch; output: MfgBatchOutput; size: LabelSize; index?: number; of?: number; fit?: boolean; shift?: LabelShift }) {
  const u = size.h / 40; // 1u = 1mm on the 60×40 label
  // on paper (`fit`) every length is a share of the page (--lw: the widest the sticker can be inside it), so the sticker fills the label whatever paper size the printer driver reports
  const mm = (n: number) => (fit ? `calc(var(--lw) * ${Math.round((n * u * 100000) / size.w) / 100000})` : `${Math.round(n * u * 1000) / 1000}mm`);
  const qr = qrMatrix(batchLink(batch.number), "L");
  const qty = output.unit === "pc" ? `${output.count ?? 0} قطعة` : `${Math.round((output.weightKg ?? 0) * 1000) / 1000} كجم`;
  // `big`: the lines read from a distance (dates, quantity) take the larger type; the chef's name keeps the small one
  const Line = ({ k, v, bold, big }: { k: string; v: ReactNode; bold?: boolean; big?: boolean }) => (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: mm(1.2), fontSize: mm(big ? 3.3 : 2.55), lineHeight: big ? 1.12 : 1.25 }}>
      <span style={{ fontWeight: 500, fontSize: mm(2.55), whiteSpace: "nowrap" }}>{k}</span>
      <span dir="ltr" style={{ fontWeight: bold || big ? 800 : 700, whiteSpace: "nowrap" }}>{v}</span>
    </div>
  );
  return (
    <div
      dir="rtl"
      className="mfg-label"
      style={{ ...(fit ? ({ "--lw": `min(100vw, ${Math.round((size.w * 100000) / size.h) / 1000}vh)` } as CSSProperties) : null), width: fit ? "var(--lw)" : `${size.w}mm`, height: fit ? `calc(var(--lw) * ${Math.round((size.h * 100000) / size.w) / 100000})` : `${size.h}mm`, boxSizing: "border-box", padding: `${mm(1.2)} ${mm(2)}`, ...(fit && shift && (shift.x || shift.y) ? { transform: `translate(calc(var(--lw) * ${Math.round((shift.x * 100000) / size.w) / 100000}), calc(var(--lw) * ${Math.round((shift.y * 100000) / size.w) / 100000}))` } : null), background: "#fff", color: "#000", fontFamily: "'Tajawal','IBM Plex Sans Arabic',system-ui,sans-serif", display: "flex", flexDirection: "column", overflow: "hidden" }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: `${mm(0.3)} solid #000`, paddingBottom: mm(0.5), gap: mm(1.5) }}>
        <span dir="ltr" style={{ fontSize: mm(3), fontWeight: 800, letterSpacing: "0.1em", lineHeight: 1.1 }}>WESTEROS</span>
        <span style={{ fontSize: mm(2.9), fontWeight: 800, lineHeight: 1.1, whiteSpace: "nowrap" }}>{TEMP[output.storageTemp]}{output.storageMethod ? ` · ${output.storageMethod}` : ""}</span>
      </div>
      <div style={{ fontSize: mm(4.3), fontWeight: 800, lineHeight: 1.15, margin: `${mm(0.6)} 0 ${mm(0.4)}`, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{output.name.ar}</div>
      {output.ingredientsText?.trim() ? (
        <div style={{ fontSize: mm(2.05), fontWeight: 600, lineHeight: 1.2, maxHeight: mm(2.05 * 1.2 * 2), overflow: "hidden", marginBottom: mm(0.5), display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
          <span style={{ fontWeight: 800 }}>المكونات: </span>
          {output.ingredientsText.trim()}
        </div>
      ) : null}
      <div style={{ display: "flex", gap: mm(2), flex: 1, minHeight: 0 }}>
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
          <Line k="إنتاج" v={`${d2(batch.madeAt)} ${t2(batch.madeAt)}`} big />
          <Line k="انتهاء" v={d2(output.expiresAt)} big />
          <Line k="الشيف" v={<span dir="rtl">{batch.chefName} ({batch.chefCode})</span>} />
          <Line big k="الكمية" v={<span dir="rtl">{qty}{of && of > 1 ? ` · ${index}/${of}` : ""}</span>} />
          <div dir="ltr" style={{ fontSize: mm(3.6), lineHeight: 1.1, fontWeight: 800, textAlign: "center", border: `${mm(0.3)} solid #000`, borderRadius: mm(0.8), padding: `${mm(0.75)} 0 0`, marginTop: mm(0.3), letterSpacing: "0.01em", whiteSpace: "nowrap" }}>{batch.number}</div>
        </div>
        <svg viewBox={`0 0 ${qr.size} ${qr.size}`} shapeRendering="crispEdges" style={{ width: mm(17), height: mm(17), alignSelf: "center", flexShrink: 0 }} aria-hidden>
          <path d={qr.path} fill="#000" />
        </svg>
      </div>
    </div>
  );
}

const ROOT_ID = "ws-label-root";

/** Prints the stickers of each product of the batch (`copies`: one number for all, or one per product) through the browser's print dialog. */
export function printLabels(batch: LabelBatch, outputs: MfgBatchOutput[], size: LabelSize, copies: number | number[], shift: LabelShift = savedLabelShift()): Promise<void> {
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
  #${ROOT_ID} .mfg-label-page{break-after:page;page-break-after:always}
}`;
  document.head.appendChild(css);
  document.body.appendChild(host);
  const root = createRoot(host);
  const nOf = (oi: number) => Math.max(1, Math.min(200, Math.round(Array.isArray(copies) ? copies[oi] ?? 1 : copies)));
  flushSync(() =>
    root.render(
      <>
        {outputs.flatMap((o, oi) => Array.from({ length: nOf(oi) }, (_, i) => (
          // the page box: a moved sticker is cut at the page edge instead of spilling onto an extra (blank) label
          <div key={`${oi}-${i}`} className="mfg-label-page" style={{ width: "100vw", height: `min(100vh, ${Math.round((size.h * 100000) / size.w) / 1000}vw)`, overflow: "hidden" }}>
            <BatchLabel batch={batch} output={o} size={size} index={i + 1} of={nOf(oi)} fit shift={shift} />
          </div>
        )))}
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
