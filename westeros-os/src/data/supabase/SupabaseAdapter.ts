/**
 * SupabaseAdapter — same Repo contract, backed by Postgres (RLS) + Realtime.
 *
 *  - camelCase ⇄ snake_case on top-level keys (jsonb contents stay as written).
 *  - Writes are optimistic: listeners get the new row immediately (optimistic: true), then the
 *    server row (or a rollback event + thrown error).
 *  - Offline: writes go to a persisted outbox and are replayed in order when the connection returns;
 *    reads fall back to the last rows seen for that collection.
 *  - Realtime: one channel per restaurant, postgres_changes filtered by restaurant_id.
 */
import { createClient, type RealtimeChannel, type SupabaseClient } from "@supabase/supabase-js";
import { uuid } from "@/lib/id";
import { nowIso } from "@/lib/time";
import { loadJSON, saveJSON } from "@/lib/storage";
import { runQuery } from "../query";
import type { AuthApi, AuthUser, ChangeEvent, GuestApi, HistoryApi, Insertable, Patch, Query, Repo, SyncStatus, Unsubscribe } from "../repo";
import { TABLE_NAMES, type CollectionName, type Membership, type Restaurant, type RowOf } from "../types";

type AnyRow = { id: string } & Record<string, unknown>;
type OutboxOp = { op: "insert" | "update" | "delete"; c: CollectionName; id: string; data?: Record<string, unknown>; at: string };

const OUTBOX_KEY = "sufra-os.outbox";
/** tables in the Realtime publication (see migration) */
const REALTIME: CollectionName[] = ["orders", "orderItems", "serviceCalls", "tables", "checks", "payments", "reservations", "menuItems", "conversations", "messages", "stockRequests"];
/** never select pin_hash (column privilege is revoked anyway) */
/** rows per request: the API never returns more than this in one answer */
const PAGE = 1000;
const MEMBERSHIP_COLS = "id,restaurant_id,user_id,name,role,branch_ids,phone,email,color,has_pin,active,last_seen_at,created_at,updated_at";

export const toSnake = (k: string) => k.replace(/[A-Z]/g, (c) => "_" + c.toLowerCase());
export const toCamel = (k: string) => k.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase());
/** generated / server-owned columns the client must not send */
const READ_ONLY = new Set(["hasPin"]);
export function rowToDb(r: Record<string, unknown>) {
  const o: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(r)) if (v !== undefined && !READ_ONLY.has(k)) o[toSnake(k)] = v;
  return o;
}
export function rowFromDb<T>(r: Record<string, unknown>): T {
  const o: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(r)) o[toCamel(k)] = v;
  return o as T;
}

function isNetworkError(e: unknown) {
  const msg = String((e as { message?: string })?.message ?? e);
  return (typeof navigator !== "undefined" && navigator.onLine === false) || /fetch|network|Load failed|timeout/i.test(msg);
}

export class SupabaseAdapter implements Repo {
  readonly kind = "supabase" as const;
  readonly client: SupabaseClient;
  private cache = new Map<CollectionName, Map<string, AnyRow>>();
  private listeners = new Set<{ cols: Set<string> | null; rid: string | null; cb: (e: ChangeEvent) => void }>();
  private channels = new Map<string, { ch: RealtimeChannel; refs: number }>();
  private syncListeners = new Set<(s: SyncStatus) => void>();
  private outbox: OutboxOp[] = loadJSON<OutboxOp[]>(OUTBOX_KEY, []);
  private flushing = false;
  private status: SyncStatus;

  constructor(url: string, anonKey: string) {
    this.client = createClient(url, anonKey, { auth: { persistSession: true, autoRefreshToken: true } });
    const online = typeof navigator === "undefined" ? true : navigator.onLine;
    this.status = { mode: "cloud", online, pending: this.outbox.length, peers: 0, lastSyncAt: null, error: null };
    if (typeof window !== "undefined") {
      window.addEventListener("online", () => {
        this.setStatus({ online: true });
        void this.flush();
      });
      window.addEventListener("offline", () => this.setStatus({ online: false }));
    }
  }

