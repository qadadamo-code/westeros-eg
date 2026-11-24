/**
 * Module contract. A module lives in src/modules/<name>/ and default-exports `defineModule({...})`
 * from src/modules/<name>/module.tsx. The registry discovers it automatically — no shell edits.
 */
import type { ComponentType, LazyExoticComponent } from "react";
import type { LucideIcon } from "lucide-react";
import type { Localized, CollectionName } from "@/data/types";
import type { Permission } from "@/auth/permissions";
import type { Role } from "@/auth/roles";

export type ModuleLayout =
  /** sidebar + top bar (default) */
  | "shell"
  /** signed-in, full screen, no chrome (kitchen display, POS kiosk) */
  | "bare"
  /** public, no auth (QR table menu, online ordering) */
  | "guest";

export interface ModuleRoute {
  /** react-router path relative to the app root, e.g. "/pos/*" or "/r/:restaurantSlug/t/:tableCode" */
  path: string;
  /** omit while status is "soon": the shell shows the "coming in the next wave" page */
  element?: ComponentType | LazyExoticComponent<ComponentType>;
  layout?: ModuleLayout;
  /** route-level permission (defaults to the module's) */
  permission?: Permission;
  title?: Localized;
}

export interface ModuleNav {
  /** where the nav item points */
  path: string;
  group: "service" | "manage" | "admin";
  /** sort within group */
  order: number;
  /** eligible for the phone bottom bar */
  mobile?: boolean;
  /** live badge count (hook — runs inside the shell, may use useLive) */
  useBadge?: () => number | null;
  /** قائمة فرعية منسدلة تحت العنصر (hook — runs inside the shell): each item opens `to`, and is lit on any of `paths` */
  useSub?: () => { to: string; label: string; Icon: LucideIcon; paths: { to: string; end: boolean }[]; module?: ModuleDef }[];
  /** a menu that holds other menus (التشغيل): lit on any of these paths */
  activePaths?: string[];
  /** the menus it holds, each still its own module (routes, permissions, badges) */
  members?: ModuleDef[];
}

export interface ModuleDef {
  id: string;
  title: Localized;
  /** one line, shown on the placeholder page and in ⌘K */
  description: Localized;
  icon: LucideIcon;
  routes: ModuleRoute[];
  nav?: ModuleNav;
  /** needed to see the nav item and open the routes */
  permission?: Permission;
  /** roles that land here after login (overrides ROLE_HOME) */
  homeFor?: Role[];
  /** palette/keyboard shortcut to open it, e.g. "g p" */
  shortcut?: string;
  status: "ready" | "soon";
  /** not released yet: left out of the menu and the routes */
  hidden?: boolean;
  /** placeholder page: what is coming, and which data is already there */
  features?: Localized[];
  data?: CollectionName[];
  /** sub-pages shown as tabs (e.g. settings) */
  tabs?: { path: string; title: Localized }[];
  /** extra search words for ⌘K */
  keywords?: string[];
}

export function defineModule(m: ModuleDef): ModuleDef {
  return m;
}
