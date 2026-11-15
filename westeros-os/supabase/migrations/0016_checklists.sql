-- Westeros OS — shift opening / closing checklists.
-- Requires 0015_production.sql.
--
--   tables   checklist_templates · checklist_runs
--
-- A checklist template is a department's daily list
-- (kitchen opening, cashier closing …); a run is that list on one business day in one branch, with who ticked each
-- task and when. JSON keys are camelCase like the TS shapes (src/data/productionTypes.ts).

create table if not exists public.checklist_templates (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  name          jsonb not null,                                    -- {ar, en}
  kind          text not null default 'opening' check (kind in ('opening','closing','other')),
  area          text not null default 'all' check (area in ('kitchen','cashier','floor','all')),
  roles         jsonb not null default '[]',                       -- roles that do it; [] = everyone
  items         jsonb not null default '[]',                       -- [{id, text:{ar,en}}]
  active        boolean not null default true,
  sort          int not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists checklist_templates_restaurant_idx on public.checklist_templates (restaurant_id, sort);

create table if not exists public.checklist_runs (
  id              uuid primary key default gen_random_uuid(),
  restaurant_id   uuid not null references public.restaurants (id) on delete cascade,
  branch_id       uuid not null references public.branches (id) on delete cascade,
  template_id     uuid not null references public.checklist_templates (id) on delete cascade,
  template_name   jsonb not null,
  kind            text not null,
  area            text not null,
  day             date not null,                                   -- business day in Cairo
  items           jsonb not null default '[]',                     -- [{taskId, text, doneBy, doneByName, doneAt, note}]
  started_by      uuid references public.memberships (id) on delete set null,
  started_by_name text not null default '',
  started_at      timestamptz not null default now(),
  completed_at    timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (branch_id, template_id, day)
);
create index if not exists checklist_runs_day_idx on public.checklist_runs (restaurant_id, day desc);

do $$
declare t text;
begin
  foreach t in array array['checklist_templates','checklist_runs'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_updated', t);
    execute format('create trigger %I before update on public.%I for each row execute function public.set_updated_at()', t || '_updated', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
  end loop;
end $$;

-- Everyone on the team reads the lists and ticks tasks; only managers edit the lists. A run is never deleted.
do $$
declare r record;
  team constant text := '{owner,admin,manager,cashier,waiter,chef,kitchen,delivery,accountant}';
begin
  for r in select * from (values
    ('checklist_templates', team, '{owner,admin,manager}', '{owner,admin,manager}', '{owner,admin,manager}'),
    ('checklist_runs',      team, team,                    team,                    null)
  ) as t(tbl, rd, ins, upd, del)
  loop
    execute format('drop policy if exists %I on public.%I', r.tbl || '_select', r.tbl);
    execute format('drop policy if exists %I on public.%I', r.tbl || '_insert', r.tbl);
    execute format('drop policy if exists %I on public.%I', r.tbl || '_update', r.tbl);
    execute format('drop policy if exists %I on public.%I', r.tbl || '_delete', r.tbl);
    execute format('create policy %I on public.%I for select to authenticated using (public.has_role(restaurant_id, %L))', r.tbl || '_select', r.tbl, r.rd);
    execute format('create policy %I on public.%I for insert to authenticated with check (public.has_role(restaurant_id, %L))', r.tbl || '_insert', r.tbl, r.ins);
    execute format('create policy %I on public.%I for update to authenticated using (public.has_role(restaurant_id, %L)) with check (public.has_role(restaurant_id, %L))', r.tbl || '_update', r.tbl, r.upd, r.upd);
    if r.del is not null then
      execute format('create policy %I on public.%I for delete to authenticated using (public.has_role(restaurant_id, %L))', r.tbl || '_delete', r.tbl, r.del);
    end if;
  end loop;
end $$;

alter table public.checklist_runs replica identity full;
alter publication supabase_realtime add table public.checklist_runs, public.checklist_templates;