  async ready() {
    await this.client.auth.getSession();
    void this.flush();
  }

  /* ───────── helpers ───────── */

  private table(c: CollectionName) {
    return this.client.from(TABLE_NAMES[c]);
  }
  private cacheOf(c: CollectionName) {
    let m = this.cache.get(c);
    if (!m) this.cache.set(c, (m = new Map()));
    return m;
  }
  private setStatus(p: Partial<SyncStatus>) {
    this.status = { ...this.status, ...p };
    for (const cb of this.syncListeners) cb(this.status);
  }
  private emit(e: ChangeEvent) {
    const rid = (e.row as AnyRow | undefined)?.restaurantId ?? null;
    for (const l of this.listeners) {
      if (l.cols && !l.cols.has(e.collection)) continue;
      if (l.rid && rid && rid !== l.rid) continue;
      l.cb(e);
    }
  }
  private remember(c: CollectionName, rows: AnyRow[]) {
    const m = this.cacheOf(c);
    for (const r of rows) m.set(r.id, r);
  }

  /* ───────── reads ───────── */

  async list<C extends CollectionName>(c: C, q?: Query<RowOf<C>>): Promise<RowOf<C>[]> {
    const build = () => {
      let req = this.table(c).select(c === "memberships" ? MEMBERSHIP_COLS : "*");
      if (q?.where)
        for (const [k, v] of Object.entries(q.where)) {
          if (v === undefined) continue;
          if (Array.isArray(v)) req = req.in(toSnake(k), v);
          else if (v === null) req = req.is(toSnake(k), null);
          else req = req.eq(toSnake(k), v as string | number | boolean);
        }
      if (q?.contains) for (const [k, v] of Object.entries(q.contains)) if (v !== undefined) req = req.contains(toSnake(k), [v]);
      if (q?.gte) for (const [k, v] of Object.entries(q.gte)) if (v !== undefined) req = req.gte(toSnake(k), v);
      if (q?.lte) for (const [k, v] of Object.entries(q.lte)) if (v !== undefined) req = req.lte(toSnake(k), v);
      for (const o of q?.orderBy ?? []) req = req.order(toSnake(o.field), { ascending: o.dir !== "desc" });
      return req;
    };
    const fail = (error: unknown) => {
      if (isNetworkError(error)) {
        this.setStatus({ online: false });
        return runQuery(this.cacheOf(c).values() as Iterable<RowOf<C>>, q);
      }
      throw error;
    };
    const first = await (q?.limit ? build().limit(q.limit) : build());
    if (first.error) return fail(first.error);
    let data = first.data as unknown as Record<string, unknown>[];
    // The server hands back at most PAGE rows per request. A table that reached it is read again page by page in a
    // fixed order, so a long journal or movement list is never cut short without anyone noticing.
    if (!q?.limit && data.length >= PAGE) {
      data = [];
      for (let from = 0; ; from += PAGE) {
        const page = await build().order("id").range(from, from + PAGE - 1);
        if (page.error) return fail(page.error);
        const rows = page.data as unknown as Record<string, unknown>[];
        data.push(...rows);
        if (rows.length < PAGE) break;
      }
    }
    const rows = data.map((r) => rowFromDb<AnyRow>(r));
    this.remember(c, rows);
    this.setStatus({ online: true, lastSyncAt: nowIso(), error: null });
    return rows as unknown as RowOf<C>[];
  }

  async get<C extends CollectionName>(c: C, id: string): Promise<RowOf<C> | null> {
    const rows = await this.list(c, { where: { id } } as Query<RowOf<C>>);
    return rows[0] ?? null;
  }

  /* ───────── writes (optimistic + outbox) ───────── */

