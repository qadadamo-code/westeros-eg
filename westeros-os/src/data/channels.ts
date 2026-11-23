/**
 * قنوات البيع (Mohammed 2026-11-23): each channel the cashier sells on (صالة، تيك أواي، توصيل، طلبات…) picks one of the
 * item's three prices, and says whether its invoices carry the tax and the service. Defined in الحسابات > المبيعات;
 * the rates themselves stay in the tax settings (set from the same screen). Pure.
 */
import type { MenuItem, Order, OrderMode, Settings, TaxSettings } from "./types";
import type { Units } from "@/lib/money";

export type PriceLevel = 1 | 2 | 3;
/** how the cashier treats the order: a table, a counter order, or a delivery with an address */
export type ChannelKind = "dine_in" | "takeaway" | "delivery";
export interface SalesChannelDef {
  id: string;
  name: string;
  kind: ChannelKind;
  level: PriceLevel;
  tax: boolean;
  service: boolean;
  /** shown on the cashier's new-order list */
  visible: boolean;
}

export const KIND_LABEL: Record<ChannelKind, string> = { dine_in: "صالة (ترابيزات)", takeaway: "تيك أواي", delivery: "توصيل (عنوان الزبون)" };

/** what the system did before channels existed: the tax as registered, the service on the modes it was set for */
export function defaultChannels(tax?: Pick<TaxSettings, "vatRegistered" | "serviceRate" | "serviceModes"> | null): SalesChannelDef[] {
  const vat = !!tax?.vatRegistered;
  const svc = (m: OrderMode) => !!tax && tax.serviceRate > 0 && tax.serviceModes.includes(m);
  return [
    { id: "dine_in", name: "صالة", kind: "dine_in", level: 1, tax: vat, service: svc("dine_in"), visible: true },
    { id: "takeaway", name: "تيك أواي", kind: "takeaway", level: 1, tax: vat, service: svc("takeaway"), visible: true },
    { id: "delivery", name: "توصيل", kind: "delivery", level: 1, tax: vat, service: svc("delivery"), visible: true },
    { id: "talabat", name: "طلبات", kind: "takeaway", level: 2, tax: vat, service: false, visible: true },
  ];
}

export const channelsOf = (s: Pick<Settings, "salesChannels" | "tax"> | null | undefined): SalesChannelDef[] =>
  s?.salesChannels?.length ? s.salesChannels : defaultChannels(s?.tax);

/** the channel of an order: the one it was taken on, else the first of its kind */
export function channelFor(s: Pick<Settings, "salesChannels" | "tax"> | null | undefined, order: Pick<Order, "channelId" | "mode"> | null | undefined): SalesChannelDef | null {
  const list = channelsOf(s);
  if (!order) return null;
  const mode = order.mode as string;
  return list.find((c) => c.id === order.channelId) ?? list.find((c) => c.kind === mode) ?? null;
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
