-- 0042: عملة الحساب. An account may be kept in a currency other than the system's own.
-- The column is new and empty: every existing account stays in the system's currency (null). No existing row is changed.
-- The system's currency and the other currencies with their last exchange rate live in fin_settings.data (currency, currencies).
alter table public.fin_accounts add column if not exists currency text;
