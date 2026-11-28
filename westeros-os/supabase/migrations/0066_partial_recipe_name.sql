-- تعريف اسماء الوصفات (صقر 28-11-2026): "التتبيلة" اسمها بقى "الوصفة الجزئية".
-- Changes only the saved name when it is still the old default "التتبيلة"; a name the restaurant typed itself stays.
update public.mfg_settings
set lists = jsonb_set(lists, '{recipeNames,marinade}', to_jsonb('الوصفة الجزئية'::text))
where lists -> 'recipeNames' ->> 'marinade' = 'التتبيلة';
