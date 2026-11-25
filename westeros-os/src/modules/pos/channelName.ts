/** اسم قناة البيع (Saqr 2026-11-25): one name for an order's channel everywhere (cashier, orders, kitchen, receipt). */
import { useCallback } from "react";
import { useLive } from "@/data/hooks";
import { channelFor } from "@/data/channels";
import type { Order } from "@/data/types";

export function useChannelName() {
  const settings = useLive("settings").data[0] ?? null;
  return useCallback((o: Pick<Order, "channelId" | "mode"> | null | undefined): string | null => (o ? channelFor(settings, o)?.name ?? null : null), [settings]);
}
