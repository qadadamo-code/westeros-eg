/**
 * ملصق توريد الخامات: printed by the employee who sends a raw material, one per storage unit, in the same style and
 * size as the expiry sticker. The branch scans it to document the receipt; its QR is the request's receipt link.
 */
import { qrMatrix } from "@/lib/receipt/qr";
import { printStickers, savedLabelShift, stickerBox, stickerMm, type LabelShift, type LabelSize } from "@/modules/production/Label";
import { supplyCode, supplyLink } from "./supply";

export interface SupplySticker {
  request: number;
  sku: string;
  name: string;
  branch: string;
  unit: string;
  /** what this one sticker holds (one storage unit, the last one may be less) */
  qty: number;
  sentAt: string;
  storeType: string;
}

const d2 = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { timeZone: "Africa/Cairo", day: "2-digit", month: "2-digit", year: "numeric" });

export function SupplyLabel({ s, size, index, of, fit, shift }: { s: SupplySticker; size: LabelSize; index: number; of: number; fit?: boolean; shift?: LabelShift }) {
  const mm = stickerMm(size, fit);
  const qr = qrMatrix(supplyLink(s.request, s.sku, index), "L");
  const Line = ({ k, v, big }: { k: string; v: string; big?: boolean }) => (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: mm(1.2), fontSize: mm(big ? 3.3 : 2.55), lineHeight: big ? 1.12 : 1.25 }}>
      <span style={{ fontWeight: 500, fontSize: mm(2.55), whiteSpace: "nowrap" }}>{k}</span>
      <span style={{ fontWeight: 800, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{v}</span>
    </div>
  );
  return (
    <div dir="rtl" className="mfg-label" style={stickerBox(size, mm, fit, shift)}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: `${mm(0.3)} solid #000`, paddingBottom: mm(0.5), gap: mm(1.5) }}>
        <span dir="ltr" style={{ fontSize: mm(3), fontWeight: 800, letterSpacing: "0.1em", lineHeight: 1.1 }}>WESTEROS</span>
        <span style={{ fontSize: mm(2.9), fontWeight: 800, lineHeight: 1.1, whiteSpace: "nowrap" }}>توريد خامات{s.storeType ? ` · ${s.storeType}` : ""}</span>
      </div>
      <div style={{ fontSize: mm(4.3), fontWeight: 800, lineHeight: 1.15, margin: `${mm(0.6)} 0 ${mm(0.4)}`, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.name}</div>
      <div style={{ display: "flex", gap: mm(2), flex: 1, minHeight: 0 }}>
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
          <Line k="إلى" v={s.branch} />
          <Line k="إرسال" v={d2(s.sentAt)} big />
          <Line k="الكمية" v={`${Math.round(s.qty * 1000) / 1000} ${s.unit} · ${index}/${of}`} big />
          <div dir="ltr" style={{ fontSize: mm(3.6), lineHeight: 1.1, fontWeight: 800, textAlign: "center", border: `${mm(0.3)} solid #000`, borderRadius: mm(0.8), padding: `${mm(0.75)} 0 0`, marginTop: mm(0.3), whiteSpace: "nowrap" }}>{supplyCode(s.request, s.sku, index)}</div>
        </div>
        <svg viewBox={`0 0 ${qr.size} ${qr.size}`} shapeRendering="crispEdges" style={{ width: mm(17), height: mm(17), alignSelf: "center", flexShrink: 0 }} aria-hidden>
          <path d={qr.path} fill="#000" />
        </svg>
      </div>
    </div>
  );
}

/** one sticker per storage unit of what was sent: 3.5 كرتونة gives 4 stickers, the last one holds 0.5 */
export function supplyStickers(base: Omit<SupplySticker, "qty">, sent: number): SupplySticker[] {
  const n = Math.max(1, Math.ceil(sent - 1e-9));
  return Array.from({ length: Math.min(200, n) }, (_, i) => ({ ...base, qty: i < n - 1 ? 1 : Math.round((sent - (n - 1)) * 1000) / 1000 || 1 }));
}

export function printSupplyStickers(list: SupplySticker[][], size: LabelSize, shift: LabelShift = savedLabelShift()) {
  return printStickers(size, list.flatMap((one) => one.map((s, i) => <SupplyLabel key={`${s.sku}-${i}`} s={s} size={size} index={i + 1} of={one.length} fit shift={shift} />)));
}
