-- Manufactured product NAMES under the six production lists the restaurant asked for:
-- صوص بارد، صوص ساخن، اخرى، الدجاج، اللحم، التتبيلات. Names and category only:
-- no recipes, no prices, no portion weights, no meat cuts, no chefs. Every other field starts empty and is filled from the screen.
-- A name that already exists as a product is left as it is. Two names listed twice (دجاج كوردن بلو، دجاج ناجيتس) enter once, under الدجاج.

do $$
declare
  rid uuid;
  cats jsonb;
  store uuid;
  n int;
  srt int;
  v record;
  cat jsonb;
  item uuid;
  cd text;
begin
  select id into rid from public.restaurants where slug = 'westeros';
  if rid is null then return; end if;
  select product_categories, product_location_id into cats, store from public.mfg_settings where restaurant_id = rid limit 1;
  if cats is null or jsonb_typeof(cats) <> 'array' then return; end if;
  select coalesce((select l.id from public.storage_locations l where l.restaurant_id = rid and l.type = 'products' order by l.created_at limit 1), store) into store;
  select coalesce(max(nullif(regexp_replace(code, '\D', '', 'g'), '')::int), 0), coalesce(max(sort), 0) into n, srt from public.mfg_products where restaurant_id = rid;

  for v in
    select * from (values
      (1, 'cold_sauce', 'صوص بارد', 'ستارك صوص'), (2, 'cold_sauce', 'صوص بارد', 'ويستروس صوص'), (3, 'cold_sauce', 'صوص بارد', 'ديناميت صوص'),
      (4, 'cold_sauce', 'صوص بارد', 'نوك اوت صوص'), (5, 'cold_sauce', 'صوص بارد', 'رانش صوص'), (6, 'cold_sauce', 'صوص بارد', 'جبنة شيدر صوص'), (7, 'cold_sauce', 'صوص بارد', 'سيزر صوص'),
      (8, 'hot_sauce', 'صوص ساخن', 'سموكي'), (9, 'hot_sauce', 'صوص ساخن', 'وايت مشروم'), (10, 'hot_sauce', 'صوص ساخن', 'براوني'),
      (11, 'other', 'اخرى', 'سلطة كول سلو'), (12, 'other', 'اخرى', 'سلطة ذرة بالمايونيز'), (13, 'other', 'اخرى', 'صوص سلطة فيتنس'), (14, 'other', 'اخرى', 'رز بالخضار'),
      (15, 'other', 'اخرى', 'كوردن بلو جاهز'), (16, 'other', 'اخرى', 'ناجيتس جاهز'), (17, 'other', 'اخرى', 'بيكاسو'), (18, 'other', 'اخرى', 'بيستو'), (19, 'other', 'اخرى', 'كاجون'), (20, 'other', 'اخرى', 'علبة ويستروس'),
      (21, 'chicken', 'الدجاج', 'دجاج كرسبي'), (22, 'chicken', 'الدجاج', 'دجاج ستيك'), (23, 'chicken', 'الدجاج', 'دجاج شاورما'), (24, 'chicken', 'الدجاج', 'دجاج كوردن بلو'),
      (25, 'chicken', 'الدجاج', 'دجاج ناجيتس'), (26, 'chicken', 'الدجاج', 'تشكن برجر 150جم'), (27, 'chicken', 'الدجاج', 'تشكن برجر 80جم'), (28, 'chicken', 'الدجاج', 'دجاج بايتس'), (29, 'chicken', 'الدجاج', 'دجاج فرم'),
      (30, 'beef_burger', 'اللحم', 'بيف برجر 150جم'), (31, 'beef_burger', 'اللحم', 'بيف برجر 80جم'),
      (32, 'marinade', 'التتبيلات', 'تتبيلة دجاج كرسبي'), (33, 'marinade', 'التتبيلات', 'تتبيلة دجاج ستيك'), (34, 'marinade', 'التتبيلات', 'تتبيلة تشكن برجر'),
      (35, 'marinade', 'التتبيلات', 'تتبيلة دجاج كوردن بلو'), (36, 'marinade', 'التتبيلات', 'تتبيلة دجاج ناجيتس')
    ) as t (ord, cat_id, cat_name, name) order by ord
  loop
    -- the category as the restaurant has it now: by its name, else by its starting id
    select c into cat from jsonb_array_elements(cats) c where c -> 'name' ->> 'ar' = v.cat_name limit 1;
    if cat is null then select c into cat from jsonb_array_elements(cats) c where c ->> 'id' = v.cat_id limit 1; end if;
    continue when cat is null;
    continue when exists (select 1 from public.mfg_products p where p.restaurant_id = rid and p.name ->> 'ar' = v.name);
    loop
      n := n + 1;
      cd := 'M' || lpad(n::text, 3, '0');
      exit when not exists (select 1 from public.stock_items s where s.restaurant_id = rid and s.sku = cd)
            and not exists (select 1 from public.mfg_products p where p.restaurant_id = rid and p.code = cd);
    end loop;
    srt := srt + 1;
    insert into public.stock_items (restaurant_id, name, sku, category, kind, base_unit, packs, count_unit, account, levels, branch_levels,
                                    supplier_ids, preferred_supplier_id, last_cost, default_location_ids, track_batches, shelf_life_days,
                                    vat_bp, yield_bp, allergens, active, note, market_key)
    values (rid, jsonb_build_object('ar', v.name, 'en', v.name), cd, 'prep', 'prep', 'g', '[]'::jsonb, 'kg', 'food', '{"min":0,"par":0,"max":0}'::jsonb, '{}'::jsonb,
            '{}', null, 0, case when store is null then '{}'::uuid[] else array[store] end, true, null, 0, 10000, '{}', true, 'منتج مصنع', null)
    returning id into item;
    insert into public.mfg_products (restaurant_id, code, name, category, category_code, method, chicken_mode, recipe_type, unit, portion_grams,
                                     storage_method, storage_temp, shelf_life_days, ingredients_text, lines, packaging, stock_item_id, active, sort, mfg_unit)
    values (rid, cd, jsonb_build_object('ar', v.name, 'en', v.name), cat ->> 'id', coalesce((cat ->> 'code')::int, 0), 'weight', null, 'main', 'kg', null,
            '', 'chilled', 0, '', '[]'::jsonb, '[]'::jsonb, item, true, srt, 'كيلو');
  end loop;
end $$;
