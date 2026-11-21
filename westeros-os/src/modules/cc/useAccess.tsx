/** The detailed permissions on screen: which tabs show, and which buttons a tab shows (see access.ts). */
import { createContext, useCallback, useContext, type ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { Lock } from "lucide-react";
import { useSession } from "@/auth/session";
import { useLive } from "@/data/hooks";
import { Card, EmptyState } from "@/ui";
import { memberMay, type Act } from "./access";
import { listsOf } from "./lib";

/** may the signed-in employee do `act` on `area`? */
export function useMay() {
  const { staff } = useSession();
  const settings = useLive("mfgSettings").data[0];
  const lists = settings ? listsOf(settings) : null;
  return useCallback((area: string, act: Act) => memberMay(staff, lists, area, act), [staff, lists]);
}

export type AreaRights = Record<Act, boolean>;
const Ctx = createContext<AreaRights | null>(null);
const ALL_ON: AreaRights = { view: true, add: true, edit: true, delete: true, import: true, export: true };

/** what the signed-in employee may do on the tab they are on (everything outside a tab that checks permissions) */
export function useArea(): AreaRights {
  return useContext(Ctx) ?? ALL_ON;
}
/** the same, or null outside a tab (the export and import buttons hide only inside one) */
export const useAreaOrNull = () => useContext(Ctx);

/**
 * A tab that checks permissions: without مشاهدة it goes to the first tab of the screen the employee may see
 * (`fallback`), or says the tab is closed; inside it, useArea() tells the buttons what is allowed.
 */
export function AreaGate({ id, fallback, children }: { id: string; fallback?: string | null; children: ReactNode }) {
  const may = useMay();
  if (!may(id, "view")) return fallback ? <Navigate to={fallback} replace /> : <Card><EmptyState icon={<Lock />} title="مالكش صلاحية تشوف الخانة دي" body="صلاحيات كل دور بتتحدد من المستخدمين ← الأدوار." /></Card>;
  const rights = Object.fromEntries((["view", "add", "edit", "delete", "import", "export"] as Act[]).map((a) => [a, may(id, a)])) as AreaRights;
  return <Ctx.Provider value={rights}>{children}</Ctx.Provider>;
}

/** the tabs of a screen the employee may see, and the first of them (where a closed tab sends them) */
export function useTabs<T extends { to: string; area: string }>(items: T[]): { tabs: T[]; first: string | null } {
  const may = useMay();
  const tabs = items.filter((t) => may(t.area, "view"));
  return { tabs, first: tabs[0]?.to ?? null };
}
