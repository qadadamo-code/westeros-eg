-- Manufactured product categories named as the restaurant names its production lists:
-- صوص بارد، صوص ساخن، اخرى، الدجاج، اللحم، التتبيلات. Only category names: no products, meat cuts, weights or chefs.
-- A category is renamed only while it still carries its starting name; "اخرى" is added if no category has that name.

update public.mfg_settings s
set product_categories = (
  select jsonb_agg(
           case
             when c ->> 'id' = 'cold_sauce'  and c -> 'name' ->> 'ar' = 'صوصات باردة' then jsonb_set(c, '{name,ar}', '"صوص بارد"')
             when c ->> 'id' = 'hot_sauce'   and c -> 'name' ->> 'ar' = 'صوصات ساخنة' then jsonb_set(c, '{name,ar}', '"صوص ساخن"')
             when c ->> 'id' = 'marinade'    and c -> 'name' ->> 'ar' = 'تتبيلة'       then jsonb_set(c, '{name,ar}', '"التتبيلات"')
             when c ->> 'id' = 'chicken'     and c -> 'name' ->> 'ar' = 'دجاج'         then jsonb_set(c, '{name,ar}', '"الدجاج"')
             when c ->> 'id' = 'beef_burger' and c -> 'name' ->> 'ar' = 'برجر لحم'     then jsonb_set(c, '{name,ar}', '"اللحم"')
             else c
           end order by ord)
         || case when exists (select 1 from jsonb_array_elements(s.product_categories) x where x -> 'name' ->> 'ar' in ('اخرى', 'أخرى') or x ->> 'id' = 'other')
                 then '[]'::jsonb
                 else jsonb_build_array(jsonb_build_object('id', 'other', 'name', jsonb_build_object('ar', 'اخرى', 'en', 'Other'),
                        'code', (select coalesce(max((x ->> 'code')::int), 0) + 1 from jsonb_array_elements(s.product_categories) x), 'burger', null))
            end
  from jsonb_array_elements(s.product_categories) with ordinality as e (c, ord))
from public.restaurants r
where r.slug = 'westeros' and s.restaurant_id = r.id and jsonb_typeof(s.product_categories) = 'array' and jsonb_array_length(s.product_categories) > 0;
