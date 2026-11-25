-- محطة الطباعة (صقر 25-11-2026): any device (Windows, Android, iPhone) asks for a print; the restaurant's print-station
-- PC picks the job up and sends it by IP to the printer (receipts, kitchen tickets, expiry stickers).
-- A new, empty table: no existing row is changed. Jobs are short-lived (the station marks them done).
create table if not exists public.print_jobs (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  printer_id    text not null,
  kind          text not null check (kind in ('receipt','kitchen','sticker','test')),
  payload       jsonb not null default '{}',
  copies        int not null default 1 check (copies between 1 and 200),
  status        text not null default 'queued' check (status in ('queued','printing','done','failed')),
  error         text,
  created_by    uuid,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists print_jobs_queue on public.print_jobs (restaurant_id, status, created_at);

drop trigger if exists print_jobs_updated on public.print_jobs;
create trigger print_jobs_updated before update on public.print_jobs for each row execute function public.set_updated_at();
alter table public.print_jobs enable row level security;
revoke all on public.print_jobs from anon;
grant select, insert, update, delete on public.print_jobs to authenticated;

drop policy if exists print_jobs_select on public.print_jobs;
drop policy if exists print_jobs_insert on public.print_jobs;
drop policy if exists print_jobs_update on public.print_jobs;
drop policy if exists print_jobs_delete on public.print_jobs;
create policy print_jobs_select on public.print_jobs for select to authenticated using (public.is_member(restaurant_id));
create policy print_jobs_insert on public.print_jobs for insert to authenticated with check (public.is_member(restaurant_id));
create policy print_jobs_update on public.print_jobs for update to authenticated using (public.is_member(restaurant_id)) with check (public.is_member(restaurant_id));
create policy print_jobs_delete on public.print_jobs for delete to authenticated using (public.is_member(restaurant_id));

alter table public.print_jobs replica identity full;
do $$ begin
  begin
    alter publication supabase_realtime add table public.print_jobs;
  exception when duplicate_object then null; when undefined_object then null;
  end;
end $$;
