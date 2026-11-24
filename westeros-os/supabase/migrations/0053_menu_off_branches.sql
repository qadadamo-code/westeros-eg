-- (Saqr 2026-11-24) كل فرع له منيو خاص بيه: الفروع اللي الصنف مش متاح فيها. عمود جديد بقيمة افتراضية فاضية،
-- فكل الأصناف الموجودة بتفضل متاحة في كل الفروع زي ما هي، والبيانات ما بتتغيرش.
alter table public.menu_items
  add column if not exists off_branches jsonb not null default '[]'::jsonb;
