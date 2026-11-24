-- Sign-in by PIN alone (Mohammed 2026-11-24): no names screen; the PIN tells who the person is. PINs are unique since
-- 0048, so exactly one active person matches. Guessing is slowed per restaurant: 5 misses lock PIN entry for 30 s.
-- Also: top management sets the password of an email account (theirs or another manager's) from the users screen.
create table if not exists public.pin_guard (
  restaurant_id uuid primary key references public.restaurants (id) on delete cascade,
  fails         int not null default 0,
  locked_until  timestamptz
);
alter table public.pin_guard enable row level security;   -- no policies: only the functions below touch it
revoke all on public.pin_guard from anon, authenticated;

create or replace function public.verify_any_pin(p_restaurant_id uuid, p_pin text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare m memberships; hit memberships; n int := 0; g pin_guard;
begin
  if not public.is_member(p_restaurant_id) then raise exception 'device not signed in to this restaurant' using errcode = '42501'; end if;
  if p_pin !~ '^\d{4,6}$' then return null; end if;
  insert into pin_guard (restaurant_id) values (p_restaurant_id) on conflict do nothing;
  select * into g from pin_guard where restaurant_id = p_restaurant_id for update;
  if g.locked_until is not null and g.locked_until > now() then raise exception 'pin_locked' using errcode = 'P0001'; end if;
  for m in select * from memberships where restaurant_id = p_restaurant_id and active and pin_hash is not null loop
    if m.pin_hash = extensions.crypt(p_pin, m.pin_hash) then n := n + 1; hit := m; end if;
  end loop;
  if n <> 1 then   -- no match, or an old short PIN two people share: management gives them new 6-digit PINs
    update pin_guard set fails = case when fails + 1 >= 5 then 0 else fails + 1 end,
                         locked_until = case when fails + 1 >= 5 then now() + interval '30 seconds' else null end
    where restaurant_id = p_restaurant_id;
    return null;
  end if;
  update pin_guard set fails = 0, locked_until = null where restaurant_id = p_restaurant_id;
  update memberships set last_seen_at = now(), pin_failed_count = 0, pin_locked_until = null where id = hit.id;
  return jsonb_build_object('id', hit.id, 'restaurant_id', hit.restaurant_id, 'user_id', hit.user_id, 'name', hit.name, 'role', hit.role,
    'branch_ids', hit.branch_ids, 'phone', hit.phone, 'email', hit.email, 'color', hit.color, 'has_pin', true, 'active', hit.active,
    'last_seen_at', now(), 'created_at', hit.created_at, 'updated_at', hit.updated_at);
end $$;

-- Top management (owner, admin) sets the password of a member who signs in by email. Only the owner touches the owner.
create or replace function public.set_member_password(p_restaurant_id uuid, p_membership_id uuid, p_password text)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare m memberships;
begin
  if length(coalesce(p_password, '')) < 8 then raise exception 'password_short' using errcode = '22023'; end if;
  select * into m from memberships where id = p_membership_id and restaurant_id = p_restaurant_id;
  if not found then raise exception 'not found' using errcode = 'P0002'; end if;
  if m.user_id is null then raise exception 'no_email_account' using errcode = '22023'; end if;
  if not ((public.has_role(p_restaurant_id, '{owner,admin}') and m.role <> 'owner') or public.has_role(p_restaurant_id, '{owner}')) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  update auth.users set encrypted_password = extensions.crypt(p_password, extensions.gen_salt('bf')), updated_at = now() where id = m.user_id;
end $$;

grant execute on function public.verify_any_pin(uuid, text), public.set_member_password(uuid, uuid, text) to authenticated;