  private async send(op: OutboxOp): Promise<AnyRow | null> {
    const t = this.table(op.c);
    const sel = op.c === "memberships" ? MEMBERSHIP_COLS : "*";
    if (op.op === "insert") {
      const { data, error } = await t.insert(rowToDb(op.data!)).select(sel).single();
      if (error) throw error;
      return rowFromDb<AnyRow>(data as unknown as Record<string, unknown>);
    }
    if (op.op === "update") {
      const { data, error } = await t.update(rowToDb(op.data!)).eq("id", op.id).select(sel).single();
      if (error) throw error;
      return rowFromDb<AnyRow>(data as unknown as Record<string, unknown>);
    }
    const { error } = await t.delete().eq("id", op.id);
    if (error) throw error;
    return null;
  }

  private async write(op: OutboxOp, optimisticRow: AnyRow | undefined): Promise<AnyRow | null> {
    const type = op.op;
    if (optimisticRow) {
      if (type === "delete") this.cacheOf(op.c).delete(op.id);
      else this.cacheOf(op.c).set(op.id, optimisticRow);
      this.emit({ collection: op.c, type, id: op.id, row: optimisticRow as never, optimistic: true, origin: "local" });
    }
    if (!this.status.online || this.outbox.length) {
      this.enqueue(op);
      return optimisticRow ?? null;
    }
    try {
      const row = await this.send(op);
      if (row) this.cacheOf(op.c).set(row.id, row);
      this.emit({ collection: op.c, type, id: op.id, row: (row ?? optimisticRow) as never, origin: "local" });
      this.setStatus({ lastSyncAt: nowIso(), error: null });
      return row;
    } catch (e) {
      if (isNetworkError(e)) {
        this.setStatus({ online: false });
        this.enqueue(op);
        return optimisticRow ?? null;
      }
      this.emit({ collection: op.c, type, id: op.id, origin: "local", rollback: true });
      this.setStatus({ error: String((e as Error).message ?? e) });
      throw e;
    }
  }

  private enqueue(op: OutboxOp) {
    this.outbox.push(op);
    saveJSON(OUTBOX_KEY, this.outbox);
    this.setStatus({ pending: this.outbox.length });
  }

  /** Replays queued writes in order. Network errors stop the flush; server rejections drop the op. */
  async flush() {
    if (this.flushing || !this.outbox.length) return;
    this.flushing = true;
    try {
      while (this.outbox.length) {
        const op = this.outbox[0];
        try {
          const row = await this.send(op);
          if (row) this.emit({ collection: op.c, type: op.op, id: op.id, row: row as never, origin: "local" });
        } catch (e) {
          if (isNetworkError(e)) {
            this.setStatus({ online: false });
            break;
          }
          this.emit({ collection: op.c, type: op.op, id: op.id, origin: "local", rollback: true });
          this.setStatus({ error: String((e as Error).message ?? e) });
        }
        this.outbox.shift();
        saveJSON(OUTBOX_KEY, this.outbox);
        this.setStatus({ pending: this.outbox.length, lastSyncAt: nowIso(), online: true });
      }
    } finally {
      this.flushing = false;
    }
  }

  async insert<C extends CollectionName>(c: C, input: Insertable<RowOf<C>>): Promise<RowOf<C>> {
    const now = nowIso();
    const row = { createdAt: now, updatedAt: now, ...(input as object), id: (input as { id?: string }).id ?? uuid() } as AnyRow;
    const out = await this.write({ op: "insert", c, id: row.id, data: row, at: now }, row);
    return (out ?? row) as unknown as RowOf<C>;
  }

  async insertMany<C extends CollectionName>(c: C, rows: Insertable<RowOf<C>>[]): Promise<RowOf<C>[]> {
    const out: RowOf<C>[] = [];
    for (const r of rows) out.push(await this.insert(c, r));
    return out;
  }

  async update<C extends CollectionName>(c: C, id: string, patch: Patch<RowOf<C>>): Promise<RowOf<C>> {
    const now = nowIso();
    const cur = this.cacheOf(c).get(id);
    const optimistic = cur ? ({ ...cur, ...(patch as object), updatedAt: now } as AnyRow) : undefined;
    const out = await this.write({ op: "update", c, id, data: { ...(patch as object), updatedAt: now }, at: now }, optimistic);
    return (out ?? optimistic ?? { id, ...(patch as object) }) as unknown as RowOf<C>;
  }

