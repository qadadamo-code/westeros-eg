-- محطة الطباعة في الخلفية (صقر 25-11-2026): the station program prints by itself, with no screen open.
-- The device that asks for a print draws it (receipts, stickers) and saves the printer bytes in the job; an open cashier
-- screen draws the kitchen tickets. The station program (Windows or Android) picks jobs up with its own station key,
-- through the two functions below, and sends the bytes to the printer's IP.
-- Only new columns, a new table and new functions: no existing row is changed.

alter table public.print_jobs add column if not exists branch_id uuid;
alter table public.print_jobs add column if not exists data jsonb;
alter table public.print_jobs add column if not exists dedupe text;
create unique index if not exists print_jobs_dedupe on public.print_jobs (restaurant_id, dedupe) where dedupe is not null;
create index if not exists print_jobs_branch_queue on public.print_jobs (restaurant_id, branch_id, status, created_at);
alter table public.print_jobs drop constraint if exists print_jobs_status_check;
alter table public.print_jobs add constraint print_jobs_status_check check (status in ('queued','rendering','printing','done','failed'));

create table if not exists public.print_stations (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  branch_id     uuid,
  name          text not null default '',
  token_hash    text not null unique,
  os            text,
  last_seen     timestamptz,
  created_by    uuid,
  created_at    timestamptz not null default now()
);
alter table public.print_stations enable row level security;
revoke all on public.print_stations from anon;
grant select, delete on public.print_stations to authenticated;
drop policy if exists print_stations_select on public.print_stations;
drop policy if exists print_stations_delete on public.print_stations;
create policy print_stations_select on public.print_stations for select to authenticated using (public.is_member(restaurant_id));
create policy print_stations_delete on public.print_stations for delete to authenticated using (public.is_member(restaurant_id));

-- a member links this device as the branch's station: returns the station key (shown once, kept by the program)
create or replace function public.print_station_link(p_restaurant uuid, p_branch uuid, p_name text, p_os text)
returns text language plpgsql security definer set search_path = public as $$
declare k text;
begin
  if not public.is_member(p_restaurant) then raise exception 'not allowed'; end if;
  k := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  insert into public.print_stations (restaurant_id, branch_id, name, token_hash, os, created_by)
  values (p_restaurant, p_branch, coalesce(p_name, ''), encode(sha256(convert_to(k, 'UTF8')), 'hex'), p_os, auth.uid());
  return k;
end $$;
revoke all on function public.print_station_link(uuid, uuid, text, text) from public, anon;
grant execute on function public.print_station_link(uuid, uuid, text, text) to authenticated;

-- the station program: take the branch's ready jobs (bytes already drawn)
create or replace function public.print_station_claim(p_token text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare s public.print_stations; out jsonb;
begin
  select * into s from public.print_stations where token_hash = encode(sha256(convert_to(coalesce(p_token, ''), 'UTF8')), 'hex');
  if not found then raise exception 'unknown station'; end if;
  update public.print_stations set last_seen = now() where id = s.id;
  with picked as (
    select j.id from public.print_jobs j
    where j.restaurant_id = s.restaurant_id and j.branch_id is not distinct from s.branch_id and j.data is not null
      and (j.status = 'queued' or (j.status = 'printing' and j.updated_at < now() - interval '2 minutes'))
      and j.created_at > now() - interval '30 minutes'
    order by j.created_at limit 10
    for update skip locked
  ), upd as (
    update public.print_jobs j set status = 'printing' from picked where j.id = picked.id
    returning j.id, j.data, j.copies, j.kind, j.created_at
  )
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'data', data, 'copies', copies, 'kind', kind) order by created_at), '[]'::jsonb) into out from upd;
  return out;
end $$;
revoke all on function public.print_station_claim(text) from public;
grant execute on function public.print_station_claim(text) to anon, authenticated;

-- the station program: a job printed (or failed); the bytes are dropped
create or replace function public.print_station_done(p_token text, p_id uuid, p_error text)
returns void language plpgsql security definer set search_path = public as $$
declare s public.print_stations;
begin
  select * into s from public.print_stations where token_hash = encode(sha256(convert_to(coalesce(p_token, ''), 'UTF8')), 'hex');
  if not found then raise exception 'unknown station'; end if;
  update public.print_jobs set status = case when p_error is null or p_error = '' then 'done' else 'failed' end,
    error = nullif(left(coalesce(p_error, ''), 300), ''), data = null
  where id = p_id and restaurant_id = s.restaurant_id;
end $$;
revoke all on function public.print_station_done(text, uuid, text) from public;
grant execute on function public.print_station_done(text, uuid, text) to anon, authenticated;

-- an open cashier screen takes one kitchen ticket to draw (only one screen gets it)
create or replace function public.print_kitchen_claim(p_restaurant uuid, p_branch uuid, p_printer text, p_dedupe text)
returns uuid language plpgsql security definer set search_path = public as $$
declare jid uuid;
begin
  if not public.is_member(p_restaurant) then raise exception 'not allowed'; end if;
  insert into public.print_jobs (restaurant_id, branch_id, printer_id, kind, status, dedupe, created_by)
  values (p_restaurant, p_branch, p_printer, 'kitchen', 'rendering', p_dedupe, auth.uid())
  on conflict (restaurant_id, dedupe) where dedupe is not null do nothing
  returning id into jid;
  return jid;
end $$;
revoke all on function public.print_kitchen_claim(uuid, uuid, text, text) from public, anon;
grant execute on function public.print_kitchen_claim(uuid, uuid, text, text) to authenticated;

-- an open cashier screen takes a job a phone could not draw (iPhone)
create or replace function public.print_render_claim(p_id uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare n int;
begin
  update public.print_jobs set status = 'rendering'
  where id = p_id and status = 'queued' and data is null and public.is_member(restaurant_id);
  get diagnostics n = row_count;
  return n > 0;
end $$;
revoke all on function public.print_render_claim(uuid) from public, anon;
grant execute on function public.print_render_claim(uuid) to authenticated;
