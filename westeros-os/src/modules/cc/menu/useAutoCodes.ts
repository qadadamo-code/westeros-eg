/** Writes the codes planCodes says are missing (category blocks, empty item codes). Existing codes are never touched here. */
import { inChunks } from "@/lib/batch";
import { useEffect, useMemo, useRef } from "react";
import { useDb } from "@/data/hooks";
import type { MenuCategory, MenuItem } from "@/data/types";
import { useToast } from "@/ui";
import { planCodes } from "./codes";

export function useAutoCodes(manage: boolean, cats: MenuCategory[], items: MenuItem[]) {
  const db = useDb();
  const { toast } = useToast();
  const codes = useMemo(() => planCodes(cats, items), [cats, items]);
  const done = useRef("");
  useEffect(() => {
    if (!manage || (!codes.cats.length && !codes.fill.length)) return;
    const key = JSON.stringify([codes.cats, codes.fill]);
    if (done.current === key) return;
    done.current = key;
    void (async () => {
      try {
        await inChunks(codes.cats, (c) => db.update("menuCategories", c.id, { code: c.code }));
        await inChunks(codes.fill, (f) => db.update("menuItems", f.id, { sku: f.sku }));
      } catch (e) {
        toast({ tone: "error", title: "تعذر حفظ الأكواد", description: String((e as Error)?.message ?? e) });
      }
    })();
  }, [manage, codes, db, toast]);
  return codes;
}
