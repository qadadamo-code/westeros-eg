-- Mohammed, 2026-11-16: the fat of a meat burger comes from the manufactured product "دهن جاهز" (a sub-recipe product):
-- its price is the product's own cost and the quantity leaves the product's stock. The constant "الدهن في برجر اللحم"
-- now offers manufactured products, and this points it at the ready-fat product when there is exactly one such product.
-- Nothing else changes; the constant can still be changed from the constants screen.

update public.mfg_settings s
set raw_fat_item_id = p.stock_item_id
from public.restaurants r, public.mfg_products p
where r.slug = 'westeros' and s.restaurant_id = r.id and p.restaurant_id = r.id
  and p.active and p.name ->> 'ar' like 'دهن جاهز%'
  and (select count(*) from public.mfg_products x where x.restaurant_id = r.id and x.active and x.name ->> 'ar' like 'دهن جاهز%') = 1
  and s.raw_fat_item_id is distinct from p.stock_item_id;
