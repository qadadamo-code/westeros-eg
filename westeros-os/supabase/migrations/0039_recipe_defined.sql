-- تعريف وصفة بدون مكونات: a recipe may be saved with no ingredients, so "has a recipe" is its own mark.
-- Products that already have ingredients are marked; nothing else changes.
alter table public.mfg_products add column if not exists recipe_defined boolean not null default false;
update public.mfg_products set recipe_defined = true where jsonb_array_length(coalesce(lines, '[]'::jsonb)) > 0 and not recipe_defined;
