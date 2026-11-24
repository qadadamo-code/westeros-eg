/**
 * الفرع المعروض (Saqr 2026-11-24): the data inside every main section follows the user's workplace (مكان العمل).
 * A user of all branches sees every branch together by default and may narrow the view to one branch from the top
 * of the section; a user of one branch sees only that branch and can't switch. Menus themselves still follow the
 * role and permissions. The choice is kept per device.
 */
import { useSyncExternalStore } from "react";
import { useSession } from "./session";
import { loadRaw, saveRaw } from "@/lib/storage";

const KEY = "westeros-os.viewBranch";
let current: string | null = loadRaw(KEY) || null;
const subs = new Set<() => void>();
const subscribe = (cb: () => void) => (subs.add(cb), () => void subs.delete(cb));
const get = () => current;
export function setViewBranch(id: string | null) {
  current = id || null;
  saveRaw(KEY, current ?? "");
  subs.forEach((f) => f());
}

export interface ViewBranch {
  /** the one branch in view, or null = every branch the user may see */
  value: string | null;
  set: (id: string | null) => void;
  /** the branch ids in view; null = all branches (a user of all branches with no branch picked) */
  ids: string[] | null;
  /** a user of one branch: fixed to it */
  locked: boolean;
  /** a user held to some branches (their workplace); null = all branches */
  allowed: string[] | null;
  /** is a row of this branch in view? rows without a branch always are */
  inView: (branchId: string | null | undefined) => boolean;
}

/** a screen's branch filter that follows the section's branch picker: "" = all branches in view */
export function useViewBranchState(): [string, (id: string) => void] {
  const v = useViewBranch();
  return [v.value ?? "", (id: string) => setViewBranch(id || null)];
}

export function useViewBranch(): ViewBranch {
  const { staff, branches } = useSession();
  const picked = useSyncExternalStore(subscribe, get, get);
  const allowed = staff && staff.branchIds.length ? staff.branchIds : null;
  const known = (id: string | null) => !!id && branches.some((b) => b.id === id) && (!allowed || allowed.includes(id));
  const locked = !!allowed && allowed.length === 1;
  const value = locked ? allowed![0] : known(picked) ? picked : null;
  const ids = value ? [value] : allowed;
  return { value, set: setViewBranch, ids, locked, allowed, inView: (b) => !b || !ids || ids.includes(b) };
}
