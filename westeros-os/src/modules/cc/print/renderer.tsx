/**
 * رسّام الطباعة (Saqr 2026-11-25: the station runs in the background with no screen). An open cashier screen draws the
 * branch's kitchen tickets (by menu category printers) and the jobs a phone could not draw (iPhone), and saves the bytes
 * in the job; the station program prints them. Several screens may be open: the database gives each ticket to one.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useSession } from "@/auth/session";
import { useDb, useLive } from "@/data/hooks";
import type { OrderItem, PrintJob } from "@/data/types";
import { useChannelName } from "@/modules/pos/channelName";
import { listsOf } from "../lib";
import { printersFor, printOf } from "./setup";
import type { KitchenTicketData } from "./KitchenTicket";
import { clientOf, drawJob, drawsHere, probeDraw } from "./station";

/** lines fired together settle this long before their ticket is drawn (their saves arrive one by one) */
const SETTLE_MS = 1200;

export function usePrintRenderer() {
  const db = useDb();
  const { branchId } = useSession();
  const settings = useLive("mfgSettings").data[0];
  const setup = printOf(listsOf(settings), branchId);
  const on = !!setup.stationOn && !!clientOf(db);
  // a short moving window (the shell stays open all day; the query must not grow)
  const [since, setSince] = useState(() => new Date(Date.now() - 3 * 60_000).toISOString());
  useEffect(() => {
    const t = setInterval(() => setSince(new Date(Date.now() - 3 * 60_000).toISOString()), 5 * 60_000);
    return () => clearInterval(t);
  }, []);
  const [canDraw, setCanDraw] = useState(drawsHere());
  useEffect(() => {
    if (on) void probeDraw().then(setCanDraw);
  }, [on]);
  const kitchenOn = on && !!setup.kitchenPrint && canDraw;
  const dayAgo = useMemo(() => new Date(Date.now() - 24 * 3600_000).toISOString(), [since]); // eslint-disable-line react-hooks/exhaustive-deps
  const items = useLive("orderItems", { gte: { firedAt: since } }, { enabled: kitchenOn }).data;
  const orders = useLive("orders", { gte: { createdAt: dayAgo } }, { enabled: kitchenOn }).data;
  const menu = useLive("menuItems", undefined, { enabled: kitchenOn }).data;
  const chName = useChannelName();
  const seen = useRef(new Set<string>());
  const [tick, bump] = useState(0);

  /* ── kitchen tickets ── */
  useEffect(() => {
    if (!kitchenOn) return;
    const client = clientOf(db)!;
    const catOf = new Map(menu.map((m) => [m.id, m.categoryId]));
    const now = Date.now();
    let wait = 0;
    // order → fired at → printer → lines
    const plan = new Map<string, OrderItem[]>();
    for (const i of items) {
      if (!i.firedAt || i.status === "void" || i.status === "new") continue;
      const o = orders.find((x) => x.id === i.orderId);
      if (!o || o.branchId !== branchId) continue;
      const age = now - Date.parse(i.firedAt);
      if (age < SETTLE_MS) {
        wait = Math.max(wait, SETTLE_MS - age);
        continue;
      }
      for (const pid of printersFor(setup, catOf.get(i.itemId))) {
        const k = `${i.orderId}|${i.firedAt}|${pid}`;
        plan.set(k, [...(plan.get(k) ?? []), i]);
      }
    }
    for (const [k, lines] of plan) {
      const [orderId, firedAt, pid] = k.split("|");
      const dedupe = `k:${orderId}:${pid}:${firedAt}:${lines.map((l) => l.id.slice(0, 6)).sort().join(".")}`;
      if (seen.current.has(dedupe)) continue;
      seen.current.add(dedupe);
      const p = setup.printers.find((x) => x.id === pid);
      const o = orders.find((x) => x.id === orderId);
      if (!p?.ip || !o) continue;
      const base = {
        number: o.number ?? "—",
        channel: chName(o),
        at: firedAt,
        printer: p.name,
        note: o.note || null,
        appCode: o.externalRef ?? null,
        lines: lines.map((l) => ({ qty: l.qty, name: l.name.ar || l.name.en, modifiers: l.modifiers.map((m) => m.name.ar || m.name.en), notes: l.notes, toGo: l.toGo })),
      };
      void (async () => {
        const { data: id } = await client.rpc("print_kitchen_claim", { p_restaurant: db.restaurantId, p_branch: branchId, p_printer: pid, p_dedupe: dedupe });
        if (!id) return; // another screen has it
        // looked up only for the ticket this screen got (so phones don't load every customer)
        const [tbls, customer, waiter] = await Promise.all([
          Promise.all(o.tableIds.map((t) => db.get("tables", t))),
          o.customerId ? db.get("customers", o.customerId) : null,
          o.waiterId ? db.get("memberships", o.waiterId) : null,
        ]);
        const data: KitchenTicketData = {
          ...base,
          table: o.tableIds.length ? tbls.map((t) => t?.label ?? "?").join("+") : null,
          customer: customer?.name ?? null,
          cashier: waiter?.name ?? null,
        };
        const chunks = await drawJob("kitchen", data as unknown as Record<string, unknown>, p, setup);
        // the ticket stays in the job so the cashier can print it again if the printer fails (Saqr 2026-11-26)
        const payload = { ...data, orderId, itemIds: lines.map((l) => l.id) } as unknown as Record<string, unknown>;
        await db.update("printJobs", id as string, chunks ? { data: chunks, payload, status: "queued" } : { payload, status: "queued" });
      })().catch(() => undefined);
    }
    if (wait) {
      const t = setTimeout(() => bump((x) => x + 1), wait + 50);
      return () => clearTimeout(t);
    }
  }, [items, orders, kitchenOn, tick]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── jobs a phone could not draw ── */
  useEffect(() => {
    if (!on || !canDraw) return;
    const client = clientOf(db)!;
    const busy = new Set<string>();
    const look = async () => {
      const raw = (await db.list("printJobs", { where: { status: "queued", branchId } })).filter((j: PrintJob) => !j.data && !busy.has(j.id));
      for (const j of raw) {
        busy.add(j.id);
        const p = setup.printers.find((x) => x.id === j.printerId);
        if (!p?.ip) continue;
        const { data: mine } = await client.rpc("print_render_claim", { p_id: j.id });
        if (!mine) continue;
        const chunks = await drawJob(j.kind, j.payload, p, setup);
        await db.update("printJobs", j.id, chunks ? { data: chunks, payload: {}, status: "queued" } : { status: "queued" });
      }
    };
    const t = setInterval(() => void look().catch(() => undefined), 4_000);
    return () => clearInterval(t);
  }, [on, canDraw, branchId, settings]); // eslint-disable-line react-hooks/exhaustive-deps
}

/** mounted once in the app shell: every open screen of the branch can draw the kitchen tickets (Saqr 2026-11-26) */
export function PrintRenderer() {
  usePrintRenderer();
  return null;
}
