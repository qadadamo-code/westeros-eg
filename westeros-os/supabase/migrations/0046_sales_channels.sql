-- قنوات البيع (Mohammed 2026-11-23): كل قناة (صالة، تيك أواي، توصيل، طلبات…) بتاخد سعر 1 أو 2 أو 3 من أسعار الصنف،
-- وفيها ضريبة أو لأ وسيرفيس أو لأ، وظاهرة في الكاشير أو لأ. بتتعرف من الحسابات > المبيعات.
-- أعمدة جديدة بقيم افتراضية بس، فالبيانات الموجودة ما بتتغيرش.

alter table public.settings
  add column if not exists sales_channels jsonb not null default '[]'::jsonb;   -- تعريف قنوات البيع

alter table public.menu_items
  add column if not exists price2 bigint check (price2 is null or price2 >= 0),  -- السعر التاني (فاضي = السعر الأول)
  add column if not exists price3 bigint check (price3 is null or price3 >= 0);  -- السعر التالت

alter table public.orders
  add column if not exists channel_id text;          -- قناة البيع اللي الطلب اتسجل عليها

alter table public.order_items
  add column if not exists to_go boolean not null default false;   -- "سفري": صنف جوه طلب صالة بيتلف للزبون
