-- Purchase and supply requests move stock when they are finished.
--   to_location_id  the warehouse chosen on the request (each line may name its own inside `lines`)
--   received_at     when the quantities were moved; a request moves stock once
alter table public.stock_requests add column if not exists to_location_id uuid;
alter table public.stock_requests add column if not exists received_at    timestamptz;
