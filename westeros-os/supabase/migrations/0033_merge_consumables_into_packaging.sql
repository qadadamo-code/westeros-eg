-- The restaurant asked: the raw materials of "مستهلكات وأكواب" join the category "تغليف", and the old category goes.
-- Only the category of those raw materials changes: names, codes, prices and stock stay as they are.
-- "تغليف" keeps the code range its own items already sit in, so new packaging items continue from there.

do $$
declare
  rid uuid;
  old_cat constant text := 'مستهلكات وأكواب';
  new_cat constant text := 'تغليف';
  lo int;
begin
  select id into rid from public.restaurants where slug = 'westeros';
  if rid is null then return; end if;
  if not exists (select 1 from public.mfg_settings s where s.restaurant_id = rid and s.lists -> 'rawCategories' ? old_cat)
     and not exists (select 1 from public.stock_items i where i.restaurant_id = rid and i.kind = 'raw' and (i.note = old_cat or i.spec ->> 'category' = old_cat)) then
    return;
  end if;

  -- the range تغليف has today, taken before the merge
  select min(nullif(regexp_replace(i.sku, '\D', '', 'g'), '')::int) into lo
  from public.stock_items i
  where i.restaurant_id = rid and i.kind = 'raw' and coalesce(i.spec ->> 'category', i.note) = new_cat;
  -- its thousand: 24000 … 24999 (a first code like 10001 gives 10001 … 10999)
  if lo is not null and lo % 1000 <> 0 then lo := ((lo - 1) / 1000) * 1000 + 1; end if;

  update public.stock_items i
  set note = case when i.note = old_cat then new_cat else i.note end,
      spec = case when i.spec ->> 'category' = old_cat then jsonb_set(i.spec, '{category}', to_jsonb(new_cat)) else i.spec end
  where i.restaurant_id = rid and i.kind = 'raw' and (i.note = old_cat or i.spec ->> 'category' = old_cat);

  update public.mfg_settings s
  set lists = jsonb_set(
        jsonb_set(s.lists, '{rawCategories}',
          (select coalesce(jsonb_agg(c order by ord), '[]'::jsonb) from jsonb_array_elements(s.lists -> 'rawCategories') with ordinality as e (c, ord) where c #>> '{}' <> old_cat)
          || case when s.lists -> 'rawCategories' ? new_cat then '[]'::jsonb else jsonb_build_array(new_cat) end),
        '{codeRanges}',
        jsonb_set(coalesce(s.lists -> 'codeRanges', '{}'::jsonb), '{raw}',
          (coalesce(s.lists -> 'codeRanges' -> 'raw', '{}'::jsonb) - old_cat)
          || case when s.lists -> 'codeRanges' -> 'raw' ? new_cat or lo is null then '{}'::jsonb
                  else jsonb_build_object(new_cat, jsonb_build_object('from', lo, 'count', (lo / 1000 + 1) * 1000 - lo)) end))
  where s.restaurant_id = rid and jsonb_typeof(s.lists -> 'rawCategories') = 'array';
end $$;
