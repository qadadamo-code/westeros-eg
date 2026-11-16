/** Live manufacturing data for the screens + the cost context batches are priced with. */
import { useMemo } from "react";
import { useSession } from "@/auth/session";
import { useLive } from "@/data/hooks";
import type { MfgMethod } from "@/data/types";
import { categoriesOf } from "./defaults";
import type { Units } from "@/lib/money";

export { categoriesOf, categoryName, DEFAULT_CATEGORIES, DEFAULT_STORAGE_METHODS } from "./defaults";

export const METHOD_LABEL: Record<MfgMethod, { ar: string; en: string }> = {
  weight: { ar: "تصنيع بالوزن", en: "By weight" },
  portion: { ar: "تصنيع بالحصة", en: "By portion" },
  chicken: { ar: "من مادة خام واحدة", en: "From one raw material" },
  burger: { ar: "تصنيع البرجر", en: "Burger" },
};

export function useProduction() {
  const { branchId, branches } = useSession();
  const products = useLive("mfgProducts", { orderBy: [{ field: "sort" }] }).data;
  const batchesLive = useLive("mfgBatches", { orderBy: [{ field: "madeAt", dir: "desc" }] });
  const [settings] = useLive("mfgSettings").data;
  const items = useLive("stockItems").data;
  const staff = useLive("memberships").data;
  const branch = branchId ?? branches.find((b) => b.isDefault)?.id ?? branches[0]?.id ?? null;
  return useMemo(() => {
    const itemById = new Map(items.map((i) => [i.id, i]));
    const productById = new Map(products.map((p) => [p.id, p]));
    const batches = batchesLive.data.filter((b) => !branch || b.branchId === branch);
    return {
      branchId: branch,
      loading: batchesLive.loading,
      products,
      productById,
      batches,
      settings: settings ?? null,
      categories: categoriesOf(settings),
      items,
      itemById,
      staff,
      /** price of one base unit: last purchase price (raw) / last batch (manufactured), as the Cost Control document says */
      unitCost: (id: string): Units => itemById.get(id)?.lastCost ?? 0,
    };
  }, [products, batchesLive.data, batchesLive.loading, settings, items, staff, branch]);
}
export type Prod = ReturnType<typeof useProduction>;
