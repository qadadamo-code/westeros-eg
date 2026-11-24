import { describe, expect, it, vi, beforeEach } from "vitest";

// A tiny stand-in for supabase-js: one table held in memory, a counter of requests.
const db: { rows: Record<string, unknown>[]; selects: number; inserts: number[] } = { rows: [], selects: 0, inserts: [] };
function query() {
  const filters: [string, unknown][] = [];
  let insertRows: Record<string, unknown>[] | null = null;
  let one = false;
  const q: Record<string, unknown> = {
    select: () => q,
    eq: (k: string, v: unknown) => (filters.push([k, v]), q),
    in: () => q, is: () => q, gte: () => q, lte: () => q, contains: () => q, order: () => q, range: () => q, limit: () => q,
    insert: (r: Record<string, unknown> | Record<string, unknown>[]) => ((insertRows = Array.isArray(r) ? r : [r]), q),
    single: () => ((one = true), q),
    then: (res: (v: unknown) => void) => {
      if (insertRows) {
        db.inserts.push(insertRows.length);
        db.rows.push(...insertRows);
        return Promise.resolve({ data: one ? insertRows[0] : insertRows, error: null }).then(res);
      }
      db.selects++;
      const data = db.rows.filter((r) => filters.every(([k, v]) => r[k] === v));
      return new Promise((ok) => setTimeout(ok, 5)).then(() => res({ data, error: null }));
    },
  };
  return q;
}
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({ from: () => query(), auth: { getSession: async () => ({ data: { session: null } }) }, channel: () => ({ on() { return this; }, subscribe() {} }), removeChannel: async () => {} }),
  isAuthRetryableFetchError: () => false,
}));

vi.stubGlobal("navigator", { onLine: true });
const { SupabaseAdapter } = await import("./SupabaseAdapter");
const R = "r1";

describe("SupabaseAdapter read cache", () => {
  beforeEach(() => {
    db.rows = [{ id: "a", restaurant_id: R, name: "A" }];
    db.selects = 0;
    db.inserts = [];
  });

  it("asks the server once for the same query asked at the same time", async () => {
    const repo = new SupabaseAdapter("http://x", "k");
    const q = { where: { restaurantId: R } };
    const [a, b] = await Promise.all([repo.list("stockItems", q as never), repo.list("stockItems", q as never)]);
    expect(db.selects).toBe(1);
    expect(a).toEqual(b);
  });

  it("answers a repeated query at once from the last result, kept current by writes", async () => {
    const repo = new SupabaseAdapter("http://x", "k");
    const q = { where: { restaurantId: R } };
    expect(() => repo.peek("stockItems", q as never)).toThrow();
    await repo.list("stockItems", q as never);
    expect(repo.peek("stockItems", q as never).map((r) => r.id)).toEqual(["a"]);
    await repo.insert("stockItems", { id: "b", restaurantId: R, name: "B" } as never);
    expect(repo.peek("stockItems", q as never).map((r) => r.id).sort()).toEqual(["a", "b"]);
  });

  it("saves many rows in one request", async () => {
    const repo = new SupabaseAdapter("http://x", "k");
    const rows = Array.from({ length: 30 }, (_, i) => ({ restaurantId: R, name: `n${i}` }));
    const out = await repo.insertMany("stockItems", rows as never);
    expect(out).toHaveLength(30);
    expect(db.inserts).toEqual([30]);
  });
});
