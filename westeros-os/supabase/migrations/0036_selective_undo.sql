-- Selective restore: the manager ticks the changes to take back and keeps the rest (السجل والاسترجاع).
--   undo_changes(ids)   reverses the ticked changes in one transaction, newest first: all of them, or none.
-- A newer change on the same record blocks an undo only while it still stands: a change that was itself
-- taken back, and the journal row its undo wrote, no longer count. So two edits of one record can be
-- undone one after the other, and a group may hold several changes of the same record.

create or replace function public._undo_one(p_id bigint) returns void
language plpgsql security definer set search_path = public as $$
declare c change_log;
begin
  select * into c from change_log where id = p_id for update;
  if not found then raise exception 'change not found' using errcode = 'P0002'; end if;
  if not public.has_role(c.restaurant_id, '{owner,admin,manager}') then raise exception 'not allowed' using errcode = '42501'; end if;
  if c.undone_at is not null then raise exception 'already undone' using errcode = 'P0001'; end if;
  if exists (select 1 from change_log n
             where n.table_name = c.table_name and n.row_id = c.row_id and n.id > c.id and n.source = 'app' and n.undone_at is null) then
    raise exception 'newer change on the same record' using errcode = 'P0001';
  end if;
  perform set_config('westeros.source', 'undo', true);
  perform public._revert_change(c);
  perform set_config('westeros.source', '', true);
  update change_log set undone_at = now() where id = c.id;
end $$;
revoke execute on function public._undo_one(bigint) from public, anon, authenticated;

create or replace function public.undo_change(p_id bigint) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public._undo_one(p_id);
end $$;

create or replace function public.undo_changes(p_ids bigint[]) returns int
language plpgsql security definer set search_path = public as $$
declare i bigint; n int := 0;
begin
  for i in select distinct x from unnest(p_ids) x order by x desc loop
    perform public._undo_one(i);
    n := n + 1;
  end loop;
  return n;
end $$;

revoke execute on function public.undo_change(bigint), public.undo_changes(bigint[]) from public, anon;
grant execute on function public.undo_change(bigint), public.undo_changes(bigint[]) to authenticated;
