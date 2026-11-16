/** Everything the Cost Control screens read: constants, raw materials, products, warehouses and what each one holds. */
import { useMemo } from "react";
import { useSession } from "@/auth/session";
import { useLive } from "@/data/hooks";
import { useProduction } from "@/modules/production/useProduction";
import { listsOf } from "./lib";

export function useCc() {
  const prod = useProduction();
  const { staff, branchId, branches } = useSession();
  const all = useLive("stockItems").data;
  const levels = useLive("stockLevels").data;
  const locations = useLive("storageLocations", { orderBy: [{ field: "sort" }] }).data;
  const members = useLive("memberships").data;
  const branch = branchId ?? branches.find((b) => b.isDefault)?.id ?? branches[0]?.id ?? "";
  return useMemo(() => {
    const lists = listsOf(prod.settings);
    const raws = all.filter((i) => i.kind === "raw").sort((a, b) => a.sku.localeCompare(b.sku, "en", { numeric: true }));
    const made = all.filter((i) => i.kind === "prep");
    const itemById = new Map(all.map((i) => [i.id, i]));
    const warehouses = locations.filter((l) => l.active);
    const memberById = new Map(members.map((m) => [m.id, m]));
    /** base quantity on hand: in one warehouse, or everywhere */
    const onHand = (itemId: string, locationId?: string | null) => levels.reduce((a, l) => (l.itemId === itemId && (!locationId || l.locationId === locationId) ? a + l.qty : a), 0);
    return { prod, lists, all, raws, made, itemById, warehouses, locations, levels, members: members.filter((m) => m.active), memberById, onHand, staff, branchId: branch };
  }, [prod, all, levels, locations, members, staff, branch]);
}
export type Cc = ReturnType<typeof useCc>;
