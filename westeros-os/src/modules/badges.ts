/** Live nav badge hooks shared by stub modules (real modules may define their own). */
import { useLive } from "@/data/hooks";
import { startOfDay } from "@/lib/time";
import { useViewBranch } from "@/auth/viewBranch";

export function useOpenCalls() {
  return useLive("serviceCalls", { where: { status: "open" } }).data.length || null;
}
export function useKitchenQueue() {
  return useLive("orderItems", { where: { status: ["sent", "preparing"] } }).data.length || null;
}
/** الطلبات الشغالة في الفرع المعروض فوق (Saqr 2026-11-24: the badge counted every branch, the page showed one) */
export function useActiveOrders() {
  const view = useViewBranch();
  return useLive("orders", { where: { status: ["open", "sent", "ready", "served"], ...(view.ids ? { branchId: view.ids } : {}) } }).data.length || null;
}
export function usePendingDeliveries() {
  return useLive("orders", { where: { mode: "delivery", deliveryStatus: ["pending", "assigned"] } }).data.length || null;
}
export function usePendingReservations() {
  return useLive("reservations", { where: { status: "pending" }, gte: { startsAt: startOfDay().toISOString() } }).data.length || null;
}
