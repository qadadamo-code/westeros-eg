import { lazy } from "react";
import { Sparkles } from "lucide-react";
import { defineModule } from "../types";

/**
 * Menu showcase: the whole menu as a full-screen display with the restaurant's own photos, in five views
 * (orbiting dishes, conveyor, flavour wheel, drinks being poured, stacked offers). Read-only: it shows what the
 * menu manager holds, so prices and names are always the live ones.
 */
export default defineModule({
  id: "showcase",
  status: "ready",
  icon: Sparkles,
  title: { ar: "عرض المنيو", en: "Menu showcase" },
  description: { ar: "المنيو كامل بالصور في عرض بملء الشاشة: أطباق دوارة، سير، عجلة نكهات، مشروبات وعروض", en: "The whole menu with photos, full screen: orbiting dishes, conveyor, flavour wheel, drinks and offers" },
  nav: { path: "/showcase", group: "service", order: 36 },
  keywords: ["menu", "showcase", "display", "منيو", "عرض", "شاشة", "صور"],
  routes: [{ path: "/showcase/*", element: lazy(() => import("./ShowcasePage")), layout: "bare", title: { ar: "عرض المنيو", en: "Menu showcase" } }],
  data: ["menuCategories", "menuItems"],
});
