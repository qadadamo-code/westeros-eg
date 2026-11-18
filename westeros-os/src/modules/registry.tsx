/**
 * Module registry — the ONE place modules plug into the shell.
 *
 * Every `src/modules/<name>/module.tsx` that default-exports `defineModule({...})` is picked up here
 * at build time (import.meta.glob). To add or replace a module you only touch your own folder:
 *
 *   // src/modules/pos/module.tsx
 *   import { lazy } from "react";
 *   import { Receipt } from "lucide-react";
 *   import { defineModule } from "../types";
 *   export default defineModule({
 *     id: "pos", status: "ready", icon: Receipt, permission: "pos.use", homeFor: ["cashier"],
 *     title: { ar: "الكاشير", en: "POS" }, description: {...},
 *     nav: { path: "/pos", group: "service", order: 10, mobile: true },
 *     routes: [{ path: "/pos/*", element: lazy(() => import("./PosPage")) }],
 *   });
 *
 * Routes, sidebar/bottom-bar items, ⌘K entries, role homes and permission guards all come from this list.
 */
import type { ModuleDef } from "./types";
import { ROLE_HOME, type Role } from "@/auth/roles";
import { can } from "@/auth/permissions";
import { COST_CONTROL_ONLY } from "@/costControl";
import { screenAllowed } from "./screens";

// ops/* holds several modules (cameras, radio, support, alerts) under one folder
const found = import.meta.glob<{ default: ModuleDef }>(["./*/module.tsx", "./ops/*/module.tsx", "./cc/*/module.tsx"], { eager: true });

// the Cost Control version shows only its own modules; the full system (the backup) shows everything else
const inVersion = (file: string) => file.startsWith("./cc/") === COST_CONTROL_ONLY;

export const modules: ModuleDef[] = Object.entries(found)
  .filter(([file]) => inVersion(file))
  .map(([file, m]) => {
    if (!m.default?.id) throw new Error(`${file} must default-export defineModule({...})`);
    return m.default;
  })
  .filter((m) => !m.hidden)
  .sort((a, b) => (a.nav?.order ?? 999) - (b.nav?.order ?? 999));

{
  const ids = new Set<string>();
  for (const m of modules) {
    if (ids.has(m.id)) throw new Error(`duplicate module id "${m.id}"`);
    ids.add(m.id);
  }
}

export const moduleById = (id: string) => modules.find((m) => m.id === id) ?? null;

/** May this role open the module, and has the user's type ticked its screen? */
export const allowed = (m: ModuleDef, role: Role | null) => (!m.permission || can(role, m.permission)) && screenAllowed(m.id);

export function visibleModules(role: Role | null) {
  return modules.filter((m) => m.nav && allowed(m, role));
}

/** Landing route for a role: a module claiming it via homeFor, else ROLE_HOME, else the first visible screen. */
export function homeFor(role: Role | null): string {
  if (!role) return "/login";
  const claimed = modules.find((m) => m.homeFor?.includes(role) && m.nav && allowed(m, role));
  if (claimed?.nav) return claimed.nav.path;
  const fallback = ROLE_HOME[role];
  const target = modules.find((m) => m.nav?.path === fallback);
  if (target && allowed(target, role)) return fallback;
  return visibleModules(role)[0]?.nav?.path ?? (COST_CONTROL_ONLY ? "/summary" : "/overview");
}

export type { ModuleDef };
