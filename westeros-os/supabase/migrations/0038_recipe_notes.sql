-- ملاحظات التصنيع: written with the recipe, shown in a standing-out colour when the product is manufactured.
alter table public.mfg_products add column if not exists mfg_notes text not null default '';
