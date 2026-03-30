-- Mobile (and web) read the signed-in user's row from public.users with the user JWT.
-- Table Editor uses the service role and bypasses RLS, so rows can "exist" there while
-- the app sees none until a policy allows SELECT for auth.uid() = id.

alter table public.users enable row level security;

drop policy if exists "Users read own row" on public.users;
create policy "Users read own row"
  on public.users
  for select
  using (auth.uid() = id);

drop policy if exists "Users update own row" on public.users;
create policy "Users update own row"
  on public.users
  for update
  using (auth.uid() = id)
  with check (auth.uid() = id);