  async remove<C extends CollectionName>(c: C, id: string): Promise<void> {
    const cur = this.cacheOf(c).get(id) ?? ({ id } as AnyRow);
    await this.write({ op: "delete", c, id, at: nowIso() }, cur);
  }

  /* ───────── realtime ───────── */

  subscribe(collections: CollectionName[] | "*", restaurantId: string | null, cb: (e: ChangeEvent) => void): Unsubscribe {
    const l = { cols: collections === "*" ? null : new Set<string>(collections), rid: restaurantId, cb };
    this.listeners.add(l);
    const wantsRealtime = collections === "*" || collections.some((c) => REALTIME.includes(c));
    if (restaurantId && wantsRealtime) this.retainChannel(restaurantId);
    return () => {
      this.listeners.delete(l);
      if (restaurantId && wantsRealtime) this.releaseChannel(restaurantId);
    };
  }

  private retainChannel(rid: string) {
    const cur = this.channels.get(rid);
    if (cur) {
      cur.refs++;
      return;
    }
    let ch = this.client.channel(`restaurant:${rid}`);
    for (const c of REALTIME) {
      ch = ch.on("postgres_changes", { event: "*", schema: "public", table: TABLE_NAMES[c], filter: `restaurant_id=eq.${rid}` }, (payload) => {
        const type = payload.eventType === "INSERT" ? "insert" : payload.eventType === "UPDATE" ? "update" : "delete";
        const raw = (type === "delete" ? payload.old : payload.new) as Record<string, unknown>;
        const row = rowFromDb<AnyRow>(raw);
        if (type === "delete") this.cacheOf(c).delete(row.id);
        else this.cacheOf(c).set(row.id, row);
        this.setStatus({ lastSyncAt: nowIso(), online: true });
        this.emit({ collection: c, type, id: row.id, row: row as never, origin: "server" });
      });
    }
    ch.subscribe((state) => {
      if (state === "SUBSCRIBED") this.setStatus({ online: true, error: null });
      if (state === "CHANNEL_ERROR" || state === "TIMED_OUT") this.setStatus({ error: `realtime ${state.toLowerCase()}` });
    });
    this.channels.set(rid, { ch, refs: 1 });
  }

  private releaseChannel(rid: string) {
    const cur = this.channels.get(rid);
    if (!cur) return;
    if (--cur.refs <= 0) {
      void this.client.removeChannel(cur.ch);
      this.channels.delete(rid);
    }
  }

  sync() {
    return this.status;
  }
  onSync(cb: (s: SyncStatus) => void): Unsubscribe {
    this.syncListeners.add(cb);
    return () => this.syncListeners.delete(cb);
  }

  /* ───────── auth ───────── */

  private toUser(u: { id: string; email?: string | null; user_metadata?: Record<string, unknown> } | null | undefined): AuthUser | null {
    if (!u) return null;
    return { id: u.id, email: u.email ?? "", name: String(u.user_metadata?.full_name ?? u.email ?? "") };
  }

