-- Delivery areas: the six sample zones of the first seed (central Cairo) are replaced by the areas and fees the
-- restaurant publishes on its own ordering page, and the kitchen pin moves to the restaurant's location in Nasr City.
-- Only untouched sample rows are removed (matched by their original slug and name); zones added by hand stay.

do $$
declare
  rid uuid;
begin
  select id into rid from public.restaurants where slug = 'westeros';
  if rid is null then return; end if;

  delete from public.delivery_zones z
   where z.restaurant_id = rid
     and (z.slug, z.name ->> 'en') in (('zamalek', 'Zamalek'), ('garden-city', 'Garden City'), ('downtown', 'Downtown'), ('agouza', 'Agouza'), ('mohandessin', 'Mohandessin'), ('dokki', 'Dokki'));

  insert into public.delivery_zones (restaurant_id, slug, name, fee, min_order, free_over, eta_min, eta_max, geometry, hours, color, sort, active)
  select rid, v.slug, jsonb_build_object('ar', v.name, 'en', v.name), v.fee::bigint * 100000, 0, null, v.eta, v.eta, null, null, v.color, v.sort, true
  from (values
    ('area-01', 'جنينة مول', 35, 30, '#0d5a53', 1),
    ('area-02', 'مكرم عبيد', 40, 35, '#0d5a53', 2),
    ('area-03', 'عباس العقاد', 40, 30, '#0d5a53', 3),
    ('area-04', 'حديقة الطفل', 40, 30, '#0d5a53', 4),
    ('area-05', 'حسن المأمون', 45, 30, '#0d5a53', 5),
    ('area-06', 'الحديقة الدولية', 40, 30, '#0d5a53', 6),
    ('area-07', 'شارع الطاقة', 60, 30, '#0d5a53', 7),
    ('area-08', 'السراج مول', 45, 30, '#0d5a53', 8),
    ('area-09', 'شارع الطيران', 45, 35, '#0d5a53', 9),
    ('area-10', 'يوسف عباس', 45, 30, '#0d5a53', 10),
    ('area-11', 'ذاكر حسين', 45, 30, '#0d5a53', 11),
    ('area-12', 'شارع أحمد الزمر', 60, 30, '#0d5a53', 12),
    ('area-13', 'امتداد رمسيس', 60, 30, '#0d5a53', 13),
    ('area-14', 'مساكن الشروق', 60, 30, '#0d5a53', 14),
    ('area-15', 'مصطفى النحاس', 45, 30, '#0d5a53', 15),
    ('area-16', 'الوفاء والأمل', 60, 30, '#0d5a53', 16),
    ('area-17', 'سيتي ستارز', 50, 30, '#0d5a53', 17),
    ('area-18', 'زهراء مدينة نصر', 65, 30, '#0d5a53', 18),
    ('area-19', 'نادي السكة الحديد', 60, 30, '#0d5a53', 19),
    ('area-20', 'الحي العاشر والواحة', 60, 30, '#0d5a53', 20),
    ('area-21', 'شارع حسن شريف', 60, 30, '#0d5a53', 21),
    ('area-22', 'امتداد مصطفى النحاس بعد المنهل', 60, 60, '#0d5a53', 22),
    ('area-23', 'حي السفارات', 50, 30, '#0d5a53', 23),
    ('area-24', 'أرض الجولف', 50, 30, '#6b4fa0', 24),
    ('area-25', 'شارع ألماظة', 60, 30, '#6b4fa0', 25),
    ('area-26', 'مصر الجديدة', 60, 30, '#6b4fa0', 26),
    ('area-27', 'شيراتون', 70, 40, '#a8700c', 27),
    ('area-28', 'النزهة الجديدة', 80, 60, '#2f6f9f', 28),
    ('area-29', 'ميدان ألف مسكن', 70, 60, '#2f6f9f', 29),
    ('area-30', 'جاردينيا سيتي', 75, 60, '#b4531f', 30),
    ('area-31', 'تاج سلطان', 75, 60, '#b4531f', 31),
    ('area-32', 'العباسية', 80, 60, '#1d7f4a', 32),
    ('area-33', 'الحدائق', 80, 60, '#1d7f4a', 33)
  ) as v (slug, name, fee, eta, color, sort)
  on conflict (restaurant_id, slug) do nothing;

  -- the kitchen door, only where it still is the sample one
  update public.settings s
     set delivery = jsonb_set(s.delivery, '{origin}', '{"lat":30.0604725,"lng":31.3335067}'::jsonb)
   where s.restaurant_id = rid
     and s.delivery -> 'origin' ->> 'lat' = '30.0626' and s.delivery -> 'origin' ->> 'lng' = '31.2179';
end $$;
