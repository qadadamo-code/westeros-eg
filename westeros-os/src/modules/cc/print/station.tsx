/**
 * محطة الطباعة (Saqr 2026-11-25): the restaurant's Windows PC runs a small program (westeros-print-station.bat,
 * downloaded from التشغيل > اعدادات التشغيل) that listens on this PC only (localhost:17777) and passes bytes to a printer's
 * IP. The station screen (/print-station, open in Chrome on that PC) turns each job into those bytes.
 * Any device asks for a print by adding a print job; the kitchen tickets are made by the station itself.
 */
import type { Db } from "@/data/hooks";
import type { MfgBatchOutput, PrintJob, PrintSetup, PrinterDef } from "@/data/types";
import { ReceiptView, type ReceiptModel } from "@/lib/receipt";
import { BatchLabel, type LabelBatch, type LabelSize } from "@/modules/production/Label";
import { dotsFor, escpos, labelDots, toBase64, toMono, tspl } from "./encode";
import { KitchenTicketView, type KitchenTicketData } from "./KitchenTicket";
import { nodeToCanvas, pixelsOf } from "./render";

export const HELPER = "http://localhost:17777";
export const STATION_FILE = "westeros-print-station.bat";

export async function pingHelper(): Promise<boolean> {
  try {
    const r = await fetch(`${HELPER}/ping`, { cache: "no-store" });
    return r.ok;
  } catch {
    return false;
  }
}

export async function sendBytes(printer: PrinterDef, bytes: Uint8Array) {
  if (!printer.ip) throw new Error("الطابعة مالهاش IP");
  const [ip, port] = printer.ip.includes(":") ? printer.ip.split(":") : [printer.ip, "9100"];
  const r = await fetch(`${HELPER}/print`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ip: ip.trim(), port: Number(port) || 9100, data: toBase64(bytes) }) });
  const t = await r.text();
  if (!r.ok) throw new Error(t || `HTTP ${r.status}`);
}

const mono = (c: HTMLCanvasElement) => toMono(pixelsOf(c), c.width, c.height);

export async function receiptBytes(model: ReceiptModel, printer: PrinterDef) {
  const m = { ...model, design: { ...model.design, paper: printer.paper } };
  return escpos(mono(await nodeToCanvas(<ReceiptView model={m} />, dotsFor(printer.paper))));
}

export async function kitchenBytes(data: KitchenTicketData, setup: PrintSetup, printer: PrinterDef) {
  return escpos(mono(await nodeToCanvas(<KitchenTicketView data={data} design={setup.kitchen} paper={printer.paper} />, dotsFor(printer.paper))));
}

export interface StickerPayload {
  batch: LabelBatch;
  outputs: MfgBatchOutput[];
  size: LabelSize;
  copies: number[];
  codes: (string | undefined)[];
}
/** one TSPL job per sticker (each has its own number n/of and QR) */
export async function stickerBytes(p: StickerPayload): Promise<Uint8Array[]> {
  const out: Uint8Array[] = [];
  for (let oi = 0; oi < p.outputs.length; oi++) {
    const of = Math.max(1, Math.min(200, p.copies[oi] ?? 1));
    for (let i = 1; i <= of; i++) {
      const c = await nodeToCanvas(<BatchLabel batch={p.batch} output={p.outputs[oi]} size={p.size} index={i} of={of} productCode={p.codes[oi]} />, labelDots(p.size.w));
      out.push(tspl(mono(c), { wMm: p.size.w, hMm: p.size.h }));
    }
  }
  return out;
}

/** asks the station to print (from any device) */
export function queuePrint(db: Db, job: Pick<PrintJob, "printerId" | "kind" | "payload"> & { copies?: number }, by: string | null) {
  return db.insert("printJobs", { printerId: job.printerId, kind: job.kind, payload: job.payload, copies: job.copies ?? 1, status: "queued", error: null, createdBy: by });
}

/** may this setup send a print to the station for this printer? */
export const viaStation = (setup: PrintSetup, printerId: string | null | undefined): PrinterDef | null => {
  if (!setup.stationOn || !printerId) return null;
  const p = setup.printers.find((x) => x.id === printerId);
  return p?.ip ? p : null;
};
