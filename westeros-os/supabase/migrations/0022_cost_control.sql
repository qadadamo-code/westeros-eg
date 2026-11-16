-- Cost Control version: the fields and the one table the "Cost Control System" document asks for and the first
-- schema did not have. Only additions: no existing column or row is changed.
--
--   storage_locations  + code, address, map_url, type, keeper_id            (2.1 المخازن)
--   stock_items        + spec                                               (3.1 مواد الخام)
--   mfg_products       + image_url, mfg_unit, storage_qty                   (3.2 المنتجات المصنعة)
--   mfg_settings       + lists                                              (4 ثوابت النظام)
--   stock_requests     new: purchase requests and branch supply requests    (2.4, 2.5)

alter table public.storage_locations
  add column if not exists code      int,
  add column if not exists address   text not null default '',
  add column if not exists map_url   text not null default '',
  add column if not exists type      text,
  add column if not exists keeper_id uuid;

alter table public.stock_items  add column if not exists spec jsonb;
alter table public.mfg_products add column if not exists image_url   text;
alter table public.mfg_products add column if not exists mfg_unit    text;
alter table public.mfg_products add column if not exists storage_qty numeric;
alter table public.mfg_settings add column if not exists lists jsonb;

create table if not exists public.stock_requests (
  id                 uuid primary key default gen_random_uuid(),
  restaurant_id      uuid not null references public.restaurants (id) on delete cascade,
  kind               text not null check (kind in ('purchase', 'supply')),
  number             int not null default 0,
  at                 timestamptz not null default now(),
  due_date           date,
  branch_location_id uuid,
  lines              jsonb not null default '[]',              -- [{itemId, name:{ar,en}, qty, unit}]
  keeper_id          uuid,
  keeper_name        text not null default '',
  status             text not null default 'in_progress' check (status in ('in_progress', 'done', 'rejected', 'postponed')),
  note               text not null default '',
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index if not exists stock_requests_idx on public.stock_requests (restaurant_id, kind, at desc);

drop trigger if exists stock_requests_updated on public.stock_requests;
create trigger stock_requests_updated before update on public.stock_requests for each row execute function public.set_updated_at();
alter table public.stock_requests enable row level security;
revoke all on public.stock_requests from anon;
grant select, insert, update, delete on public.stock_requests to authenticated;

drop policy if exists stock_requests_select on public.stock_requests;
drop policy if exists stock_requests_insert on public.stock_requests;
drop policy if exists stock_requests_update on public.stock_requests;
drop policy if exists stock_requests_delete on public.stock_requests;
create policy stock_requests_select on public.stock_requests for select to authenticated using (public.has_role(restaurant_id, '{owner,admin,manager,chef,kitchen,accountant}'));
create policy stock_requests_insert on public.stock_requests for insert to authenticated with check (public.has_role(restaurant_id, '{owner,admin,manager,chef,kitchen}'));
create policy stock_requests_update on public.stock_requests for update to authenticated using (public.has_role(restaurant_id, '{owner,admin,manager,chef,kitchen}')) with check (public.has_role(restaurant_id, '{owner,admin,manager,chef,kitchen}'));
create policy stock_requests_delete on public.stock_requests for delete to authenticated using (public.has_role(restaurant_id, '{owner,admin,manager}'));

alter table public.stock_requests replica identity full;
do $$ begin
  alter publication supabase_realtime add table public.stock_requests;
exception when others then null;
end $$;

-- keep the new table in the history journal
select public.track_changes();
