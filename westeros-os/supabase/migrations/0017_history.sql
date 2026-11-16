-- History: every change to the restaurant's data is journalled (the row before and after), so a manager can undo
-- one wrong change and the owner can take the whole restaurant back to a moment in time.
--
--   change_log            one row per insert / update / delete on a tracked table
--   track_changes()       attaches the journal trigger to every tenant table (re-run after adding tables)
--   undo_change(id)       reverses one change (owner, admin, manager)
--   restore_to(rid, ts)   reverses everything after ts, newest first (owner)
--   prune_change_log(rid) drops journal rows older than 30 days
--
-- Reversals are ordinary changes: they are journalled too, so a restore can itself be taken back.

create table if not exists public.change_log (
  id            bigint generated always as identity primary key,
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  table_name    text not null,
  row_id        uuid not null,
  op            text not null check (op in ('I', 'U', 'D')),
  before        jsonb,
  after         jsonb,
  actor_user    uuid,                                   -- auth.uid() of the signed-in device account
  source        text not null default 'app' check (source in ('app', 'undo', 'restore')),
  undone_at     timestamptz,                            -- set on the change an undo or a restore reversed
  txid          bigint not null default txid_current(), -- changes of one statement travel together (cascades)
  created_at    timestamptz not null default now()
);
create index if not exists change_log_rid_idx on public.change_log (restaurant_id, id desc);
create index if not exists change_log_row_idx on public.change_log (table_name, row_id, id desc);

alter table public.change_log enable row level security;
drop policy if exists change_log_select on public.change_log;
create policy change_log_select on public.change_log for select to authenticated
  using (public.has_role(restaurant_id, '{owner,admin,manager}'));
revoke all on public.change_log from anon, authenticated;
grant select on public.change_log to authenticated;

-- The journal trigger. It must never break a sale: any failure inside it is swallowed.
create or replace function public.log_change() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  b jsonb; a jsonb; rid uuid; id_ uuid;
begin
  begin
    if tg_op <> 'INSERT' then b := to_jsonb(old); end if;
    if tg_op <> 'DELETE' then a := to_jsonb(new); end if;
    if tg_op = 'UPDATE' and (a - 'updated_at') = (b - 'updated_at') then return null; end if;
    rid := (coalesce(a, b) ->> 'restaurant_id')::uuid;
    id_ := (coalesce(a, b) ->> 'id')::uuid;
    if rid is null or id_ is null then return null; end if;
    -- a restaurant being deleted takes its journal with it
    if tg_op = 'DELETE' and not exists (select 1 from restaurants r where r.id = rid) then return null; end if;
    insert into change_log (restaurant_id, table_name, row_id, op, before, after, actor_user, source)
    values (rid, tg_table_name, id_, left(tg_op, 1), b, a, auth.uid(),
            coalesce(nullif(current_setting('westeros.source', true), ''), 'app'));
  exception when others then
    null;
  end;
  return null;
end $$;

-- Attach the trigger to every table that belongs to a restaurant. Noisy or append-only tables stay out.
create or replace function public.track_changes() returns int
language plpgsql security definer set search_path = public as $$
declare t text; n int := 0;
begin
  for t in
    select c.table_name
    from information_schema.columns c
    join information_schema.tables tb on tb.table_schema = c.table_schema and tb.table_name = c.table_name and tb.table_type = 'BASE TABLE'
    where c.table_schema = 'public' and c.column_name = 'restaurant_id'
      and c.table_name not in ('change_log', 'audit_log', 'driver_locations', 'people_counts')
      and exists (select 1 from information_schema.columns i
                  where i.table_schema = 'public' and i.table_name = c.table_name and i.column_name = 'id' and i.data_type = 'uuid')
  loop
    execute format('drop trigger if exists zz_log_change on public.%I', t);
    execute format('create trigger zz_log_change after insert or update or delete on public.%I for each row execute function public.log_change()', t);
    n := n + 1;
  end loop;
  return n;
end $$;
revoke execute on function public.track_changes() from public, anon, authenticated;
select public.track_changes();

-- Puts one row back the way it was before a journalled change. Internal: callers check the role.
create or replace function public._revert_change(c public.change_log) returns void
language plpgsql security definer set search_path = public as $$
declare cols text; allcols text; n int;
begin
  if to_regclass('public.' || quote_ident(c.table_name)) is null then return; end if;
  if c.op = 'I' then
    execute format('delete from public.%I where id = $1', c.table_name) using c.row_id;
    return;
  end if;
  select string_agg(quote_ident(column_name), ', ' order by ordinal_position) filter (where column_name <> 'id'),
         string_agg(quote_ident(column_name), ', ' order by ordinal_position)
    into cols, allcols
  from information_schema.columns
  where table_schema = 'public' and table_name = c.table_name and is_generated = 'NEVER' and c.before ? column_name;
  if c.op = 'D' then
    execute format('insert into public.%1$I (%2$s) select %2$s from jsonb_populate_record(null::public.%1$I, $1) on conflict (id) do nothing', c.table_name, allcols)
      using c.before;
    get diagnostics n = row_count;
    if n > 0 then return; end if;
  end if;
  if cols is not null then
    execute format('update public.%1$I t set (%2$s) = (select %2$s from jsonb_populate_record(null::public.%1$I, $1)) where t.id = $2', c.table_name, cols)
      using c.before, c.row_id;
  end if;
