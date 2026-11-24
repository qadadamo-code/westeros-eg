import { useMemo } from "react";
import { useSession } from "@/auth/session";
import { homeFor, visibleModules } from "@/modules/registry";
import type { ModuleDef } from "@/modules/types";
import { useScreenAccess } from "./useScreenAccess";

export const GROUPS = ["service", "manage", "admin"] as const;

/** the till screens: a central-kitchen branch only manufactures, so they're hidden there (Saqr 2026-11-24) */
export const TILL_MODULES = new Set(["cc-pos", "cc-orders", "pos", "orders"]);
export function useCentralBranch(): boolean {
  const { branchId, branches } = useSession();
  return !!branches.find((b) => b.id === branchId)?.isCentral;
}

/** Nav items for the current role; the role's home first in the mobile bar. */
export function useNav() {
  const { role } = useSession();
  const access = useScreenAccess();
  const central = useCentralBranch();
  return useMemo(() => {
    const items = visibleModules(role).filter((m) => !central || !TILL_MODULES.has(m.id));
    const home = homeFor(role);
    const grouped = GROUPS.map((g) => ({ group: g, items: items.filter((m) => m.nav!.group === g).sort((a, b) => a.nav!.order - b.nav!.order) })).filter((g) => g.items.length);
    const mobilePool = items.filter((m) => m.nav!.mobile || m.nav!.path === home);
    const mobile: ModuleDef[] = [...mobilePool.filter((m) => m.nav!.path === home), ...mobilePool.filter((m) => m.nav!.path !== home)].slice(0, 4);
    return { items, grouped, mobile, home };
  }, [role, access, central]); // eslint-disable-line react-hooks/exhaustive-deps
}
