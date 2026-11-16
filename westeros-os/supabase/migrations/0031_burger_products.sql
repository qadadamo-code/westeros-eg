-- One burger run makes every burger product of its category (beef: one meat quantity with its net weight and fat;
-- chicken: minced chicken). The burger names added by 0028 started as "stored by weight": they become burger products,
-- counted in pieces. Only products nothing was built on: no batch made them and their stock item never moved.

do $$
declare
  rid uuid;
begin
  select id into rid from public.restaurants where slug = 'westeros';
  if rid is null then return; end if;

  create temporary table _burgers on commit drop as
  select p.id, p.stock_item_id
  from public.mfg_products p
  join public.mfg_settings s on s.restaurant_id = p.restaurant_id
  where p.restaurant_id = rid and p.method = 'weight' and p.lines = '[]'::jsonb
    and (exists (select 1 from jsonb_array_elements(s.product_categories) c where c ->> 'id' = p.category and c ->> 'burger' in ('beef', 'chicken'))
         or p.name ->> 'ar' in ('تشكن برجر 150جم', 'تشكن برجر 80جم'))
    and not exists (select 1 from public.mfg_batches b, jsonb_array_elements(b.outputs) o where b.restaurant_id = rid and o ->> 'productId' = p.id::text)
    and not exists (select 1 from public.stock_moves m where m.item_id = p.stock_item_id)
    and not exists (select 1 from public.stock_levels l where l.item_id = p.stock_item_id);

  update public.mfg_products p set method = 'burger', chicken_mode = null, unit = 'pc', mfg_unit = 'قطعة' from _burgers b where p.id = b.id;
  update public.stock_items i set base_unit = 'pc', count_unit = 'pc' from _burgers b where i.id = b.stock_item_id;
end $$;
