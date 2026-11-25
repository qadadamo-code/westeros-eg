-- اللاسلكي المنظم (صقر 25-11-2026): group chats (grp:<id>) next to direct talk (dm:<a>:<b>), with who may talk to whom
-- set by management in the app (mfg_settings.lists.radio). Employees work on the restaurant's shared, linked device
-- and switch by PIN, so the signed-in account is the device's, not the employee's: the clip rules check that the
-- sender is a member of the same restaurant, and the app applies each employee's radio permission.
-- Existing clips are not touched.

do $$
declare c record;
begin
  for c in select conname from pg_constraint
            where conrelid = 'public.radio_clips'::regclass and contype = 'c' and pg_get_constraintdef(oid) ilike '%channel%'
  loop
    execute format('alter table public.radio_clips drop constraint %I', c.conname);
  end loop;
end $$;

alter table public.radio_clips add constraint radio_clips_channel_check check (
  channel in ('all','floor','kitchen','delivery','managers')
  or channel ~ '^dm:[0-9a-f-]{36}:[0-9a-f-]{36}$'
  or channel ~ '^grp:[A-Za-z0-9_-]{1,64}$'
);

drop policy if exists radio_clips_select on public.radio_clips;
create policy radio_clips_select on public.radio_clips for select to authenticated using (public.is_member(restaurant_id));

drop policy if exists radio_clips_insert on public.radio_clips;
create policy radio_clips_insert on public.radio_clips for insert to authenticated
  with check (
    public.is_member(restaurant_id)
    and exists (select 1 from public.memberships m where m.id = from_id and m.restaurant_id = radio_clips.restaurant_id and m.active)
  );

-- the conversation log reads by time
create index if not exists radio_clips_at_idx on public.radio_clips (restaurant_id, at desc);
