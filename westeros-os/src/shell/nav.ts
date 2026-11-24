import { useMemo } from "react";
import { Workflow } from "lucide-react";
import { useSession } from "@/auth/session";
import { useViewBranch } from "@/auth/viewBranch";
import { homeFor, visibleModules } from "@/modules/registry";
import type { ModuleDef } from "@/modules/types";
import { useScreenAccess } from "./useScreenAccess";

export const GROUPS = ["service", "manage", "admin"] as const;

/** the till screens: a central-kitchen branch only manufactures, so they're hidden there (Saqr 2026-11-24) */
export const TILL_MODULES = new Set(["cc-pos", "cc-orders", "pos", "orders"]);
export function useCentralBranch(): boolean {
  const { branchId, branches } = useSession();
  const v = useViewBranch();
  // on كل الفروع the till screens stay (they work on a real branch); only a central kitchen picked or held hides them
  if (!v.locked && branches.length > 1 && !v.value) return false;
  return !!branches.find((b) => b.id === branchId)?.isCentral;
}

/** التشغيل (Saqr 2026-11-24): manufacturing, menu, cashier, orders and the kitchen screen sit under one menu; each keeps its own routes and permissions */
export const OPS_MODULES = ["cc-mfg", "cc-menu", "cc-pos", "cc-orders", "cc-kitchen"];
function opsMenu(members: ModuleDef[]): ModuleDef {
  const first = members[0];
  const sub = members.map((m) => ({ to: m.nav!.path, label: m.title.ar, Icon: m.icon, paths: [{ to: m.nav!.path, end: false }], module: m }));
  return {
    id: "cc-ops",
    status: "ready",
    icon: Workflow,
    title: { ar: "التشغيل", en: "Operations" },
    description: { ar: "التصنيع والمنيو والكاشير والطلبات وشاشة المطبخ، حسب الفرع", en: "Manufacturing, menu, cashier, orders and kitchen, per branch" },
    routes: [],
    nav: { path: first.nav!.path, group: first.nav!.group, order: Math.min(...members.map((m) => m.nav!.order)), mobile: members.some((m) => m.nav!.mobile), useSub: () => sub, activePaths: members.map((m) => m.nav!.path), members },
  };
}

/** Nav items for the current role; the role's home first in the mobile bar. */
export function useNav() {
  const { role } = useSession();
  const access = useScreenAccess();
  const central = useCentralBranch();
  return useMemo(() => {
    const all = visibleModules(role).filter((m) => !central || !TILL_MODULES.has(m.id));
    const ops = OPS_MODULES.map((id) => all.find((m) => m.id === id)).filter((m): m is ModuleDef => !!m);
    const items = ops.length > 1 ? [...all.filter((m) => !OPS_MODULES.includes(m.id)), opsMenu(ops)] : all;
    const home = homeFor(role);
    const grouped = GROUPS.map((g) => ({ group: g, items: items.filter((m) => m.nav!.group === g).sort((a, b) => a.nav!.order - b.nav!.order) })).filter((g) => g.items.length);
    const mobilePool = items.filter((m) => m.nav!.mobile || m.nav!.path === home || m.nav!.activePaths?.includes(home));
    const isHome = (m: ModuleDef) => m.nav!.path === home || !!m.nav!.activePaths?.includes(home);
    const mobile: ModuleDef[] = [...mobilePool.filter(isHome), ...mobilePool.filter((m) => !isHome(m))].slice(0, 4);
    return { items, grouped, mobile, home };
  }, [role, access, central]); // eslint-disable-line react-hooks/exhaustive-deps
}
