-- (Mohammed 2026-11-24) أعمدة جديدة بقيم افتراضية بس، فالبيانات الموجودة ما بتتغيرش.

alter table public.menu_items
  add column if not exists off_channels jsonb not null default '[]'::jsonb;   -- قنوات البيع اللي الصنف مش مفعل فيها (بيختفي منها)

alter table public.payments
  add column if not exists pay_method_id text;     -- طريقة الدفع المعرفة في الحسابات > المبيعات > طرق الدفع

alter table public.orders
  add column if not exists external_ref text;      -- كود الطلب في تطبيق التوصيل (طلبات، كيتا…)
