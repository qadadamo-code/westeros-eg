-- Checks for 0017_history.sql: journal, undo of one change, and restore to a moment. Run by tests/history.sh.
\set ON_ERROR_STOP on
create or replace function pg_temp.act(uid uuid) returns void language sql as $$ select set_config('request.jwt.claim.sub', coalesce(uid::text, ''), false) $$;
-- one fingerprint for the whole restaurant: every tracked table, every row, without updated_at
create or replace function pg_temp.fingerprint() returns text language plpgsql as $$
declare t text; part text; acc text := '';
begin
  for t in select distinct event_object_table from information_schema.triggers where trigger_name = 'zz_log_change' order by 1 loop
    execute format('select coalesce(md5(string_agg((to_jsonb(row_) - ''updated_at'')::text, ''|'' order by row_.id)), ''-'') from public.%I row_', t) into part;
    acc := acc || t || '=' || part || ';';
  end loop;
  return md5(acc);
end $$;
select id as owner from auth.users where email = 'owner@westeros.local' \gset
select id as rid from public.restaurants limit 1 \gset
select id as bid from public.branches where restaurant_id = :'rid' limit 1 \gset
select pg_temp.act(:'owner');

-- 1. undo one change
select id as item, price as price0 from public.menu_items where restaurant_id = :'rid' order by id limit 1 \gset
update public.menu_items set price = price + 100000 where id = :'item';
select id as chg from public.change_log where table_name = 'menu_items' and row_id = :'item' order by id desc limit 1 \gset
select public.undo_change(:chg);
do $$ begin
  if (select price from public.menu_items order by id limit 1) <> (select (before ->> 'price')::bigint from public.change_log where table_name = 'menu_items' order by id limit 1) then
    raise exception 'undo did not put the price back';
  end if;
end $$;
-- undoing twice is refused
do $$ declare ok boolean := false; begin
  begin perform public.undo_change((select max(id) from public.change_log where table_name = 'menu_items' and source = 'app')); exception when others then ok := true; end;
  if not ok then raise exception 'second undo should fail'; end if;
end $$;

-- 2. restore to a moment after a mix of inserts, updates and cascading deletes
select pg_temp.fingerprint() as fp0 \gset
select pg_sleep(0.05);
select clock_timestamp() as t0 \gset
select pg_sleep(0.05);
update public.menu_items set price = price + 500000 where restaurant_id = :'rid';
insert into public.customers (restaurant_id, name, phone) values (:'rid', 'Test customer', '01000000000');
insert into public.orders (id, restaurant_id, branch_id, number, mode, source, status) values ('00000000-0000-4000-8000-0000000000a1', :'rid', :'bid', 901, 'takeaway', 'pos', 'open');
insert into public.order_items (restaurant_id, order_id, item_id, name, qty, unit_price, status)
  select :'rid', '00000000-0000-4000-8000-0000000000a1', id, name, 2, price, 'new' from public.menu_items where restaurant_id = :'rid' order by id limit 3;
update public.order_items set status = 'void' where order_id = '00000000-0000-4000-8000-0000000000a1';
delete from public.orders where id = '00000000-0000-4000-8000-0000000000a1';
delete from public.kitchen_stations where id = (select id from public.kitchen_stations where restaurant_id = :'rid' order by id limit 1);
delete from public.memberships where id = (select id from public.memberships where restaurant_id = :'rid' and role = 'waiter' order by id limit 1);
select public.restore_to(:'rid', :'t0') as reverted \gset
\echo reverted :reverted
select pg_temp.fingerprint() as fp1 \gset
select case when :'fp0' = :'fp1' then 'RESTORE_OK' else 'RESTORE_MISMATCH' end as restore;
do $$ begin if (select count(*) from public.orders where number = 901) <> 0 then raise exception 'order should be gone'; end if; end $$;

-- 3. a restore can itself be taken back
select pg_sleep(0.05);
select clock_timestamp() as t1 \gset
select pg_sleep(0.05);
update public.menu_items set price = price + 700000 where restaurant_id = :'rid';
select pg_temp.fingerprint() as fp2 \gset
select pg_sleep(0.05);
select clock_timestamp() as t2 \gset
select pg_sleep(0.05);
select public.restore_to(:'rid', :'t1');
select public.restore_to(:'rid', :'t2');
select pg_temp.fingerprint() as fp3 \gset
select case when :'fp2' = :'fp3' then 'RESTORE_BACK_OK' else 'RESTORE_BACK_MISMATCH' end as restore_back;

-- 4. only the owner restores; outsiders see nothing
select pg_temp.act((select id from auth.users where email = 'manager@westeros.local'));
do $$ declare ok boolean := false; begin
  begin perform public.restore_to((select id from public.restaurants limit 1), now() - interval '1 minute'); exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'a manager must not restore'; end if;
end $$;
set role authenticated;
select pg_temp.act(null);
do $$ begin if (select count(*) from public.change_log) <> 0 then raise exception 'journal leaked'; end if; end $$;
reset role;
\echo HISTORY_TESTS_PASSED
