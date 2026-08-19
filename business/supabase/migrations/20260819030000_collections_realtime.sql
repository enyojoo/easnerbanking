-- Live Incoming on /accounts and collected totals on /links.
-- Replica identity default is enough for INSERT; UPDATE uses business_id filter.

do $$
begin
  alter publication supabase_realtime add table public.checkout_stripe_settlements;
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.invoice_stripe_settlements;
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.payment_links;
exception
  when duplicate_object then null;
end $$;

alter table public.invoice_stripe_settlements enable row level security;

drop policy if exists invoice_stripe_settlements_select_member on public.invoice_stripe_settlements;
create policy invoice_stripe_settlements_select_member
  on public.invoice_stripe_settlements
  for select
  using (
    exists (
      select 1 from public.users u
      where u.id = auth.uid()
        and u.easner_business_id = invoice_stripe_settlements.business_id
    )
  );
