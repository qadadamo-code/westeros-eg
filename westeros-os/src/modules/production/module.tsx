import { lazy } from "react";
import { Factory } from "lucide-react";
import { useLive } from "@/data/hooks";
import { defineModule } from "../types";

/** Nav badge: products made here whose expiry is today or already past. */
function useExpiring(): number | null {
  const batches = useLive("mfgBatches", { where: { status: "done" }, orderBy: [{ field: "madeAt", dir: "desc" }], limit: 200 }).data;
  const soon = Date.now() + 24 * 3_600_000;
  const n = batches.filter((b) => b.outputs.some((o) => Date.parse(o.expiresAt) <= soon && Date.parse(o.expiresAt) > Date.now() - 7 * 86_400_000)).length;
  return n || null;
}

/**
 * Central-kitchen manufacturing — the Westeros Cost Control document as a system: manufacturing methods and their
 * formulas (./calc.ts), batches signed by the chef with production/expiry stickers (./ops.ts, ./Label.tsx), products
 * and recipes. Schema: supabase/migrations/0015_production.sql.
 */
export default defineModule({
  id: "production",
  status: "ready",
  icon: Factory,
  title: { ar: "التصنيع", en: "Production" },
  description: { ar: "تشغيلات المطبخ المركزي: وصفات، تكلفة، باتش باسم الشيف وستيكر صلاحية", en: "Central kitchen batches: recipes, cost, chef-signed batches and expiry labels" },
  permission: "production.view",
  shortcut: "g m",
  homeFor: ["chef"],
  nav: { path: "/production", group: "service", order: 32, mobile: true, useBadge: useExpiring },
  keywords: ["production", "batch", "manufacturing", "recipe", "label", "sticker", "تصنيع", "تشغيلة", "باتش", "ستيكر", "وصفة", "دوبريه", "مطبخ مركزي"],
  routes: [{ path: "/production/*", element: lazy(() => import("./ProductionPage")) }],
  data: ["mfgProducts", "mfgBatches", "mfgSettings"],
});
