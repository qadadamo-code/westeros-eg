-- Checks for 0040_finance.sql: the five finance tables, their guards and who may touch them. Run by tests/finance.sh.
\set ON_ERROR_STOP on
create or replace function pg_temp.act(uid uuid) returns void language sql as $$ select set_config('request.jwt.claim.sub', coalesce(uid::text, ''), false) $$;
select id as owner from auth.users where email = 'owner@westeros.local' \gset
select id as rid from public.restaurants limit 1 \gset
insert into auth.users (id, email) values ('11111111-1111-4111-8111-111111111111', 'kitchen@test');
insert into public.memberships (restaurant_id, user_id, name, role) values (:'rid', '11111111-1111-4111-8111-111111111111', 'Test kitchen', 'kitchen');
\set chef 11111111-1111-4111-8111-111111111111
select count(*) as tracked from information_schema.triggers where trigger_name = 'zz_log_change' and event_object_table like 'fin\_%' and event_manipulation = 'INSERT' \gset
\echo tracked fin tables: :tracked
select pg_temp.act(:'owner');
set role authenticated;
insert into public.fin_accounts (restaurant_id, code, name, type) values (:'rid', '1', '{"ar":"الأصول","en":"Assets"}', 'asset') returning id as acc \gset
insert into public.fin_settings (restaurant_id, data) values (:'rid', '{"yearStartMonth":1}');
insert into public.fin_docs (restaurant_id, kind, name) values (:'rid', 'supplier', 'مورد');
insert into public.fin_cost_centres (restaurant_id, code, name) values (:'rid', '1', '{"ar":"مطبخ","en":""}');
insert into public.fin_entries (restaurant_id, no, year, date, status, lines, source_type, source_id) values (:'rid', 1, 2026, '2026-11-18', 'posted', '[]', 'stock:receive', 'm1') returning id as e1 \gset
do $$ declare ok boolean := false; begin
  begin insert into public.fin_entries (restaurant_id, no, year, date, status, source_type, source_id) select restaurant_id, 2, 2026, '2026-11-18', 'posted', 'stock:receive', 'm1' from public.fin_entries limit 1; exception when unique_violation then ok := true; end;
  if not ok then raise exception 'same source twice should fail'; end if;
  ok := false;
  begin insert into public.fin_entries (restaurant_id, no, year, date, status) select restaurant_id, 1, 2026, '2026-11-18', 'posted' from public.fin_entries limit 1; exception when unique_violation then ok := true; end;
  if not ok then raise exception 'same number twice should fail'; end if;
  ok := false;
  begin insert into public.fin_accounts (restaurant_id, code, type) select restaurant_id, '1', 'asset' from public.fin_accounts limit 1; exception when unique_violation then ok := true; end;
  if not ok then raise exception 'same code twice should fail'; end if;
end $$;
-- a reversal frees the source; drafts and openings never clash
insert into public.fin_entries (restaurant_id, no, year, date, status, source_type, source_id, reverses) values (:'rid', 2, 2026, '2026-11-18', 'posted', 'reversal:stock:receive', 'm1', :'e1') returning id as e2 \gset
update public.fin_entries set reversed_by = :'e2' where id = :'e1';
insert into public.fin_entries (restaurant_id, no, year, date, status, source_type, source_id) values (:'rid', 3, 2026, '2026-11-18', 'posted', 'stock:receive', 'm1');
insert into public.fin_entries (restaurant_id, date, source_type, source_id) values (:'rid', '2026-11-18', 'entry-recurring', 'x'), (:'rid', '2026-11-18', 'entry-recurring', 'x');
insert into public.fin_entries (restaurant_id, no, year, date, status, source_type, source_id) values (:'rid', 4, 2026, '2026-11-18', 'posted', 'opening-balance', 'opening'), (:'rid', 5, 2026, '2026-11-18', 'posted', 'opening-balance', 'opening');
update public.fin_accounts set note = 'x' where id = :'acc';
do $$ begin if (select updated_at = created_at from public.fin_accounts limit 1) then raise exception 'updated_at did not move'; end if; end $$;
reset role;
do $$ begin if (select count(*) from public.change_log where table_name like 'fin\_%') < 10 then raise exception 'finance changes are not in the journal'; end if; end $$;
-- the kitchen neither reads nor writes
select pg_temp.act(:'chef');
set role authenticated;
do $$ declare ok boolean := false; begin
  if (select count(*) from public.fin_entries) <> 0 or (select count(*) from public.fin_accounts) <> 0 then raise exception 'kitchen can read finance'; end if;
  begin insert into public.fin_docs (restaurant_id, kind) select id, 'x' from public.restaurants limit 1; exception when others then ok := true; end;
  if not ok then raise exception 'kitchen can write finance'; end if;
end $$;
reset role;
-- anon has nothing
set role anon;
do $$ declare ok boolean := false; begin
  begin perform count(*) from public.fin_entries; exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'anon can read finance'; end if;
end $$;
reset role;
\echo FINANCE_DB_TESTS_PASSED
