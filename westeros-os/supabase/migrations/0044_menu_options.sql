-- المنيو والإضافات (نفس طريقة Bonbell): كل صنف ليه مجموعات خيارات (الحجم، كومبو، إكسترا، ملاحظات)،
-- كل مجموعة مطلوبة أو اختيارية، خيار واحد أو أكتر، وأقل وأكتر عدد اختيارات، وكل خيار ليه سعر بيتضاف على الصنف.
-- أعمدة جديدة بس، بقيم افتراضية، فالبيانات الموجودة ما بتتغيرش.

alter table public.menu_categories
  add column if not exists image_url    text,
  add column if not exists external_ref text;                                   -- رقم الفئة في Bonbell (للاستيراد)

alter table public.menu_items
  add column if not exists discount     bigint not null default 0 check (discount >= 0),   -- خصم من السعر (بنفس وحدات السعر)
  add column if not exists recommended  boolean not null default false,
  add column if not exists external_ref text;                                   -- رقم الصنف في Bonbell (للاستيراد)

alter table public.modifier_groups
  add column if not exists required     boolean not null default false,
  add column if not exists multi        boolean not null default false,         -- false = خيار واحد، true = أكتر من خيار
  add column if not exists external_ref text;

alter table public.modifiers
  add column if not exists min_qty      int not null default 0 check (min_qty >= 0),
  add column if not exists max_qty      int not null default 1 check (max_qty >= 0),       -- 0 = من غير حد
  add column if not exists discount     bigint not null default 0 check (discount >= 0);
