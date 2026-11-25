/**
 * الطابعات (Saqr 2026-11-25): printers of the system, the cashier's receipt printer, the kitchen printer switch and
 * the printers of each menu category. A browser cannot pick a printer by itself, so a printer is reached through the
 * device it is connected to: that device is marked "this device is printer X" and prints what is meant for X.
 * Pure, except the per-device mark (localStorage).
 */
import type { KitchenTicketDesign, MfgLists, PrintSetup } from "@/data/types";

export const DEFAULT_KITCHEN: KitchenTicketDesign = { fontSize: 15, header: "طلبية المطبخ", channel: true, table: true, customer: true, modifiers: true, notes: true, time: true, cashier: false };
export const EMPTY_PRINT: PrintSetup = { printers: [], receiptPrinterId: null, kitchenPrint: false, kitchenDefaultPrinterId: null, categoryPrinters: {}, kitchen: DEFAULT_KITCHEN };

export const printOf = (lists: Pick<MfgLists, "printing"> | null | undefined): PrintSetup => {
  const p = lists?.printing;
  return { ...EMPTY_PRINT, ...(p ?? {}), kitchen: { ...DEFAULT_KITCHEN, ...(p?.kitchen ?? {}) } };
};

/** the printers a menu category's kitchen lines go to: its own, else the default kitchen printer */
export function printersFor(p: PrintSetup, categoryId: string | null | undefined): string[] {
  const own = (categoryId ? p.categoryPrinters[categoryId] : undefined)?.filter((id) => p.printers.some((x) => x.id === id)) ?? [];
  if (own.length) return own;
  return p.kitchenDefaultPrinterId && p.printers.some((x) => x.id === p.kitchenDefaultPrinterId) ? [p.kitchenDefaultPrinterId] : [];
}

const KEY = "westeros.printer.device";
/** which printer this device is connected to (null = none) */
export function devicePrinter(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}
export function setDevicePrinter(id: string | null) {
  try {
    if (id) localStorage.setItem(KEY, id);
    else localStorage.removeItem(KEY);
  } catch {
    /* private mode */
  }
}
