-- Checks for 0043_hr_docs.sql: who may read and write HR records. Run by tests/hr_docs.sh.
\set ON_ERROR_STOP on
create or replace function pg_temp.act(uid uuid) returns void language sql as $$ select set_config('request.jwt.claim.sub', coalesce(uid::text, ''), false) $$;
select id as owner from auth.users where email = 'owner@westeros.local' \gset
select id as rid from public.restaurants limit 1 \gset
insert into auth.users (id, email) values ('22222222-2222-4222-8222-222222222222', 'a@test'), ('33333333-3333-4333-8333-333333333333', 'b@test');
insert into public.memberships (restaurant_id, user_id, name, role) values (:'rid', '22222222-2222-4222-8222-222222222222', 'A', 'kitchen') returning id as ma \gset
insert into public.memberships (restaurant_id, user_id, name, role) values (:'rid', '33333333-3333-4333-8333-333333333333', 'B', 'kitchen') returning id as mb \gset
-- the owner writes everything
select pg_temp.act(:'owner');
set role authenticated;
insert into public.hr_docs (restaurant_id, kind, name) values (:'rid', 'settings', 's'), (:'rid', 'job', 'cook'), (:'rid', 'candidate', 'x');
insert into public.hr_docs (restaurant_id, kind, member_id) values (:'rid', 'file', :'ma'), (:'rid', 'note', :'ma'), (:'rid', 'warning', :'ma'), (:'rid', 'file', :'mb'), (:'rid', 'payslip', :'mb');
reset role;
-- member A: own rows except notes, plus shared lists
select pg_temp.act('22222222-2222-4222-8222-222222222222');
set role authenticated;
do $$ begin
  if (select count(*) from public.hr_docs where kind in ('settings', 'job')) <> 2 then raise exception 'member cannot read shared lists'; end if;
  if (select count(*) from public.hr_docs where kind = 'candidate') <> 0 then raise exception 'member reads candidates'; end if;
  if (select count(*) from public.hr_docs where kind = 'note') <> 0 then raise exception 'member reads management notes'; end if;
  if (select count(*) from public.hr_docs where kind in ('file', 'warning')) <> 2 then raise exception 'member cannot read own file and warning'; end if;
  if (select count(*) from public.hr_docs where kind = 'payslip') <> 0 then raise exception 'member reads another payslip'; end if;
end $$;
insert into public.hr_docs (restaurant_id, kind, member_id, status) values (:'rid', 'request', :'ma', 'pending') returning id as req \gset
insert into public.hr_docs (restaurant_id, kind, member_id) values (:'rid', 'ack', :'ma'), (:'rid', 'progress', :'ma');
update public.hr_docs set status = 'cancelled' where id = :'req';
do $$ declare ok boolean; r uuid; begin
  ok := false; begin insert into public.hr_docs (restaurant_id, kind, member_id, status) select restaurant_id, 'request', member_id, 'approved' from public.hr_docs where kind = 'ack' limit 1; exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'member can add an approved request'; end if;
  ok := false; begin insert into public.hr_docs (restaurant_id, kind, member_id) select restaurant_id, 'decision', member_id from public.hr_docs where kind = 'ack' limit 1; exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'member can forge a decision'; end if;
  ok := false; begin insert into public.hr_docs (restaurant_id, kind, member_id, status) select restaurant_id, 'request', (select id::text from public.memberships where name = 'B' limit 1), 'pending' from public.hr_docs where kind = 'ack' limit 1; exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'member can file a request for someone else'; end if;
  update public.hr_docs set status = 'approved' where kind = 'request';
  if exists (select 1 from public.hr_docs where kind = 'request' and status = 'approved') then raise exception 'member approved own request'; end if;
  update public.hr_docs set data = '{"x":1}' where kind = 'warning';
  if exists (select 1 from public.hr_docs where kind = 'warning' and data ? 'x') then raise exception 'member edited a warning'; end if;
  delete from public.hr_docs where kind = 'ack';
  if not exists (select 1 from public.hr_docs where kind = 'ack') then raise exception 'member deleted a row'; end if;
end $$;
reset role;
-- anon has nothing
set role anon;
do $$ declare ok boolean := false; begin
  begin perform count(*) from public.hr_docs; exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'anon can read hr_docs'; end if;
end $$;
reset role;
do $$ begin if not exists (select 1 from public.change_log where table_name = 'hr_docs') then raise exception 'hr_docs not in the journal'; end if; end $$;
\echo HR_DOCS_DB_TESTS_PASSED
