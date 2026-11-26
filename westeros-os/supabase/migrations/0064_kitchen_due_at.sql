-- وقت تجهيز الأوردر في نظام طابعات المطبخ (صقر 26-11-2026): لما الأوردر يدخل المطبخ بيتحسب وقته
-- (أول 3 أوردرات 12 دقيقة، كل أوردر زيادة +3، وكل فئة مختلفة +1) وبيتعلم جاهز لوحده لما الوقت يخلص.
-- New empty column only; no existing row changes.
alter table public.order_items add column if not exists due_at timestamptz;
create index if not exists order_items_due_open_idx on public.order_items (due_at) where status in ('sent', 'preparing');