  auth: AuthApi = {
    current: async () => {
      const { data } = await this.client.auth.getSession();
      return this.toUser(data.session?.user);
    },
    signInWithPassword: async (email, password) => {
      const { data, error } = await this.client.auth.signInWithPassword({ email, password });
      if (error) throw Object.assign(new Error("invalid_credentials"), { code: "invalid_credentials", cause: error });
      return this.toUser(data.user)!;
    },
    signOut: async () => {
      await this.client.auth.signOut();
    },
    onChange: (cb) => {
      const { data } = this.client.auth.onAuthStateChange((_e, session) => cb(this.toUser(session?.user)));
      return () => data.subscription.unsubscribe();
    },
    myMemberships: async () => {
      const u = await this.auth.current();
      if (!u) return [];
      const { data, error } = await this.client.from("memberships").select(MEMBERSHIP_COLS).eq("user_id", u.id).eq("active", true);
      if (error) throw error;
      const ms = (data as unknown as Record<string, unknown>[]).map((r) => rowFromDb<Membership>(r));
      if (!ms.length) return [];
      const { data: rs, error: e2 } = await this.client.from("restaurants").select("*").in("id", ms.map((m) => m.restaurantId));
      if (e2) throw e2;
      const byId = new Map((rs as Record<string, unknown>[]).map((r) => [r.id as string, rowFromDb<Restaurant>(r)]));
      return ms.flatMap((m) => (byId.has(m.restaurantId) ? [{ membership: m, restaurant: byId.get(m.restaurantId)! }] : []));
    },
    verifyPin: async (restaurantId, membershipId, pin) => {
      const { data, error } = await this.client.rpc("verify_staff_pin", { p_restaurant_id: restaurantId, p_membership_id: membershipId, p_pin: pin });
      if (error) throw error;
      return data ? rowFromDb<Membership>(data as Record<string, unknown>) : null;
    },
    setPin: async (restaurantId, membershipId, pin) => {
      const { error } = await this.client.rpc("set_staff_pin", { p_restaurant_id: restaurantId, p_membership_id: membershipId, p_pin: pin });
      if (error) throw error;
    },
    pinRoster: async (restaurantId) => {
      const { data, error } = await this.client.rpc("pin_roster", { p_restaurant_id: restaurantId });
      if (error) throw error;
      return ((data as Record<string, unknown>[]) ?? []).map((r) => rowFromDb<Membership>(r));
    },
  };

  /* ───────── guest RPCs (anon) ───────── */

  history: HistoryApi = {
    list: async (restaurantId, limit = 150) => {
      const { data, error } = await this.client
        .from("change_log")
        .select("id, table_name, row_id, op, before, after, source, undone_at, created_at")
        .eq("restaurant_id", restaurantId)
        .order("id", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data ?? []).map((r) => ({ id: r.id, table: r.table_name, rowId: r.row_id, op: r.op, before: r.before, after: r.after, source: r.source, undoneAt: r.undone_at, createdAt: r.created_at }));
    },
    countSince: async (restaurantId, iso) => {
      const { count, error } = await this.client.from("change_log").select("id", { count: "exact", head: true }).eq("restaurant_id", restaurantId).gt("created_at", iso);
      if (error) throw error;
      return count ?? 0;
    },
    undo: async (id) => {
      const { error } = await this.client.rpc("undo_change", { p_id: id });
      if (error) throw error;
    },
    undoMany: async (ids) => {
      const { data, error } = await this.client.rpc("undo_changes", { p_ids: ids });
      if (error) throw error;
      return Number(data ?? 0);
    },
    restoreTo: async (restaurantId, iso) => {
      const { data, error } = await this.client.rpc("restore_to", { p_restaurant_id: restaurantId, p_ts: iso });
      if (error) throw error;
      return Number(data ?? 0);
    },
    prune: async (restaurantId) => {
      const { error } = await this.client.rpc("prune_change_log", { p_restaurant_id: restaurantId });
      if (error) throw error;
    },
  };

  guest: GuestApi = {
    menu: async (slug, tableCode) => {
      const { data, error } = await this.client.rpc("guest_menu", { p_slug: slug, p_table_code: tableCode ?? null });
      if (error) throw error;
      return (data as never) ?? null;
    },
    placeOrder: async (slug, input) => {
      const { data, error } = await this.client.rpc("guest_place_order", {
        p_slug: slug, p_table_code: input.tableCode ?? null, p_mode: input.mode, p_lines: input.lines, p_customer: input.customer ?? null, p_note: input.note ?? "",
      });
      if (error) throw error;
      return data as { orderId: string; number: number };
    },
    callWaiter: async (slug, tableCode, type, text = "") => {
      const { data, error } = await this.client.rpc("guest_call_waiter", { p_slug: slug, p_table_code: tableCode, p_type: type, p_text: text });
      if (error) throw error;
      return data as { id: string };
    },
    orderStatus: async (slug, orderId) => {
      const { data, error } = await this.client.rpc("guest_order_status", { p_slug: slug, p_order_id: orderId });
      if (error) throw error;
      return (data as never) ?? null;
    },
  };
}
