-- Top management (owner, admin) changes the sign-in email of a member who has an email account, including another
-- manager's; only the owner changes the owner's. The member card's contact email follows. (Mohammed 2026-11-24)
create or replace function public.set_member_email(p_restaurant_id uuid, p_membership_id uuid, p_email text)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare m memberships; e text := lower(trim(coalesce(p_email, '')));
begin
  if e !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'email_bad' using errcode = '22023'; end if;
  select * into m from memberships where id = p_membership_id and restaurant_id = p_restaurant_id;
  if not found then raise exception 'not found' using errcode = 'P0002'; end if;
  if m.user_id is null then raise exception 'no_email_account' using errcode = '22023'; end if;
  if not ((public.has_role(p_restaurant_id, '{owner,admin}') and m.role <> 'owner') or public.has_role(p_restaurant_id, '{owner}')) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if exists (select 1 from auth.users where lower(email) = e and id <> m.user_id) then raise exception 'email_taken' using errcode = '23505'; end if;
  update auth.users set email = e, updated_at = now() where id = m.user_id;
  update auth.identities set identity_data = jsonb_set(coalesce(identity_data, '{}'::jsonb), '{email}', to_jsonb(e)), updated_at = now()
   where user_id = m.user_id and provider = 'email';
  update memberships set email = e, updated_at = now() where id = m.id;
end $$;

grant execute on function public.set_member_email(uuid, uuid, text) to authenticated;
