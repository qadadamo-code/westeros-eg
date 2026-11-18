/**
 * طريقة تكلفة المخزون في القيود. The warehouses keep their own running average; this replays the stock movements in
 * order and says what each one is worth under the method chosen in the settings:
 *  - average  المتوسط المرجح: the value the warehouse recorded.
 *  - last     آخر سعر شراء: what goes out is priced at the last price that came into that warehouse; when a new price
 *             comes in, what is still on the shelf is re-priced and the difference goes to فروق أسعار المخزون.
 *  - fifo     الوارد أولا يصرف أولا: what goes out takes the cost of the oldest receipts still on the shelf.
 *  - standard التكلفة المعيارية: everything moves at the item's standard cost; what was really paid above or below it
 *             goes to فروق أسعار المخزون. An item with no standard cost follows the average.
 * Pure: no database.
 */
import type { FinCosting } from "@/data/financeTypes";
import type { StockMove } from "@/data/inventoryTypes";
import type { Units } from "@/lib/money";

type Move = Pick<StockMove, "id" | "itemId" | "locationId" | "kind" | "qty" | "value" | "unitCost" | "groupId" | "at" | "createdAt">;

export interface Valued {
  /** signed change of the stock account */
  stock: Units;
  /** signed amount the other side of the entry carries (what was paid, what was used); stock − counter is a price difference */
  counter: Units;
}
export interface Position { qty: number; value: Units }

const q3 = (n: number) => Math.round(n * 1000) / 1000;
const keyOf = (m: Pick<Move, "itemId" | "locationId">) => `${m.itemId}|${m.locationId}`;
/** outs before ins at the same instant, so what a transfer or a batch takes is priced before what it puts back */
const order = (a: Move, b: Move) => a.at.localeCompare(b.at) || Math.sign(a.qty) - Math.sign(b.qty) || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id);

export function valueMoves(all: Move[], method: FinCosting, standard: Record<string, Units> = {}) {
  const moves = [...all].sort(order);
  const byId = new Map<string, Valued>();
  const pos = new Map<string, Position>();
  const layers = new Map<string, { qty: number; cost: number }[]>();
  const price = new Map<string, number>();
  /** group|item → what left on a transfer, to be carried by the matching arrival */
  const carried = new Map<string, { qty: number; value: Units }>();

  for (const m of moves) {
    const k = keyOf(m);
    const p = pos.get(k) ?? { qty: 0, value: 0 };
    const std = method === "standard" ? standard[m.itemId] : undefined;
    const mode: FinCosting = method === "standard" && std == null ? "average" : method;
    const isIn = m.qty > 0 || (m.qty === 0 && m.value > 0);
    let v: Valued;

    if (mode === "average" || m.qty === 0) v = { stock: m.value, counter: m.value };
    else if (isIn) {
      // what it cost to bring in: the recorded value, or what the matching transfer-out was worth under this method
      let actual = Math.max(0, m.value);
      if (m.kind === "transfer_in" && m.groupId) {
        const c = carried.get(`${m.groupId}|${m.itemId}`);
        if (c && c.qty > 0) {
          const part = Math.min(1, m.qty / c.qty);
          actual = Math.round(c.value * part);
          carried.set(`${m.groupId}|${m.itemId}`, { qty: q3(c.qty - m.qty), value: c.value - actual });
        }
      }
      const unit = actual / m.qty;
      if (mode === "fifo") {
        (layers.get(k) ?? layers.set(k, []).get(k)!).push({ qty: m.qty, cost: unit });
        v = { stock: actual, counter: actual };
      } else if (mode === "last") {
        const prev = price.get(k);
        const reprice = prev == null ? 0 : Math.round(p.qty * (unit - prev));
        price.set(k, unit);
        v = { stock: actual + reprice, counter: actual };
      } else v = { stock: Math.round(m.qty * std!), counter: actual };
    } else {
      const out = -m.qty;
      let cost: number;
      if (mode === "fifo") {
        const ls = layers.get(k) ?? [];
        let left = out;
        cost = 0;
        let lastCost = ls.length ? ls[ls.length - 1].cost : m.unitCost;
        while (left > 1e-9 && ls.length) {
          const l = ls[0];
          const take = Math.min(left, l.qty);
          cost += take * l.cost;
          lastCost = l.cost;
          l.qty = q3(l.qty - take);
          left = q3(left - take);
          if (l.qty <= 1e-9) ls.shift();
        }
        if (left > 1e-9) cost += left * lastCost;
        cost = Math.round(cost);
      } else if (mode === "last") cost = Math.round(out * (price.get(k) ?? m.unitCost));
      else cost = Math.round(out * std!);
      v = { stock: -cost, counter: -cost };
      if (m.kind === "transfer_out" && m.groupId) {
        const ck = `${m.groupId}|${m.itemId}`;
        const c = carried.get(ck) ?? { qty: 0, value: 0 };
        carried.set(ck, { qty: q3(c.qty + out), value: c.value + cost });
      }
    }
    byId.set(m.id, v);
    pos.set(k, { qty: q3(p.qty + m.qty), value: p.value + v.stock });
  }
  return { byId, positions: pos };
}

/** What stands in each warehouse under the method, as of the end of `day` (Cairo); every movement when no day is given. */
export function positionsAt(all: Move[], method: FinCosting, standard: Record<string, Units>, dayOf: (iso: string) => string, day?: string | null) {
  return valueMoves(day ? all.filter((m) => dayOf(m.at) <= day) : all, method, standard).positions;
}
