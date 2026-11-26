/**
 * محطة الطباعة (Saqr 2026-11-25): one device in the restaurant (Windows PC or Android tablet) runs a small program
 * (westeros-print-station.bat / westeros-station.sh, from التشغيل > اعدادات التشغيل). It runs in the background with no
 * screen: it takes the branch's print jobs with its station key and sends their bytes to the printer's IP.
 * The device asking for a print draws it (receipts, stickers); an open cashier screen draws kitchen tickets and the jobs a
 * phone could not draw (see renderer.tsx). The program also listens on localhost:17777 for linking and test prints.
 */
import type { Db } from "@/data/hooks";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { MfgBatchOutput, PrintChunk, PrintJob, PrintSetup, PrinterDef } from "@/data/types";
import { ReceiptView, type ReceiptModel } from "@/lib/receipt";
import { BatchLabel, type LabelBatch, type LabelSize } from "@/modules/production/Label";
import { dotsFor, escpos, labelDots, toBase64, toMono, tspl } from "./encode";
import { KitchenTicketView, SAMPLE_TICKET, type KitchenTicketData } from "./KitchenTicket";
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

/* ───────── the station in the background (Saqr 2026-11-25) ───────── */

/** the Supabase client behind the repo (null for the demo/local data) */
export const clientOf = (db: Db): SupabaseClient | null => (db.repo as unknown as { client?: SupabaseClient }).client ?? null;

/** false once this browser proved it cannot draw for printing (Safari taints the canvas) */
let canDraw = true;
export const drawsHere = () => canDraw;
let probed: Promise<boolean> | null = null;
/** can this browser draw a ticket into printer pixels? (once per page; iPhone Safari cannot) */
export function probeDraw(): Promise<boolean> {
  probed ??= (async () => {
    try {
      pixelsOf(await nodeToCanvas(<div style={{ width: 20, height: 10 }}>ok</div>, 16));
    } catch (e) {
      canDraw = false;
      void e;
    }
    return canDraw;
  })();
  return probed;
}

const b64 = (bytes: Uint8Array) => toBase64(bytes);
async function gzip(bytes: Uint8Array): Promise<Uint8Array | null> {
  const CS = (globalThis as { CompressionStream?: new (f: string) => TransformStream<Uint8Array, Uint8Array> }).CompressionStream;
  if (!CS) return null;
  try {
    const out = new Response(new Blob([bytes as BlobPart]).stream().pipeThrough(new CS("gzip")));
    return new Uint8Array(await out.arrayBuffer());
  } catch {
    return null;
  }
}
/** one printer message, ready for the station program */
export async function chunkOf(printer: PrinterDef, bytes: Uint8Array): Promise<PrintChunk> {
  if (!printer.ip) throw new Error("الطابعة مالهاش IP");
  const [ip, port] = printer.ip.includes(":") ? printer.ip.split(":") : [printer.ip, "9100"];
  const gz = await gzip(bytes);
  return { ip: ip.trim(), port: Number(port) || 9100, ...(gz ? { gz: b64(gz) } : { b64: b64(bytes) }) };
}

/** the bytes of a job for its printer (one entry per printer message) */
export async function jobBytes(kind: PrintJob["kind"], payload: Record<string, unknown>, printer: PrinterDef, setup: PrintSetup): Promise<Uint8Array[]> {
  if (kind === "receipt") return [await receiptBytes(payload.model as ReceiptModel, printer)];
  if (kind === "kitchen") return [await kitchenBytes(payload as unknown as KitchenTicketData, setup, printer)];
  if (kind === "sticker") return stickerBytes(payload as unknown as StickerPayload);
  return [await kitchenBytes({ ...SAMPLE_TICKET, printer: printer.name, number: "تجربة" }, setup, printer)];
}

/** draws a job here; null when this browser cannot (the cashier screen draws it instead) */
export async function drawJob(kind: PrintJob["kind"], payload: Record<string, unknown>, printer: PrinterDef, setup: PrintSetup): Promise<PrintChunk[] | null> {
  if (!canDraw) return null;
  try {
    const out: PrintChunk[] = [];
    for (const b of await jobBytes(kind, payload, printer, setup)) out.push(await chunkOf(printer, b));
    return out;
  } catch (e) {
    if ((e as Error)?.name === "SecurityError") canDraw = false;
    return null;
  }
}

/** asks the station to print (from any device): drawn here when possible, so the station needs no screen */
export async function queuePrint(db: Db, job: { printer: PrinterDef; kind: PrintJob["kind"]; payload: Record<string, unknown>; copies?: number }, by: string | null, setup: PrintSetup) {
  const data = await drawJob(job.kind, job.payload, job.printer, setup);
  return db.insert("printJobs", {
    printerId: job.printer.id, kind: job.kind, payload: data ? {} : job.payload, copies: job.copies ?? 1, status: "queued", error: null, createdBy: by,
    branchId: db.branchId, data,
  });
}

/** may this setup send a print to the station for this printer? */
export const viaStation = (setup: PrintSetup, printerId: string | null | undefined): PrinterDef | null => {
  if (!setup.stationOn || !printerId) return null;
  const p = setup.printers.find((x) => x.id === printerId);
  return p?.ip ? p : null;
};

/* ───────── linking the station program ───────── */

export interface HelperInfo {
  ok: boolean;
  v?: number;
  linked?: boolean;
  os?: string;
}
export async function helperInfo(): Promise<HelperInfo | null> {
  try {
    const r = await fetch(`${HELPER}/ping`, { cache: "no-store" });
    return r.ok ? ((await r.json()) as HelperInfo) : null;
  } catch {
    return null;
  }
}

/** links the program on this device to the branch as its station (it then prints with no screen open) */
export async function linkStation(db: Db, branchId: string | null, name: string, os: string) {
  const client = clientOf(db);
  if (!client) throw new Error("الربط محتاج النسخة الأونلاين");
  const { data, error } = await client.rpc("print_station_link", { p_restaurant: db.restaurantId, p_branch: branchId, p_name: name, p_os: os });
  if (error) throw error;
  const r = await fetch(`${HELPER}/link`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: import.meta.env.VITE_SUPABASE_URL, key: import.meta.env.VITE_SUPABASE_ANON_KEY, token: data as string }),
  });
  if (!r.ok) throw new Error((await r.text()) || `HTTP ${r.status}`);
}

export interface StationRow {
  id: string;
  branchId: string | null;
  name: string;
  os: string | null;
  lastSeen: string | null;
}
export async function listStations(db: Db): Promise<StationRow[]> {
  const client = clientOf(db);
  if (!client) return [];
  const { data, error } = await client.from("print_stations").select("id, branch_id, name, os, last_seen").eq("restaurant_id", db.restaurantId);
  if (error) return [];
  return (data as { id: string; branch_id: string | null; name: string; os: string | null; last_seen: string | null }[]).map((r) => ({ id: r.id, branchId: r.branch_id, name: r.name, os: r.os, lastSeen: r.last_seen }));
}
export async function removeStation(db: Db, id: string) {
  const client = clientOf(db);
  if (client) await client.from("print_stations").delete().eq("id", id);
}
/** seen in the last half minute = printing now */
export const stationAlive = (s: StationRow) => !!s.lastSeen && Date.now() - Date.parse(s.lastSeen) < 30_000;
