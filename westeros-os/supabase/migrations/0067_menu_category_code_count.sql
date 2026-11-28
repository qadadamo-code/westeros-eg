-- فئات المنيو بمدى أكواد (Saqr 2026-11-28): الفئة بتتعرف من المنيو ببداية الكود وعدد الأصناف.
-- عمود جديد فاضي بس: الفئات الموجودة بتفضل على نطاق الـ 1000 القديم لحد ما حد يعدلها، فالبيانات ما بتتغيرش.
alter table public.menu_categories
  add column if not exists code_count int check (code_count is null or code_count > 0);
