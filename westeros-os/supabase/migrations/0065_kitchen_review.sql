-- مراجعة شاشة المطبخ (صقر 27-11-2026): في نظام شاشة المطبخ التفاعلية، الطلب اللي ما اتعملش جاهز بعد عدد دقايق من الإرسال
-- للمطبخ (اعدادات التشغيل > شاشة المطبخ) بيتحول لـ «مراجعة». جنب كل أوردر اسم الشيف المشرف (اللي فاتح شاشة المطبخ بحسابه)،
-- وصاحب الصلاحية بيحدد: جاهز / هدر / خرج، والهدر بيتسجل في المخازن.
-- New empty columns only, and one more allowed waste reason; no existing row changes.
alter table public.order_items
  add column if not exists review_at timestamptz,
  add column if not exists chef_id uuid,
  add column if not exists review_result text check (review_result is null or review_result in ('ready', 'waste', 'out')),
  add column if not exists reviewed_by uuid,
  add column if not exists reviewed_at timestamptz;
create index if not exists order_items_review_idx on public.order_items (review_at) where review_at is not null;

do $$
declare c text;
begin
  for c in select conname from pg_constraint
           where conrelid = 'public.stock_moves'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%void_after_send%'
  loop
    execute format('alter table public.stock_moves drop constraint %I', c);
  end loop;
  alter table public.stock_moves add constraint stock_moves_reason_check check (reason is null or reason in
    ('expired', 'spoiled', 'burnt', 'dropped', 'overproduction', 'returned_by_guest', 'void_after_send', 'kds_review', 'staff_meal', 'other'));
end $$;
