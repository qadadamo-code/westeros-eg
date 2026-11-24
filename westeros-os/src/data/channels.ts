/**
 * قنوات البيع (Mohammed 2026-11-23): each channel the cashier sells on (صالة، تيك أواي، توصيل، طلبات…) picks one of the
 * item's three prices, and says whether its invoices carry the tax and the service. Defined in الحسابات > المبيعات;
 * the rates themselves stay in the tax settings (set from the same screen). Pure.
 */
import type { MenuItem, Order, OrderMode, Settings, TaxSettings } from "./types";
import type { Units } from "@/lib/money";

export type PriceLevel = 1 | 2 | 3;
/** how the cashier treats the order: a table, a counter order, or a delivery with an address */
export type ChannelKind = "dine_in" | "takeaway" | "delivery" | "aggregator";
export interface SalesChannelDef {
  id: string;
  name: string;
  kind: ChannelKind;
  level: PriceLevel;
  tax: boolean;
  service: boolean;
  /** shown on the cashier's new-order list */
  visible: boolean;
  /** الفروع (ids) اللي القناة مش شغالة فيها: كل فرع له إعداداته (Saqr 2026-11-24); empty = every branch */
  offBranches?: string[];
}

/** is this setting (channel, payment method) on in the branch: switched off only for the branches listed */
export const onInBranch = (x: { offBranches?: string[] }, branchId: string | null | undefined) => !branchId || !(x.offBranches ?? []).includes(branchId);

/** الأنواع الرئيسية (Mohammed 2026-11-24): محلي، استلام، توصيل، تطبيق توصيل (بيطلب كود الطلب في الكاشير) */
export const KIND_LABEL: Record<ChannelKind, string> = { dine_in: "محلي (Dine in)", takeaway: "استلام (Pick up)", delivery: "توصيل (Delivery)", aggregator: "تطبيق توصيل (Aggregators)" };

/** the order mode a channel's orders are taken in: an aggregator order is picked up by the app's rider */
export const modeOf = (kind: ChannelKind): OrderMode => (kind === "aggregator" ? "takeaway" : kind);

/** is the item sold on this channel: not switched off for it in جدول الأسعار, nor hidden on its kind the old way */
export function soldOn(item: Pick<MenuItem, "offChannels" | "hiddenOn">, ch: Pick<SalesChannelDef, "id" | "kind"> | null | undefined): boolean {
  if (!ch) return true;
  if ((item.offChannels ?? []).includes(ch.id)) return false;
  return !(item.hiddenOn ?? []).includes(ch.kind);
}

/** what the system did before channels existed: the tax as registered, the service on the modes it was set for */
export function defaultChannels(tax?: Pick<TaxSettings, "vatRegistered" | "serviceRate" | "serviceModes"> | null): SalesChannelDef[] {
  const vat = !!tax?.vatRegistered;
  const svc = (m: OrderMode) => !!tax && tax.serviceRate > 0 && tax.serviceModes.includes(m);
  return [
    { id: "dine_in", name: "صالة", kind: "dine_in", level: 1, tax: vat, service: svc("dine_in"), visible: true },
    { id: "takeaway", name: "تيك أواي", kind: "takeaway", level: 1, tax: vat, service: svc("takeaway"), visible: true },
    { id: "delivery", name: "توصيل", kind: "delivery", level: 1, tax: vat, service: svc("delivery"), visible: true },
    { id: "talabat", name: "طلبات", kind: "aggregator", level: 2, tax: vat, service: false, visible: true },
  ];
}

export const channelsOf = (s: Pick<Settings, "salesChannels" | "tax"> | null | undefined): SalesChannelDef[] =>
  s?.salesChannels?.length ? s.salesChannels : defaultChannels(s?.tax);

/** the channel of an order: the one it was taken on, else the first of its kind */
export function channelFor(s: Pick<Settings, "salesChannels" | "tax"> | null | undefined, order: Pick<Order, "channelId" | "mode"> | null | undefined): SalesChannelDef | null {
  const list = channelsOf(s);
  if (!order) return null;
  const mode = order.mode as string;
  return list.find((c) => c.id === order.channelId) ?? list.find((c) => c.kind === mode) ?? list.find((c) => modeOf(c.kind) === mode) ?? null;
}

/** the item's price on a level: an empty second or third price falls back to the first */
export function levelPrice(item: Pick<MenuItem, "price" | "price2" | "price3">, level: PriceLevel | null | undefined): Units {
  if (level === 2 && item.price2 != null && item.price2 > 0) return item.price2;
  if (level === 3 && item.price3 != null && item.price3 > 0) return item.price3;
  return item.price;
}

/** the tax settings an order is priced with: its channel switches the tax and the service on or off */
export function taxFor(s: Pick<Settings, "salesChannels" | "tax">, order: Pick<Order, "channelId" | "mode"> | null | undefined): TaxSettings {
  const ch = channelFor(s, order);
  if (!ch) return s.tax;
  const mode = (order?.mode ?? "dine_in") as OrderMode;
  return { ...s.tax, vatRegistered: ch.tax && s.tax.vatRate > 0, serviceModes: ch.service ? [mode] : [] };
}

/** the change that switches an item on or off for a channel (an old kind-wide hide is lifted when it is switched on) */
export function soldPatch(item: Pick<MenuItem, "offChannels" | "hiddenOn">, ch: Pick<SalesChannelDef, "id" | "kind">, on: boolean): Pick<MenuItem, "offChannels" | "hiddenOn"> {
  const off = (item.offChannels ?? []).filter((x) => x !== ch.id);
  return on ? { offChannels: off, hiddenOn: (item.hiddenOn ?? []).filter((k) => k !== ch.kind) } : { offChannels: [...off, ch.id], hiddenOn: item.hiddenOn ?? [] };
}
