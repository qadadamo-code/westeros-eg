-- Westeros OS — central-kitchen manufacturing (التصنيع): the "Cost Control" document as tables.
-- Requires 0001 … 0012 (stock items, moves, lots).
--
--   tables   mfg_products · mfg_batches · mfg_settings
--
-- A batch (تشغيلة) is made by one chef (chef_id + a snapshot of the name and code), is numbered
-- <category code>-<DDMMYYYY>#<run of the day>(<chef code>), and keeps what went in (inputs) and what came out
-- (outputs, each with its unit cost and expiry). Its stock effect lives in stock_moves (production_out / production_in,
-- group_id = the batch id) and one stock_batches lot per output. Weights are kilograms, recipe quantities are in the
-- stock item's base unit (g, ml, pc), money is bigint units (0.00001 EGP), rates are basis points.
-- JSON keys are camelCase like the TS shapes (src/data/productionTypes.ts).

create table if not exists public.mfg_products (
  id               uuid primary key default gen_random_uuid(),
  restaurant_id    uuid not null references public.restaurants (id) on delete cascade,
  code             text not null,
  name             jsonb not null,                                  -- {ar, en}
  category         text not null check (category in ('cold_sauce','hot_sauce','other','chicken','beef_burger','chicken_burger','marinade','fat')),
  category_code    int not null check (category_code >= 0),
  method           text not null check (method in ('weight','portion','chicken','burger','fat')),
  chicken_mode     text check (chicken_mode is null or chicken_mode in ('weight','pre_count','post_count')),
  recipe_type      text not null default 'main' check (recipe_type in ('main','sub','marinade')),
  unit             text not null check (unit in ('kg','pc')),
  portion_grams    numeric(10,3) check (portion_grams is null or portion_grams > 0),
  storage_method   text not null default '',
  storage_temp     text not null default 'chilled' check (storage_temp in ('chilled','frozen','room')),
  shelf_life_days  int not null default 3 check (shelf_life_days >= 0),
  ingredients_text text not null default '',
  lines            jsonb not null default '[]',                     -- [{itemId, qty}] per meal, or per net kilo (chicken, burger)
  packaging        jsonb not null default '[]',
  stock_item_id    uuid not null references public.stock_items (id) on delete restrict,
  active           boolean not null default true,
  sort             int not null default 0,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (restaurant_id, code)
);
create index if not exists mfg_products_restaurant_idx on public.mfg_products (restaurant_id, sort);

create table if not exists public.mfg_batches (
  id               uuid primary key default gen_random_uuid(),
  restaurant_id    uuid not null references public.restaurants (id) on delete cascade,
  branch_id        uuid not null references public.branches (id) on delete cascade,
  location_id      uuid references public.storage_locations (id) on delete set null,
  number           text not null,
  seq              int not null check (seq > 0),
  method           text not null check (method in ('weight','portion','chicken','burger','fat')),
  category         text not null,
  category_code    int not null,
  made_at          timestamptz not null default now(),
  day              date not null,                                   -- business day in Cairo
  chef_id          uuid not null references public.memberships (id) on delete restrict,
  chef_name        text not null,
  chef_code        int not null,
  meals            numeric(10,3),
  main_item_id     uuid references public.stock_items (id) on delete set null,
  main_weight_kg   numeric(12,3),
  net_weight_kg    numeric(12,3),
  gross_weight_kg  numeric(12,3),
  fat_weight_kg    numeric(12,3),
  suggested_fat_kg numeric(12,3),
  meat_type_id     uuid,
  expected_count   int,
  waste            numeric(12,3),
  debris_kg        numeric(12,3),
  debris_bp        int,
  scale_diff_g     numeric(12,3),
  inputs           jsonb not null default '[]',
  outputs          jsonb not null default '[]',
  total_cost       bigint not null default 0,
  status           text not null default 'done' check (status in ('done','void')),
  voided_by        uuid references public.memberships (id) on delete set null,
  voided_at        timestamptz,
  void_reason      text not null default '',
  note             text not null default '',
  labels_printed   int not null default 0,
  move_group_id    uuid,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists mfg_batches_made_idx on public.mfg_batches (restaurant_id, branch_id, made_at desc);
create index if not exists mfg_batches_day_idx on public.mfg_batches (restaurant_id, day);
create index if not exists mfg_batches_chef_idx on public.mfg_batches (restaurant_id, chef_id, made_at desc);
create index if not exists mfg_batches_number_idx on public.mfg_batches (restaurant_id, number);

create table if not exists public.mfg_settings (
  id                     uuid primary key default gen_random_uuid(),
  restaurant_id          uuid not null unique references public.restaurants (id) on delete cascade,
  chef_codes             jsonb not null default '{}',               -- {membershipId: code}
  meat_types             jsonb not null default '[]',               -- [{id, name, stockItemId, fatGramsPerKg}]
  storage_methods        jsonb not null default '[]',
  chicken_item_id        uuid references public.stock_items (id) on delete set null,
  raw_fat_item_id        uuid references public.stock_items (id) on delete set null,
  burger_fat_item_id     uuid references public.stock_items (id) on delete set null,
  minced_chicken_item_id uuid references public.stock_items (id) on delete set null,
  product_location_id    uuid references public.storage_locations (id) on delete set null,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

-- ───────────────────────────── triggers + RLS ─────────────────────────────
do $$
declare t text;
begin
  foreach t in array array['mfg_products','mfg_batches','mfg_settings'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_updated', t);
    execute format('create trigger %I before update on public.%I for each row execute function public.set_updated_at()', t || '_updated', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
  end loop;
end $$;

-- A batch is never deleted (voiding keeps the number and the history).
do $$
declare r record;
begin
  for r in select * from (values
    ('mfg_products', '{owner,admin,manager,chef,kitchen,accountant}', '{owner,admin,manager,chef}',         '{owner,admin,manager,chef}',         '{owner,admin}'),
    ('mfg_batches',  '{owner,admin,manager,chef,kitchen,accountant}', '{owner,admin,manager,chef,kitchen}', '{owner,admin,manager,chef,kitchen}', null),
    ('mfg_settings', '{owner,admin,manager,chef,kitchen,accountant}', '{owner,admin,manager,chef}',         '{owner,admin,manager,chef,kitchen}', null)
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

-- Kitchen staff record batches too: they write the product's lot and its last production cost.
drop policy if exists stock_batches_insert_kitchen on public.stock_batches;
create policy stock_batches_insert_kitchen on public.stock_batches for insert to authenticated with check (public.has_role(restaurant_id, '{kitchen}'));
drop policy if exists stock_batches_update_kitchen on public.stock_batches;
create policy stock_batches_update_kitchen on public.stock_batches for update to authenticated using (public.has_role(restaurant_id, '{kitchen}')) with check (public.has_role(restaurant_id, '{kitchen}'));
drop policy if exists stock_items_update_kitchen on public.stock_items;
create policy stock_items_update_kitchen on public.stock_items for update to authenticated using (public.has_role(restaurant_id, '{kitchen}')) with check (public.has_role(restaurant_id, '{kitchen}'));

alter table public.mfg_batches replica identity full;
alter publication supabase_realtime add table public.mfg_batches, public.mfg_products;
