-- PINs (Mohammed 2026-11-24): new PINs are exactly 6 digits, and two people in the same restaurant can never share
-- a PIN (permissions would mix), and only top management (owner, admin) sets PINs: an employee never changes their
-- own. Existing shorter PINs keep working until they are changed; nothing stored is touched.
create or replace function public.set_staff_pin(p_restaurant_id uuid, p_membership_id uuid, p_pin text)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare m memberships;
begin
  if p_pin !~ '^\d{6}$' then raise exception 'PIN must be 6 digits' using errcode = '22023'; end if;
  select * into m from memberships where id = p_membership_id and restaurant_id = p_restaurant_id;
  if not found then raise exception 'not found' using errcode = 'P0002'; end if;
  if not ((public.has_role(p_restaurant_id, '{owner,admin}') and m.role <> 'owner')
          or public.has_role(p_restaurant_id, '{owner}')) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if exists (select 1 from memberships o
             where o.restaurant_id = p_restaurant_id and o.id <> m.id and o.pin_hash is not null
               and o.pin_hash = extensions.crypt(p_pin, o.pin_hash)) then
    raise exception 'pin_taken' using errcode = '23505';
  end if;
  update memberships set pin_hash = extensions.crypt(p_pin, extensions.gen_salt('bf')), pin_failed_count = 0, pin_locked_until = null where id = m.id;
end $$;
