/** Keeps the journal in step with the warehouses: whenever a stock movement appears, the entries that are missing are posted. */
import { useEffect, useSyncExternalStore } from "react";
import { useSession } from "@/auth/session";
import { useDb, useLive } from "@/data/hooks";
import { FINANCE_ON } from "./flag";
import { syncStock, type SyncResult } from "./sync";

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
  const moves = useLive("stockMoves").data.length;
  const accounts = useLive("finAccounts").data.length;
  useEffect(() => {
    if (!on || !start || !moves || !accounts) return;
    const t = setTimeout(() => void runSync(db), 1200);
    return () => clearTimeout(t);
  }, [on, start, moves, accounts, db]);
}
