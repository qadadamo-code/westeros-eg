-- ═══════════════════════════ 0043 — الموارد البشرية (Cost Control version) ═══════════════════════════
-- Browser side: src/modules/cc/hr (management screens at /hr) and src/modules/cc/me (the employee's own page at /me).
-- One new table, nothing existing changes:
--   hr_docs   every HR record, one row each, told apart by kind: settings, file, department, job, grade, contract,
--             vacancy, candidate, onboarding, request, evaluation, course, progress, warning, ack, exit, payslip, note …
-- member_id is the employee (a membership id, kept as text like every id here: nothing deletes or cascades through it).
--
-- Who sees what:
--   the owner, admin, manager and accountant read and write everything (the screens narrow it per role);
--   every member reads their own rows (except management notes) and the shared lists (settings, departments, jobs, courses);
--   a member may add only their own requests (pending), training progress and acknowledgments, may update only their own
--   training progress, and may cancel their own request while it is still pending.

create table if not exists public.hr_docs (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  kind          text not null,
  code          text not null default '',
  name          text not null default '',
  member_id     text,
  branch_id     text,
  status        text not null default 'active',
  date          text,                                     -- "YYYY-MM-DD" or null
  data          jsonb not null default '{}',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists hr_docs_kind on public.hr_docs (restaurant_id, kind);
create index if not exists hr_docs_member on public.hr_docs (restaurant_id, member_id);

drop trigger if exists hr_docs_updated on public.hr_docs;
create trigger hr_docs_updated before update on public.hr_docs for each row execute function public.set_updated_at();
alter table public.hr_docs enable row level security;
revoke all on public.hr_docs from anon;
grant select, insert, update, delete on public.hr_docs to authenticated;

drop policy if exists hr_docs_select on public.hr_docs;
drop policy if exists hr_docs_insert on public.hr_docs;
drop policy if exists hr_docs_update on public.hr_docs;
drop policy if exists hr_docs_delete on public.hr_docs;

create policy hr_docs_select on public.hr_docs for select to authenticated using (
  public.has_role(restaurant_id, '{owner,admin,manager,accountant}')
  or (kind in ('settings', 'department', 'job', 'grade', 'course') and exists (select 1 from public.my_membership_ids(restaurant_id)))
  or (kind <> 'note' and member_id in (select x::text from public.my_membership_ids(restaurant_id) x))
);
create policy hr_docs_insert on public.hr_docs for insert to authenticated with check (
  public.has_role(restaurant_id, '{owner,admin,manager,accountant}')
  or (member_id in (select x::text from public.my_membership_ids(restaurant_id) x)
      and ((kind = 'request' and status = 'pending') or kind in ('progress', 'ack')))
);
create policy hr_docs_update on public.hr_docs for update to authenticated using (
  public.has_role(restaurant_id, '{owner,admin,manager,accountant}')
  or (member_id in (select x::text from public.my_membership_ids(restaurant_id) x) and (kind = 'progress' or (kind = 'request' and status = 'pending')))
) with check (
  public.has_role(restaurant_id, '{owner,admin,manager,accountant}')
  or (member_id in (select x::text from public.my_membership_ids(restaurant_id) x) and (kind = 'progress' or (kind = 'request' and status in ('pending', 'cancelled'))))
);
create policy hr_docs_delete on public.hr_docs for delete to authenticated using (public.has_role(restaurant_id, '{owner,admin,manager,accountant}'));

alter table public.hr_docs replica identity full;
do $$ begin
  alter publication supabase_realtime add table public.hr_docs;
exception when others then null;
end $$;

-- keep the new table in the history journal (السجل والاسترجاع)
select public.track_changes();
