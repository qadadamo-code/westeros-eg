-- الإضافات الجانبية في أصناف البيع (صقر 25-11-2026): the side options with a price get their components from the sheet's
-- "اضافة ..." items (Items tab), as a recipe owned by the side option (owner_type modifier, owner_id = side option id).
-- Double/Triple = one/two extra pieces. Only side options with no recipe yet; prices come from the system, not the sheet.
-- Each option's system cost is printed (SIDE| lines in the job log).

create or replace function pg_temp.nm(text) returns text language sql immutable as
$f$ select regexp_replace(lower(coalesce($1, '')), '[^a-z0-9]', '', 'g') $f$;

create temporary table _side (opt text, sheet text, pos int, ing text, raw text, unit text, qty numeric) on commit drop;
insert into _side values
    ('Double Beef (300gm)', 'اضافة قطعة بيف', 0, 'بيف برجر 150جم', '', 'قطعة', 1.0),
    ('Triple Beef (450gm)', 'اضافة قطعة بيف', 0, 'بيف برجر 150جم', '', 'قطعة', 2.0),
    ('Double Chicken (300gm)', 'اضافة قطعة تشكن', 0, 'تشكن برجر 150جم', '', 'قطعة', 1.0),
    ('Triple Chicken (450gm)', 'اضافة قطعة تشكن', 0, 'تشكن برجر 150جم', '', 'قطعة', 2.0),
    ('Double Crispy (2 Pieces)', 'اضافة قطعة كرسبي', 0, 'دجاج كرسبي', '', 'قطعة', 1.0),
    ('Double Crispy (2 Pieces)', 'اضافة قطعة كرسبي', 1, 'طحين', 'دقيق حبوبة 25 كيلو', 'كيلو', 0.1),
    ('Double Crispy (2 Pieces)', 'اضافة قطعة كرسبي', 2, 'زيت اولين', 'زيت حياه اولين افكو 20لتر', 'لتر', 0.03),
    ('Triple Crispy (3 Pieces)', 'اضافة قطعة كرسبي', 0, 'دجاج كرسبي', '', 'قطعة', 2.0),
    ('Triple Crispy (3 Pieces)', 'اضافة قطعة كرسبي', 1, 'طحين', 'دقيق حبوبة 25 كيلو', 'كيلو', 0.2),
    ('Triple Crispy (3 Pieces)', 'اضافة قطعة كرسبي', 2, 'زيت اولين', 'زيت حياه اولين افكو 20لتر', 'لتر', 0.06),
    ('Extra Grilled Chicken', 'اضافة قطعة ستيك', 0, 'دجاج ستيك', '', 'قطعة', 1.0),
    ('Add 2 Mozzarella Sticks', 'اضافة 2 اصبع موزريلا', 0, 'موزريلا ستيكس', 'اصابع موزريلا فرانكس', 'قطعة', 2.0),
    ('Add 2 Mozzarella Sticks', 'اضافة 2 اصبع موزريلا', 1, 'زيت اولين', 'زيت حياه اولين افكو 20لتر', 'لتر', 0.005),
    ('Add 2 Onion Rings', 'اضافة 2 حلقة بصل', 0, 'حلقات بصل', 'حلقات بصل كرسبي فود لافر', 'قطعة', 2.0),
    ('Add 2 Onion Rings', 'اضافة 2 حلقة بصل', 1, 'زيت اولين', 'زيت حياه اولين افكو 20لتر', 'لتر', 0.005),
    ('Add Cheddar Sauce', 'اضافة صوص جبنة شيدر', 0, 'جبنة شيدر صوص', '', 'كيلو', 0.075),
    ('Add American Cheese Slice', 'اضافة شريحة جبنة امريكي', 0, 'جبنة شيدر امريكي', 'جبنة شيدر امريكي بلو ريفر', 'قطعة', 1.0),
    ('Extra Cheese', 'اضافة شريحة جبنة امريكي', 0, 'جبنة شيدر امريكي', 'جبنة شيدر امريكي بلو ريفر', 'قطعة', 1.0),
    ('Add Salami Slice', 'اضافة شريحة سلامي', 0, 'سلامي', 'سلامي روست', 'كيلو', 0.02),
    ('Add Jalapeno', 'اضافة هالبينو', 0, 'هالبينو', 'هالبينو شرائح انزو Enzo', 'كيلو', 0.03),
    ('Extra Jalapeno', 'اضافة هالبينو', 0, 'هالبينو', 'هالبينو شرائح انزو Enzo', 'كيلو', 0.03),
    ('Add Icecream Vanilla', 'اضافة ايسكريم فانيلا', 0, 'ايس كريم فانيلا', 'ايسكريم فانيلا جالون 2.2 كجم', 'كيلو', 0.03),
    ('Add Icecream Chocolate', 'اضافة ايسكريم شوكولاته', 0, 'ايس كريم شوكولاته', 'ايسكريم شوكولا جالون 2.2 كجم', 'كيلو', 0.03);

