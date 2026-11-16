-- التتبيلات also lists "دجاج كوردن بلو" and "دجاج ناجيتس": they are products of their own there, not repeats of the ones under الدجاج.
-- Names and category only, coded with the next free codes of the category's range.

do $$
declare
  rid uuid;
  cats jsonb;
  lists jsonb;
  store uuid;
  cat jsonb;
  ord int;
  lo int;
  hi int;
  n int;
  srt int;
  nm text;
  cd text;
  item uuid;
begin
  select id into rid from public.restaurants where slug = 'westeros';
  if rid is null then return; end if;
  select s.product_categories, s.product_location_id, s.lists into cats, store, lists from public.mfg_settings s where s.restaurant_id = rid limit 1;
  if cats is null or jsonb_typeof(cats) <> 'array' then return; end if;
  select e.c, e.ord into cat, ord from jsonb_array_elements(cats) with ordinality as e (c, ord) where e.c -> 'name' ->> 'ar' = 'التتبيلات' limit 1;
  if cat is null then select e.c, e.ord into cat, ord from jsonb_array_elements(cats) with ordinality as e (c, ord) where e.c ->> 'id' = 'marinade' limit 1; end if;
  if cat is null then return; end if;
  -- the category's code range: the saved one, else its hundred in the order of the list
  lo := coalesce((lists -> 'codeRanges' -> 'product' -> (cat ->> 'id') ->> 'from')::int, (ord - 1) * 100 + 1);
  hi := lo + coalesce((lists -> 'codeRanges' -> 'product' -> (cat ->> 'id') ->> 'count')::int, 100) - 1;
  select coalesce((select l.id from public.storage_locations l where l.restaurant_id = rid and l.type = 'products' order by l.created_at limit 1), store) into store;
  select coalesce(max(sort), 0) into srt from public.mfg_products where restaurant_id = rid;

  foreach nm in array array['دجاج كوردن بلو', 'دجاج ناجيتس'] loop
    continue when exists (select 1 from public.mfg_products p where p.restaurant_id = rid and p.name ->> 'ar' = nm and p.category = cat ->> 'id');
    n := lo - 1;
    loop
      n := n + 1;
      cd := 'M' || lpad(n::text, 3, '0');
      exit when not exists (select 1 from public.stock_items s where s.restaurant_id = rid and s.sku = cd)
            and not exists (select 1 from public.mfg_products p where p.restaurant_id = rid and p.code = cd);
    end loop;
    continue when n > hi;
    srt := srt + 1;
    insert into public.stock_items (restaurant_id, name, sku, category, kind, base_unit, packs, count_unit, account, levels, branch_levels,
                                    supplier_ids, preferred_supplier_id, last_cost, default_location_ids, track_batches, shelf_life_days,
                                    vat_bp, yield_bp, allergens, active, note, market_key)
    values (rid, jsonb_build_object('ar', nm, 'en', nm), cd, 'prep', 'prep', 'g', '[]'::jsonb, 'kg', 'food', '{"min":0,"par":0,"max":0}'::jsonb, '{}'::jsonb,
            '{}', null, 0, case when store is null then '{}'::uuid[] else array[store] end, true, null, 0, 10000, '{}', true, 'منتج مصنع', null)
    returning id into item;
    insert into public.mfg_products (restaurant_id, code, name, category, category_code, method, chicken_mode, recipe_type, unit, portion_grams,
                                     storage_method, storage_temp, shelf_life_days, ingredients_text, lines, packaging, stock_item_id, active, sort, mfg_unit)
    values (rid, cd, jsonb_build_object('ar', nm, 'en', nm), cat ->> 'id', coalesce((cat ->> 'code')::int, 0), 'weight', null, 'main', 'kg', null,
            '', 'chilled', 0, '', '[]'::jsonb, '[]'::jsonb, item, true, srt, 'كيلو');
  end loop;
end $$;
