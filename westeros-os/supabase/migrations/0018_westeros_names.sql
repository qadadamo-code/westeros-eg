-- Names and phone numbers left over from the base seed that do not belong to Westeros. Each line only touches a
-- row that still holds the seeded value, so anything the restaurant has already edited stays as it is.

update public.loyalty_programs p
   set name = '{"ar":"نادي وستروس","en":"Westeros Club"}'::jsonb
 where p.restaurant_id in (select id from public.restaurants where slug = 'westeros')
   and p.name ->> 'en' = 'Sufra Club';

update public.cost_centres c
   set name = '{"ar":"فرع مدينة نصر","en":"Nasr City branch"}'::jsonb
 where c.restaurant_id in (select id from public.restaurants where slug = 'westeros')
   and c.name ->> 'en' = 'Zamalek branch';

update public.ops_settings s
   set hotline_phone = ''
 where s.restaurant_id in (select id from public.restaurants where slug = 'westeros')
   and s.hotline_phone = '0227350000';

update public.ops_settings s
   set whatsapp_phone = ''
 where s.restaurant_id in (select id from public.restaurants where slug = 'westeros')
   and s.whatsapp_phone = '01005550103';
