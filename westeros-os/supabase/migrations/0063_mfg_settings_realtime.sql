-- ثوابت النظام والأدوار تتحدث على كل الأجهزة على طول (صقر 26-11-2026: صلاحية اتدت لدور ومشتغلتش على جهاز الكاشير
-- لحد ما الصفحة اتحدثت). Adds mfg_settings to the realtime feed; no row is changed.
do $$ begin
  begin
    alter publication supabase_realtime add table public.mfg_settings;
  exception when duplicate_object then null; when undefined_object then null;
  end;
end $$;
