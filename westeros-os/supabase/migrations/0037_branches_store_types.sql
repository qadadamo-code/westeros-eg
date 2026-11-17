-- المخازن والفروع: branches get a code, a map link, a manager and the central-kitchen mark; a product names the warehouse type it is stored in;
-- a supply request names the branch that asks. Only new nullable columns: no existing row changes.
alter table public.branches
  add column if not exists code       int,
  add column if not exists map_url    text not null default '',
  add column if not exists manager_id uuid,
  -- مطبخ مركزي: the warehouses of this branch are where a manufactured batch is stored
  add column if not exists is_central boolean not null default false;

-- نوع المخزن of a manufactured product: cold | freezer | dry | supplies (null = read from storage_temp)
alter table public.mfg_products add column if not exists store_type text;

-- طلب توريد: the branch that asks (older requests name a branch warehouse in branch_location_id)
alter table public.stock_requests add column if not exists branch_id uuid;
