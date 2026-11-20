-- طلب توريد: the new flow (Mohammed, 2026-11-20).
--   new (جديد) → in_progress (قيد التنفيذ) / postponed (مؤجل لموعد تاني) → sent (تم الإرسال) → done (تم الاستلام)
-- The stock moves only when the branch confirms receipt by scanning the stickers.
-- Only the allowed statuses grow and two new columns are added: no existing row changes.
alter table public.stock_requests drop constraint if exists stock_requests_status_check;
alter table public.stock_requests add constraint stock_requests_status_check
  check (status in ('new', 'in_progress', 'done', 'rejected', 'postponed', 'sent'));

-- when the responsible employee sent the quantities
alter table public.stock_requests add column if not exists sent_at timestamptz;
-- what happened to the request, in order: [{at, by, name, action, note}]
alter table public.stock_requests add column if not exists history jsonb not null default '[]';