do $$
declare
  rid uuid;
  r record;
  oid uuid;
  ln jsonb;
begin
  select id into rid from public.restaurants where slug = 'westeros';
  if rid is null then return; end if;

  create temporary table _sres on commit drop as
  select s.*, st.id as stock_id, st.last_cost,
         case when s.unit in ('كيلو', 'لتر') and st.base_unit in ('g', 'ml') then 1000
              when s.unit = 'قطعة' and st.base_unit = 'pc' then 1
              when s.unit = 'قطعة' and st.base_unit = 'g' and coalesce(st.portion, 0) > 0 then st.portion
              else null end::numeric as factor
  from _side s
  left join lateral (
    select x.id, x.base_unit, x.last_cost, x.portion from (
      select 1 as k, i.id, i.base_unit, i.last_cost, null::numeric as portion from public.stock_items i
       where i.restaurant_id = rid and s.raw <> '' and i.name ->> 'ar' = s.raw
      union all
      select 2, i.id, i.base_unit, i.last_cost, p.portion_grams::numeric from public.mfg_products p join public.stock_items i on i.id = p.stock_item_id
       where p.restaurant_id = rid and p.name ->> 'ar' = s.ing
      union all
      select 3, i.id, i.base_unit, i.last_cost, null from public.stock_items i
       where i.restaurant_id = rid and i.name ->> 'ar' = s.ing
    ) x order by x.k limit 1
  ) st on true;

  for r in select opt, min(sheet) as sheet from _sres group by opt order by opt loop
    select (o ->> 'id')::uuid into oid
      from public.mfg_settings ms, jsonb_array_elements(coalesce(ms.lists -> 'sideOptions', '[]'::jsonb)) o
     where ms.restaurant_id = rid and pg_temp.nm(o ->> 'name') = pg_temp.nm(r.opt)
       and (o ->> 'id') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     limit 1;
    select coalesce(jsonb_agg(jsonb_build_object('itemId', g.stock_id, 'qty', g.q) order by g.p), '[]'::jsonb) into ln
      from (select stock_id, round(sum(qty * factor), 3) as q, min(pos) as p from _sres
             where opt = r.opt and stock_id is not null and factor is not null group by stock_id) g;
    if oid is null then
      raise notice 'SIDE|%|not found', r.opt;
    elsif exists (select 1 from public.recipes x where x.restaurant_id = rid and x.owner_type = 'modifier' and x.owner_id = oid and x.scope_item_id is null and x.lines <> '[]'::jsonb) then
      raise notice 'SIDE|%|has a recipe, left as it is', r.opt;
    elsif jsonb_array_length(ln) > 0 then
      update public.recipes set lines = ln, updated_at = now() where restaurant_id = rid and owner_type = 'modifier' and owner_id = oid and scope_item_id is null;
      if not found then
        insert into public.recipes (restaurant_id, owner_type, owner_id, scope_item_id, lines, yield_qty, method) values (rid, 'modifier', oid, null, ln, 1, '');
      end if;
      raise notice 'SIDE|%|%|cost=%|noprice=%', r.opt, r.sheet,
        (select round(coalesce(sum(qty * factor * last_cost), 0) / 100000, 2) from _sres where opt = r.opt and factor is not null),
        (select string_agg(ing, '،') from _sres where opt = r.opt and stock_id is not null and factor is not null and coalesce(last_cost, 0) = 0);
    end if;
  end loop;

  update public.stock_items set mfg = true
   where restaurant_id = rid and mfg = false and id in (select stock_id from _sres where stock_id is not null and factor is not null);
end $$;
