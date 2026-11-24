-- (Saqr 2026-11-24, بطلبه "اه شيلها") نسخ المنيو الأول (قبل ما يصير "تحديث المنيو") عمل أصناف مكررة في منيو الفرع.
-- بنشيل التكرار بس: جوه منيو كل فرع (الصفوف اللي ليها فرع بس، يعني اللي اتعملت بالنسخ النهارده)، الصنف بنفس الكود
-- (أو نفس الاسم لو مالوش كود) بيفضل منه أول واحد، والباقي بيتشال لو ما اتباعش في أي طلب. الفئات المكررة بنفس الاسم
-- أصنافها بتتنقل لأول فئة وبعدين بتتشال، ومجموعات الإضافات اللي ما بقاش أي صنف بيستخدمها بتتشال بإضافاتها.
-- منيو الفرع الرئيسي (الصفوف من غير فرع) ما بيتلمسش. كل حذف بيتسجل في السجل والاسترجاع.

-- 1) الأصناف المكررة
with ranked as (
  select id, row_number() over (
           partition by restaurant_id, branch_id, coalesce(nullif(btrim(sku), ''), lower(btrim(name->>'ar')))
           order by created_at, id) as rn
  from public.menu_items
  where branch_id is not null
)
delete from public.menu_items m
using ranked r
where m.id = r.id and r.rn > 1
  and not exists (select 1 from public.order_items oi where oi.item_id = m.id);

-- 2) الفئات المكررة بنفس الاسم: أصنافها لأول فئة، وبعدين الفئة الفاضية بتتشال
with ranked as (
  select id, first_value(id) over w as keep, row_number() over w as rn
  from public.menu_categories
  where branch_id is not null
  window w as (partition by restaurant_id, branch_id, lower(btrim(name->>'ar')) order by created_at, id)
)
update public.menu_items m set category_id = r.keep
from ranked r
where m.category_id = r.id and r.rn > 1;

with ranked as (
  select id, row_number() over (partition by restaurant_id, branch_id, lower(btrim(name->>'ar')) order by created_at, id) as rn
  from public.menu_categories
  where branch_id is not null
)
delete from public.menu_categories c
using ranked r
where c.id = r.id and r.rn > 1
  and not exists (select 1 from public.menu_items m where m.category_id = c.id);

-- 3) مجموعات الإضافات اللي ما بقاش أي صنف بيستخدمها (في منيو الفروع بس)، وإضافاتها معاها
delete from public.modifier_groups g
where g.branch_id is not null
  and not exists (select 1 from public.menu_items m where g.id = any (m.modifier_group_ids));
