-- Adding a user failed with "permission denied for table memberships": the app sends last_seen_at (empty) with a new
-- member, and that column was not in the insert grant. Row security is unchanged: only owner and admin add users.
grant insert (last_seen_at) on public.memberships to authenticated;
