-- The restaurant asked for the raw materials to appear when a recipe is defined. The raw materials taken from the old
-- sheet were warehouse-only (mfg = false), so recipes showed none of them. They now enter recipes and manufacturing.
-- Only that switch changes; it stays a switch on each raw material (قائمة المنتجات والخامات > مواد الخام).

update public.stock_items i
set mfg = true
from public.restaurants r
where r.slug = 'westeros' and i.restaurant_id = r.id and i.kind = 'raw' and i.mfg = false;
