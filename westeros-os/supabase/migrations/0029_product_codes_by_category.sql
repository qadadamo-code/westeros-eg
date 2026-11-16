-- Product codes follow the code range of the product's category (ثوابت النظام: each category has بداية الكود and عدد الأصناف;
-- the starting ranges are one hundred per category, in the order of the list: 1–100, 101–200, …).
-- Only the product names added by 0028 are re-coded, and only while nothing was built on them:
-- no batch exists, no recipe line was written, and no category range was saved by the restaurant.

do $$
declare
  rid uuid;
  cats jsonb;
begin
  select id into rid from public.restaurants where slug = 'westeros';
  if rid is null then return; end if;
  select product_categories into cats from public.mfg_settings where restaurant_id = rid limit 1;
  if cats is null or jsonb_typeof(cats) <> 'array' then return; end if;
  if exists (select 1 from public.mfg_batches where restaurant_id = rid) then return; end if;
  if exists (select 1 from public.mfg_settings where restaurant_id = rid and lists -> 'codeRanges' -> 'product' is not null) then return; end if;
  if exists (select 1 from public.mfg_products where restaurant_id = rid and (code !~ '^M0[0-3][0-9]$' or lines <> '[]'::jsonb)) then return; end if;

  create temporary table _recode on commit drop as
  select p.id, p.stock_item_id,
         'M' || lpad(((c.ord - 1) * 100 + row_number() over (partition by p.category order by p.code))::text, 3, '0') as code
  from public.mfg_products p
  join (select e.c ->> 'id' as id, e.ord from jsonb_array_elements(cats) with ordinality as e (c, ord)) c on c.id = p.category
  where p.restaurant_id = rid;

  -- two steps so a new code never meets an old one on the way
  update public.mfg_products p set code = 'tmp-' || r.code from _recode r where p.id = r.id and p.code <> r.code;
  update public.stock_items s set sku = 'tmp-' || r.code from _recode r where s.id = r.stock_item_id and s.sku <> r.code;
  update public.mfg_products p set code = r.code from _recode r where p.id = r.id and p.code like 'tmp-%';
  update public.stock_items s set sku = r.code from _recode r where s.id = r.stock_item_id and s.sku like 'tmp-%';
end $$;
