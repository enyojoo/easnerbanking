-- CRITICAL: `users_update_own_row` scoped by row only (`auth.uid() = id`),
-- not by column. Since Postgres RLS restricts rows, not columns, any
-- authenticated caller could PATCH `public.users` directly via PostgREST
-- (using their own JWT + the public anon key) and set arbitrary columns on
-- their own row — including `noah_kyc_status` / `verification_status`,
-- which `requireNoahVerificationApproved` reads to gate wallets, payouts,
-- terminal, and autopayout. That is a self-KYC-approval vector.
--
-- The business web app and mobile app never write to `users` from the
-- browser/anon client — every write goes through a server route on the
-- service-role key (which bypasses RLS entirely and is unaffected by this
-- change). Removing client UPDATE access closes the gap with no functional
-- impact.
drop policy if exists "Users update own row" on public.users;
revoke update on public.users from authenticated, anon;

-- `payroll_runs`, `businesses`, and `business_stripe_connect_accounts` had
-- RLS enabled with zero policies. `scripts/sql/payroll-schema.sql` enabled
-- RLS on payroll tables with a TODO ("adjust policies to match your org
-- model") that was never finished; `businesses` and
-- `business_stripe_connect_accounts` were apparently the same. RLS-enabled
-- with no policy fails closed (nothing was ever exposed), but it also means
-- the browser Realtime subscriptions on these tables in
-- packages/shared/src/query/realtime.ts have never received a single row —
-- Postgres denies all access by default when RLS is on and no policy
-- matches. This adds read-only policies mirroring the business-membership
-- pattern already proven correct on `invoices` / `transactions` /
-- `wallet_balances`. No INSERT/UPDATE/DELETE policies are added — writes to
-- these tables should stay service-role-only, same as the ledger tables.
create policy payroll_runs_select_own_business
  on public.payroll_runs
  for select
  using (
    exists (
      select 1 from public.users u
      where u.id = auth.uid() and u.easner_business_id = payroll_runs.business_id
    )
  );

create policy businesses_select_member
  on public.businesses
  for select
  using (
    exists (
      select 1 from public.users u
      where u.id = auth.uid() and u.easner_business_id = businesses.id
    )
  );

create policy business_stripe_connect_accounts_select_member
  on public.business_stripe_connect_accounts
  for select
  using (
    exists (
      select 1 from public.users u
      where u.id = auth.uid() and u.easner_business_id = business_stripe_connect_accounts.business_id
    )
  );