end $$;
revoke execute on function public._revert_change(public.change_log) from public, anon, authenticated;

-- Undo one change. Only the newest change of a row can be undone, so nothing newer is silently overwritten.
create or replace function public.undo_change(p_id bigint) returns void
language plpgsql security definer set search_path = public as $$
declare c change_log;
begin
  select * into c from change_log where id = p_id for update;
  if not found then raise exception 'change not found' using errcode = 'P0002'; end if;
  if not public.has_role(c.restaurant_id, '{owner,admin,manager}') then raise exception 'not allowed' using errcode = '42501'; end if;
  if c.undone_at is not null then raise exception 'already undone' using errcode = 'P0001'; end if;
  if exists (select 1 from change_log n where n.table_name = c.table_name and n.row_id = c.row_id and n.id > c.id) then
    raise exception 'newer change on the same record' using errcode = 'P0001';
  end if;
  perform set_config('westeros.source', 'undo', true);
  perform public._revert_change(c);
  perform set_config('westeros.source', '', true);
  update change_log set undone_at = now() where id = c.id;
end $$;

-- Take the restaurant back to a moment: every change after p_ts is reversed, newest transaction first. Inside one
-- transaction a cascade is journalled parent first, so its changes are retried until they all fit (a child row
-- waits for its parent; older changes of a waiting row wait with it).
create or replace function public.restore_to(p_restaurant_id uuid, p_ts timestamptz) returns int
language plpgsql security definer set search_path = public as $$
declare
  g record; c change_log; top bigint; done int := 0; progress boolean; waiting int; err text;
begin
  if not public.has_role(p_restaurant_id, '{owner}') then raise exception 'not allowed' using errcode = '42501'; end if;
  if p_ts is null or p_ts > now() then raise exception 'bad time' using errcode = 'P0001'; end if;
  if p_ts < now() - interval '30 days' then raise exception 'older than the journal' using errcode = 'P0001'; end if;
  perform pg_advisory_xact_lock(hashtext('restore:' || p_restaurant_id::text));
  select max(id) into top from change_log where restaurant_id = p_restaurant_id;
  if top is null then return 0; end if;
  create temp table if not exists _restore_done (id bigint primary key) on commit drop;
  create temp table if not exists _restore_blocked (table_name text, row_id uuid, primary key (table_name, row_id)) on commit drop;
  truncate _restore_done;
  perform set_config('westeros.source', 'restore', true);
  for g in
    select l.txid, max(l.id) as last from change_log l
    where l.restaurant_id = p_restaurant_id and l.created_at > p_ts and l.id <= top
    group by l.txid order by max(l.id) desc
  loop
    loop
      progress := false; waiting := 0;
      truncate _restore_blocked;
      for c in
        select l.* from change_log l
        where l.restaurant_id = p_restaurant_id and l.txid = g.txid and l.created_at > p_ts and l.id <= top
          and not exists (select 1 from _restore_done d where d.id = l.id)
        order by l.id desc
      loop
        -- the owners stay: a restore never removes the people who can sign in and run it
        if c.table_name = 'memberships' and c.op = 'I' and c.after ->> 'role' = 'owner' then
          insert into _restore_done values (c.id);
          continue;
        end if;
        if exists (select 1 from _restore_blocked b where b.table_name = c.table_name and b.row_id = c.row_id) then
          waiting := waiting + 1;
          continue;
        end if;
        begin
          perform public._revert_change(c);
          insert into _restore_done values (c.id);
          done := done + 1; progress := true;
        exception when others then
          err := sqlerrm; waiting := waiting + 1;
          insert into _restore_blocked values (c.table_name, c.row_id) on conflict do nothing;
        end;
      end loop;
      exit when waiting = 0;
      if not progress then raise exception 'restore stopped: %', err using errcode = 'P0001'; end if;
    end loop;
  end loop;
  perform set_config('westeros.source', '', true);
  update change_log l set undone_at = now()
  where l.restaurant_id = p_restaurant_id and l.id <= top and l.undone_at is null and exists (select 1 from _restore_done d where d.id = l.id);
  return done;
end $$;

create or replace function public.prune_change_log(p_restaurant_id uuid) returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not public.has_role(p_restaurant_id, '{owner,admin,manager}') then raise exception 'not allowed' using errcode = '42501'; end if;
  delete from change_log where restaurant_id = p_restaurant_id and created_at < now() - interval '30 days';
  get diagnostics n = row_count;
  return n;
end $$;

revoke execute on function public.undo_change(bigint), public.restore_to(uuid, timestamptz), public.prune_change_log(uuid) from public, anon;
grant execute on function public.undo_change(bigint), public.restore_to(uuid, timestamptz), public.prune_change_log(uuid) to authenticated;
