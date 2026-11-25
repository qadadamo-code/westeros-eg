-- Saqr 2026-11-25: a cancelled (void) manufacturing batch can be deleted, e.g. to remove a product defined twice by mistake.
-- Active batches still can't be deleted; their stock moves stay. The history journal (0017) keeps the deleted row for restore.
drop policy if exists mfg_batches_delete on public.mfg_batches;
create policy mfg_batches_delete on public.mfg_batches for delete to authenticated
  using (status = 'void' and public.has_role(restaurant_id, '{owner,admin,manager,chef}'));
