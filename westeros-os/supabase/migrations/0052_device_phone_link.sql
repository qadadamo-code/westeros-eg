-- A new phone or device joins without the owner's email (Saqr via Mohammed 2026-11-24): the first time on a device
-- the employee types their mobile number (as saved on their user card) and their own PIN; the device then stays
-- linked and asks only for the PIN (or face / fingerprint). Behind the scenes the employee gets a hidden sign-in
-- account (no real email, a fresh random password on every link) so the device holds a normal session. Members with
-- a real email account (owner, managers) keep signing in by email. Guessing is slowed for everyone together:
-- 5 misses lock this sign-in for 10 minutes.
-- Also: every user changes their own PIN from the user menu by typing the current one (Saqr 2026-11-24; this
-- replaces "only top management sets PINs").
create table if not exists public.device_guard (
  id           int primary key default 1 check (id = 1),
  fails        int not null default 0,
  locked_until timestamptz
);
alter table public.device_guard enable row level security;
revoke all on public.device_guard from anon, authenticated;
insert into public.device_guard (id) values (1) on conflict do nothing;

-- the last 10 digits of a mobile number, so 01012345678, +201012345678 and 00201012345678 all match
create or replace function public.phone_key(p text) returns text language sql immutable as $$
  select right(regexp_replace(translate(coalesce(p, ''), '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹', '01234567890123456789'), '\D', '', 'g'), 10)
$$;

create or replace function public.link_device(p_phone text, p_pin text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare g device_guard; m memberships; hit memberships; n int := 0; k text := public.phone_key(p_phone);
        uid uuid; pw text := encode(extensions.gen_random_bytes(18), 'hex'); e text;
begin
  select * into g from device_guard where id = 1 for update;
  if g.locked_until is not null and g.locked_until > now() then raise exception 'link_locked' using errcode = 'P0001'; end if;
  if length(k) = 10 and coalesce(p_pin, '') ~ '^\d{4,6}$' then
    for m in select * from memberships where active and pin_hash is not null and public.phone_key(phone) = k loop
      if m.pin_hash = extensions.crypt(p_pin, m.pin_hash) then n := n + 1; hit := m; end if;
    end loop;
  end if;
  if n <> 1 then
    update device_guard set fails = case when fails + 1 >= 5 then 0 else fails + 1 end,
                            locked_until = case when fails + 1 >= 5 then now() + interval '10 minutes' else null end
     where id = 1;
    return jsonb_build_object('ok', false);
  end if;
  update device_guard set fails = 0, locked_until = null where id = 1;
  if hit.user_id is not null then
    select id, email into uid, e from auth.users where id = hit.user_id;
    -- a real email account (owner, managers): its password is theirs, so they sign in by email instead
    if not exists (select 1 from auth.users where id = hit.user_id and coalesce(raw_app_meta_data ->> 'device_pin', '') = 'true') then
      return jsonb_build_object('ok', false, 'reason', 'email', 'email', e);
    end if;
    update auth.users set encrypted_password = extensions.crypt(pw, extensions.gen_salt('bf')), updated_at = now() where id = uid;
  else
    uid := gen_random_uuid();
    e := 'pin-' || replace(hit.id::text, '-', '') || '@devices.westeros.local';
    insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                            raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                            confirmation_token, recovery_token, email_change_token_new, email_change)
    values ('00000000-0000-0000-0000-000000000000', uid, 'authenticated', 'authenticated', e,
            extensions.crypt(pw, extensions.gen_salt('bf')), now(),
            '{"provider":"email","providers":["email"],"device_pin":"true"}'::jsonb, jsonb_build_object('name', hit.name), now(), now(),
            '', '', '', '');
    insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    values (gen_random_uuid(), uid, uid::text, jsonb_build_object('sub', uid::text, 'email', e, 'email_verified', true), 'email', now(), now(), now());
    update memberships set user_id = uid, updated_at = now() where id = hit.id;
  end if;
  update memberships set last_seen_at = now() where id = hit.id;
  return jsonb_build_object('ok', true, 'email', e, 'password', pw, 'restaurant_id', hit.restaurant_id, 'membership_id', hit.id, 'name', hit.name);
end $$;

create or replace function public.change_my_pin(p_restaurant_id uuid, p_membership_id uuid, p_old text, p_new text)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare m memberships;
begin
  if not public.is_member(p_restaurant_id) then raise exception 'not allowed' using errcode = '42501'; end if;
  if p_new !~ '^\d{6}$' then raise exception 'PIN must be 6 digits' using errcode = '22023'; end if;
  select * into m from memberships where id = p_membership_id and restaurant_id = p_restaurant_id and active;
  if not found then raise exception 'not found' using errcode = 'P0002'; end if;
  if m.pin_hash is null or m.pin_hash <> extensions.crypt(coalesce(p_old, ''), m.pin_hash) then raise exception 'old_pin_wrong' using errcode = '28000'; end if;
  if exists (select 1 from memberships o
             where o.restaurant_id = p_restaurant_id and o.id <> m.id and o.pin_hash is not null
               and o.pin_hash = extensions.crypt(p_new, o.pin_hash)) then
    raise exception 'pin_taken' using errcode = '23505';
  end if;
  update memberships set pin_hash = extensions.crypt(p_new, extensions.gen_salt('bf')), pin_failed_count = 0, pin_locked_until = null where id = m.id;
end $$;

revoke all on function public.link_device(text, text) from public;
grant execute on function public.link_device(text, text) to anon, authenticated;
grant execute on function public.change_my_pin(uuid, uuid, text, text) to authenticated;
