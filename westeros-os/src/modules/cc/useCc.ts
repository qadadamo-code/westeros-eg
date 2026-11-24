/** Everything the Cost Control screens read: constants, raw materials, products, warehouses and what each one holds. */
import { useMemo } from "react";
import { useSession } from "@/auth/session";
import { useViewBranch } from "@/auth/viewBranch";
import { useLive } from "@/data/hooks";
import { useProduction } from "@/modules/production/useProduction";
import { fitsStore, listsOf, productStoreType } from "./lib";

export function useCc() {
  const prod = useProduction();
  const { staff, branchId, branches } = useSession();
  const all = useLive("stockItems").data;
  const levels = useLive("stockLevels").data;
  const locations = useLive("storageLocations", { orderBy: [{ field: "sort" }] }).data;
  const members = useLive("memberships").data;
  const branchRows = useLive("branches").data;
  const branch = branchId ?? branches.find((b) => b.isDefault)?.id ?? branches[0]?.id ?? "";
  // الفرع المعروض: what the screens list (warehouses, stock, batches, requests); writes and cross-branch supply use all
  const view = useViewBranch();
  const viewKey = view.ids?.join(",") ?? "*";
  return useMemo(() => {
    const lists = listsOf(prod.settings);
    const raws = all.filter((i) => i.kind === "raw").sort((a, b) => a.sku.localeCompare(b.sku, "en", { numeric: true }));
    const made = all.filter((i) => i.kind === "prep");
    const itemById = new Map(all.map((i) => [i.id, i]));
    const warehouses = locations.filter((l) => l.active);
    const memberById = new Map(members.map((m) => [m.id, m]));
    /** base quantity on hand: in one warehouse, or everywhere */
    const onHand = (itemId: string, locationId?: string | null) => levels.reduce((a, l) => (l.itemId === itemId && (!locationId || l.locationId === locationId) ? a + l.qty : a), 0);
    const productByItem = new Map(prod.products.map((p) => [p.stockItemId, p]));
    /** نوع التخزين of a stock item: from the raw material card, or from the product that owns the stock card */
    const storeTypeOf = (item: { id: string; kind: string; spec?: { storeType?: string } | null }): string | null => {
      if (item.kind === "raw") return item.spec?.storeType || null;
      const p = productByItem.get(item.id);
      return p ? productStoreType(p) : null;
    };
    /** the items a warehouse takes: by its type, plus whatever it already holds */
    const fits = (loc: { id: string; type?: string | null }, item: { id: string; kind: string; spec?: { storeType?: string } | null }) =>
      fitsStore(loc.type, storeTypeOf(item)) || levels.some((l) => l.locationId === loc.id && l.itemId === item.id && l.qty !== 0);
    const branchesSorted = [...branchRows].sort((a, b) => Number(b.isDefault) - Number(a.isDefault) || (a.code ?? 1e9) - (b.code ?? 1e9) || a.createdAt.localeCompare(b.createdAt));
    const branchById = new Map(branchRows.map((b) => [b.id, b]));
    const branchName = (id: string | null | undefined) => branchById.get(id ?? "")?.name.ar ?? "—";
    const inView = (b: string | null | undefined) => !b || !view.ids || view.ids.includes(b);
    const viewWarehouses = warehouses.filter((l) => inView(l.branchId));
    const viewIds = new Set(viewWarehouses.map((l) => l.id));
    /** on hand in the warehouses in view (الفرع المعروض) */
    const viewOnHand = (itemId: string) => levels.reduce((a, l) => (l.itemId === itemId && viewIds.has(l.locationId) ? a + l.qty : a), 0);
    return { inView, viewWarehouses, viewOnHand, viewBranch: view.value, branches: branchesSorted, branchById, branchName, storeTypeOf, fits, prod, lists, all, raws, made, itemById, warehouses, locations, levels, members: members.filter((m) => m.active), memberById, onHand, staff, branchId: branch };
  }, [prod, all, levels, locations, members, branchRows, staff, branch, viewKey]); // eslint-disable-line react-hooks/exhaustive-deps
}
export type Cc = ReturnType<typeof useCc>;
