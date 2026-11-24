/** Keeps the journal in step with the warehouses: whenever a stock movement appears, the entries that are missing are posted. */
import { useEffect, useSyncExternalStore } from "react";
import { useSession } from "@/auth/session";
import { useDb, useLive } from "@/data/hooks";
import { FINANCE_ON } from "./flag";
import { syncStock, type SyncResult } from "./sync";
import { syncShifts, type PosSyncResult } from "./posSync";
import { useActor } from "./perms";
import type { Actor } from "./journalOps";

let last: SyncResult & { at: string | null; busy: boolean } = { posted: 0, problems: [], at: null, busy: false };
const subs = new Set<() => void>();
const set = (next: typeof last) => { last = next; subs.forEach((f) => f()); };
/** the result of the last run, for the screens that show it */
export const useSyncState = () => useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => last);

export async function runSync(db: ReturnType<typeof useDb>) {
  set({ ...last, busy: true });
  try {
    const r = await syncStock(db);
    set({ ...r, at: new Date().toISOString(), busy: false });
    return r;
  } catch (e) {
    const r = { posted: 0, problems: [e instanceof Error ? e.message : String(e)] };
    set({ ...r, at: new Date().toISOString(), busy: false });
    return r;
  }
}

/** the database lets only these write the journal */
const WRITERS = new Set(["owner", "admin", "manager", "accountant"]);

export function useStockSync() {
  const db = useDb();
  const { role } = useSession();
  const on = FINANCE_ON && (!role || WRITERS.has(role));
  const start = useLive("finSettings").data[0]?.data?.startDate ?? null;
  // only the newest movement is watched: downloading every movement on every app open just to count them grew
  // slower each day; a new movement changes this id and starts a run
  const moves = useLive("stockMoves", { orderBy: [{ field: "createdAt", dir: "desc" }], limit: 1 }).data[0]?.id ?? null;
  const accounts = useLive("finAccounts").data.length;
  useEffect(() => {
    if (!on || !start || !moves || !accounts) return;
    const t = setTimeout(() => void runSync(db), 1200);
    return () => clearTimeout(t);
  }, [on, start, moves, accounts, db]);
}

/* ───────── ورديات الكاشير ───────── */
let lastShifts: PosSyncResult & { at: string | null } = { posted: 0, problems: [], at: null };
const shiftSubs = new Set<() => void>();
/** the result of the last run of the till's shifts, for the audit screen */
export const useShiftSyncState = () => useSyncExternalStore((f) => { shiftSubs.add(f); return () => shiftSubs.delete(f); }, () => lastShifts);

export async function runShiftSync(db: ReturnType<typeof useDb>, actor: Actor) {
  let r: PosSyncResult;
  try { r = await syncShifts(db, actor); } catch (e) { r = { posted: 0, problems: [e instanceof Error ? e.message : String(e)] }; }
  lastShifts = { ...r, at: new Date().toISOString() };
  shiftSubs.forEach((f) => f());
  return r;
}

/** Posts the shifts the till closed, whenever one closes and a manager's or accountant's app is open. */
export function useShiftSync() {
  const db = useDb();
  const { role } = useSession();
  const actor = useActor();
  const on = FINANCE_ON && (!role || WRITERS.has(role));
  const start = useLive("finSettings").data[0]?.data?.startDate ?? null;
  const closed = useLive("shifts", { where: { status: "closed" } }).data.length;
  const accounts = useLive("finAccounts").data.length;
  const name = actor.name;
  useEffect(() => {
    if (!on || !start || !closed || !accounts) return;
    const t = setTimeout(() => void runShiftSync(db, { id: actor.id, name, canApprove: actor.canApprove }), 1500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [on, start, closed, accounts, db, name]);
}
