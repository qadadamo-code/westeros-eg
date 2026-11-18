-- الحسابات (Cost Control version): chart of accounts, journal, cost centres, finance settings and the documents
-- around them (suppliers, purchase invoices, fixed assets, budgets, sales days, payrolls …).
-- Only new tables: no existing table, column or row is changed. The backup system's accounting tables
-- (gl_accounts, ledger_entries …) stay as they are.
--
--   fin_accounts      شجرة الحسابات: one row per account, the parent is named by its code
--   fin_entries       القيود: header and lines (jsonb) in one row; a posted entry is undone by a reversal entry
--   fin_cost_centres  مراكز التكلفة
--   fin_settings      one row per restaurant: financial year, periods, account links, costing method
--   fin_docs          everything else, one row each, told apart by kind
--
-- Ids that point at a branch, a user or another entry are kept as text: nothing here deletes or cascades through them.

create table if not exists public.fin_accounts (
  id             uuid primary key default gen_random_uuid(),
  restaurant_id  uuid not null references public.restaurants (id) on delete cascade,
  code           text not null,
  name           jsonb not null default '{"ar":"","en":""}',
  parent_code    text,
  type           text not null check (type in ('asset', 'liability', 'equity', 'revenue', 'cogs', 'expense')),
  postable       boolean not null default true,
  kind           text not null default 'general',
  cashflow       text,
  branch_id      text,
  require_centre boolean not null default false,
  allow_manual   boolean not null default true,
  system         text,
  link_type      text,
  link_id        text,
  alert_min      numeric,
  alert_max      numeric,
  active         boolean not null default true,
  note           text not null default '',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create unique index if not exists fin_accounts_code on public.fin_accounts (restaurant_id, code);

create table if not exists public.fin_entries (
  id              uuid primary key default gen_random_uuid(),
  restaurant_id   uuid not null references public.restaurants (id) on delete cascade,
  no              int not null default 0,                    -- serial inside the year; 0 while a draft
  year            int not null default 0,
  date            date not null,
  kind            text not null default 'manual',
  status          text not null default 'draft' check (status in ('draft', 'pending', 'posted', 'rejected')),
  memo            text not null default '',
  lines           jsonb not null default '[]',               -- [{account (id), debit, credit, memo, centreId, branchId}]
  branch_id       text,
  source_type     text,
  source_id       text,
  reverses        text,
  reversed_by     text,
  attachments     jsonb not null default '[]',
  created_by      text,
  created_by_name text not null default '',
  approved_by     text,
  posted_at       timestamptz,
  reason          text not null default '',
  meta            jsonb not null default '{}',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists fin_entries_date on public.fin_entries (restaurant_id, date);
-- two screens posting at the same moment never share an entry number
create unique index if not exists fin_entries_no on public.fin_entries (restaurant_id, year, no) where no > 0;
-- one live entry per source (a stock movement, an invoice, a voucher …), so nothing is booked twice
create unique index if not exists fin_entries_source on public.fin_entries (restaurant_id, source_type, source_id)
  where status = 'posted' and reversed_by is null and source_type is not null and source_id is not null
    and source_type <> 'opening-balance' and source_type not like 'reversal:%';

create table if not exists public.fin_cost_centres (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  code          text not null default '',
  name          jsonb not null default '{"ar":"","en":""}',
  parent_id     text,
  branch_id     text,
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists fin_cost_centres_idx on public.fin_cost_centres (restaurant_id);

create table if not exists public.fin_settings (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  data          jsonb not null default '{}',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create unique index if not exists fin_settings_one on public.fin_settings (restaurant_id);

create table if not exists public.fin_docs (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  kind          text not null,
  code          text not null default '',
  name          text not null default '',
  branch_id     text,
  status        text not null default 'active',
  date          text,                                     -- "YYYY-MM-DD" or null
  data          jsonb not null default '{}',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists fin_docs_kind on public.fin_docs (restaurant_id, kind);

-- Same rules on the five tables: the owner, managers and the accountant read and write; the kitchen sees nothing.
do $$
declare t text;
begin
  foreach t in array array['fin_accounts', 'fin_entries', 'fin_cost_centres', 'fin_settings', 'fin_docs'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_updated', t);
    execute format('create trigger %I before update on public.%I for each row execute function public.set_updated_at()', t || '_updated', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format('drop policy if exists %I on public.%I', t || '_insert', t);
    execute format('drop policy if exists %I on public.%I', t || '_update', t);
    execute format('drop policy if exists %I on public.%I', t || '_delete', t);
    execute format('create policy %I on public.%I for select to authenticated using (public.has_role(restaurant_id, %L))', t || '_select', t, '{owner,admin,manager,accountant}');
    execute format('create policy %I on public.%I for insert to authenticated with check (public.has_role(restaurant_id, %L))', t || '_insert', t, '{owner,admin,manager,accountant}');
    execute format('create policy %I on public.%I for update to authenticated using (public.has_role(restaurant_id, %L)) with check (public.has_role(restaurant_id, %L))', t || '_update', t, '{owner,admin,manager,accountant}', '{owner,admin,manager,accountant}');
    execute format('create policy %I on public.%I for delete to authenticated using (public.has_role(restaurant_id, %L))', t || '_delete', t, '{owner,admin,manager,accountant}');
    execute format('alter table public.%I replica identity full', t);
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when others then null;
    end;
  end loop;
end $$;

-- keep the new tables in the history journal (السجل والاسترجاع)
select public.track_changes();
