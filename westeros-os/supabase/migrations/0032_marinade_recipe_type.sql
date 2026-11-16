-- The products of the التتبيلات category are marinades: their recipe type starts as تتبيلة, so they enter main and sub
-- recipes and never a sale item. Only products that have no recipe yet and still carry the starting type.

update public.mfg_products p
set recipe_type = 'marinade'
from public.restaurants r, public.mfg_settings s
where r.slug = 'westeros' and p.restaurant_id = r.id and s.restaurant_id = r.id
  and p.recipe_type = 'main' and p.lines = '[]'::jsonb
  and exists (select 1 from jsonb_array_elements(s.product_categories) c where c ->> 'id' = p.category and (c -> 'name' ->> 'ar' = 'التتبيلات' or c ->> 'id' = 'marinade'))
  and not exists (select 1 from public.mfg_batches b, jsonb_array_elements(b.outputs) o where b.restaurant_id = r.id and o ->> 'productId' = p.id::text);
