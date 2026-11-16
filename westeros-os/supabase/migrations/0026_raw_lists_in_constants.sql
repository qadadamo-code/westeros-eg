-- The constants are the source of raw material categories and storage units.
-- Every category and storage unit the raw materials already use is defined in mfg_settings.lists; nothing is removed.

update public.mfg_settings s
set lists = coalesce(s.lists, '{}'::jsonb) || jsonb_build_object(
  'rawCategories', (
    select coalesce(jsonb_agg(v order by ord), '[]'::jsonb) from (
      select v, min(ord) as ord from (
        select x.v, x.ord::numeric as ord from jsonb_array_elements_text(coalesce(s.lists -> 'rawCategories', '[]'::jsonb)) with ordinality as x (v, ord)
        union all
        select u.v, 1000 + u.ord from (
          select coalesce(nullif(i.spec ->> 'category', ''), nullif(i.note, '')) as v, min(row_number) as ord
          from (select *, row_number() over (order by sku) from public.stock_items where restaurant_id = s.restaurant_id and kind = 'raw') i
          group by 1) u
      ) a where v is not null and v <> '' group by v) b),
  'storageUnits', (
    select coalesce(jsonb_agg(v order by ord), '[]'::jsonb) from (
      select v, min(ord) as ord from (
        select x.v, x.ord::numeric as ord from jsonb_array_elements_text(coalesce(s.lists -> 'storageUnits', '["كيلو","لتر","قطعة","كرتونة","جالون","بالة"]'::jsonb)) with ordinality as x (v, ord)
        union all
        select u.v, 1000 + u.ord from (
          select coalesce(nullif(i.spec ->> 'storageUnit', ''), i.packs -> 0 -> 'name' ->> 'ar') as v, min(row_number) as ord
          from (select *, row_number() over (order by sku) from public.stock_items where restaurant_id = s.restaurant_id and kind = 'raw') i
          group by 1) u
      ) a where v is not null and v <> '' group by v) b))
from public.restaurants r
where r.slug = 'westeros' and s.restaurant_id = r.id;
