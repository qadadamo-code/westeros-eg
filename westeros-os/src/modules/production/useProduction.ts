/** Live manufacturing data for the screens + the cost context batches are priced with. */
import { useMemo } from "react";
import { useSession } from "@/auth/session";
import { useLive } from "@/data/hooks";
import type { MfgCategory, MfgMethod } from "@/data/types";
import type { Units } from "@/lib/money";

export const CATEGORY_LABEL: Record<MfgCategory, { ar: string; en: string }> = {
  cold_sauce: { ar: "صوص بارد", en: "Cold sauces" },
  hot_sauce: { ar: "صوص ساخن", en: "Hot mixes" },
  other: { ar: "أخرى (بورشن)", en: "Portioned" },
  chicken: { ar: "الدجاج", en: "Chicken" },
  beef_burger: { ar: "برجر لحم", en: "Beef burger" },
  chicken_burger: { ar: "برجر دجاج", en: "Chicken burger" },
  marinade: { ar: "التتبيلات", en: "Marinades" },
  fat: { ar: "الدهن", en: "Fat" },
};
export const CATEGORY_ORDER: MfgCategory[] = ["cold_sauce", "hot_sauce", "other", "chicken", "beef_burger", "chicken_burger", "fat", "marinade"];

export const METHOD_LABEL: Record<MfgMethod, { ar: string; en: string }> = {
  weight: { ar: "تصنيع بالوزن", en: "By weight" },
  portion: { ar: "تصنيع بالحصة", en: "By portion" },
  chicken: { ar: "تجهيزات الدجاج", en: "Chicken" },
  burger: { ar: "تصنيع البرجر", en: "Burger" },
  fat: { ar: "تجهيز الدهن", en: "Fat" },
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
      items,
      itemById,
      staff,
      /** price of one base unit: last purchase price (raw) / last batch (manufactured) — as the Cost Control sheet does */
      unitCost: (id: string): Units => itemById.get(id)?.lastCost ?? 0,
    };
  }, [products, batchesLive.data, batchesLive.loading, settings, items, staff, branch]);
}
export type Prod = ReturnType<typeof useProduction>;
