/**
 * طابعة المطبخ (Saqr 2026-11-25): on a device marked as one of the system's printers, and while the kitchen printer
 * is switched on, every line the cashier sends to the kitchen whose menu category goes to this printer prints here as
 * a kitchen ticket (one per order). Lines sent before the device opened are not printed again.
 * Chrome started with --kiosk-printing prints without the dialog.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useSession } from "@/auth/session";
import { useLive } from "@/data/hooks";
import type { OrderItem } from "@/data/types";
import { printNode } from "@/lib/receipt";
import { useChannelName } from "@/modules/pos/channelName";
import { listsOf } from "../lib";
import { KitchenTicketView, type KitchenTicketData } from "./KitchenTicket";
import { devicePrinter, printersFor, printOf } from "./setup";

const DONE_KEY = "westeros.printer.done";
const loadDone = (): Record<string, number> => {
  try {
    return JSON.parse(localStorage.getItem(DONE_KEY) ?? "{}");
  } catch {
    return {};
  }
};

export function KitchenPrinter() {
  const settings = useLive("mfgSettings").data[0];
  const { branchId } = useSession();
  const setup = printOf(listsOf(settings), branchId);
  const [mine, setMine] = useState(devicePrinter());
  useEffect(() => {
    const f = () => setMine(devicePrinter());
    window.addEventListener("westeros-printer", f);
    window.addEventListener("storage", f);
    return () => (window.removeEventListener("westeros-printer", f), window.removeEventListener("storage", f));
  }, []);
  const printer = setup.printers.find((p) => p.id === mine);
  if (!setup.kitchenPrint || !printer) return null;
  return <Run printerId={printer.id} />;
}

function Run({ printerId }: { printerId: string }) {
  const settings = useLive("mfgSettings").data[0];
  const { branchId } = useSession();
  const setup = printOf(listsOf(settings), branchId);
  const printer = setup.printers.find((p) => p.id === printerId)!;
  const since = useMemo(() => new Date(Date.now() - 60_000).toISOString(), []);
  const startedAt = useRef(Date.now());
  const items = useLive("orderItems", { gte: { firedAt: since } }).data;
  const orders = useLive("orders", { gte: { createdAt: new Date(Date.now() - 24 * 3600_000).toISOString() } }).data;
  const menu = useLive("menuItems").data;
  const tables = useLive("tables").data;
  const customers = useLive("customers").data;
  const members = useLive("memberships").data;
  const chName = useChannelName();
  const queue = useRef(Promise.resolve());

  useEffect(() => {
    const done = loadDone();
    const catOf = new Map(menu.map((m) => [m.id, m.categoryId]));
    const fresh = items.filter((i) => i.firedAt && i.status !== "void" && !done[`${i.id}@${i.firedAt}`] && Date.parse(i.firedAt) >= startedAt.current - 5_000 && printersFor(setup, catOf.get(i.itemId)).includes(printerId) && orders.find((o) => o.id === i.orderId)?.branchId === branchId);
    if (!fresh.length) return;
    const now = Date.now();
    for (const i of fresh) done[`${i.id}@${i.firedAt}`] = now;
    // keep a day of printed lines
    for (const [k, t] of Object.entries(done)) if (now - t > 24 * 3600_000) delete done[k];
    try {
      localStorage.setItem(DONE_KEY, JSON.stringify(done));
    } catch {
      /* private mode */
    }
    const byOrder = new Map<string, OrderItem[]>();
    for (const i of fresh) byOrder.set(i.orderId, [...(byOrder.get(i.orderId) ?? []), i]);
    for (const [orderId, lines] of byOrder) {
      const o = orders.find((x) => x.id === orderId);
      const data: KitchenTicketData = {
        number: o?.number ?? "—",
        channel: chName(o),
        table: o?.tableIds.length ? o.tableIds.map((t) => tables.find((x) => x.id === t)?.label ?? "?").join("+") : null,
        customer: o?.customerId ? customers.find((c) => c.id === o.customerId)?.name ?? null : null,
        cashier: o?.waiterId ? members.find((m) => m.id === o.waiterId)?.name ?? null : null,
        at: lines[0].firedAt ?? new Date().toISOString(),
        printer: printer.name,
        note: o?.note || null,
          appCode: o?.externalRef ?? null,
        lines: lines.map((l) => ({ qty: l.qty, name: l.name.ar || l.name.en, modifiers: l.modifiers.map((m) => m.name.ar || m.name.en), notes: l.notes, toGo: l.toGo })),
      };
      queue.current = queue.current.then(() => printNode(<KitchenTicketView data={data} design={setup.kitchen} paper={printer.paper} />, printer.paper)).catch(() => undefined);
    }
  }, [items]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}
