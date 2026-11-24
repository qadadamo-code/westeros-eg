-- (Saqr 2026-11-24) منيو منفصل بالكامل لكل فرع: كل فئة وصنف ومجموعة خيارات بتتبع فرع. عمود جديد فاضي،
-- والصفوف الموجودة (من غير فرع) بتفضل منيو الفرع الرئيسي زي ما هي، فالبيانات الموجودة ما بتتغيرش.
alter table public.menu_categories add column if not exists branch_id uuid references public.branches(id) on delete set null;
alter table public.menu_items      add column if not exists branch_id uuid references public.branches(id) on delete set null;
alter table public.modifier_groups add column if not exists branch_id uuid references public.branches(id) on delete set null;
create index if not exists menu_categories_branch_idx on public.menu_categories (restaurant_id, branch_id);
create index if not exists menu_items_branch_idx      on public.menu_items (restaurant_id, branch_id);
create index if not exists modifier_groups_branch_idx on public.modifier_groups (restaurant_id, branch_id);
