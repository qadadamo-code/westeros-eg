-- Speed: indexes only. No row is changed, added or removed.
--
-- Every screen reads its rows by restaurant_id, and every row-level security check asks "is this user a member of
-- that restaurant?". Tables added over time did not all get an index starting with restaurant_id, so those reads
-- scanned the whole table, and get slower as the data grows. This adds one where it is missing.
set local lock_timeout = '10s';

do $$
declare t text;
begin
  for t in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
    join pg_attribute a on a.attrelid = c.oid and a.attname = 'restaurant_id' and not a.attisdropped
    where c.relkind = 'r'
      and not exists (
        select 1 from pg_index i
        where i.indrelid = c.oid and i.indkey[0] = a.attnum
      )
  loop
    execute format('create index if not exists %I on public.%I (restaurant_id)', left(t, 45) || '_rid_idx', t);
  end loop;
end $$;

-- the membership check behind every policy: one lookup by (user, restaurant) instead of a scan of the user's rows
create index if not exists memberships_user_restaurant_idx on public.memberships (user_id, restaurant_id) where active;

-- history: "how many changes since …" and the 30-day clean-up read by time
create index if not exists change_log_rid_time_idx on public.change_log (restaurant_id, created_at);

-- the accounts section watches only the newest stock movement (instead of downloading all of them)
create index if not exists stock_moves_rid_created_idx on public.stock_moves (restaurant_id, created_at desc);
