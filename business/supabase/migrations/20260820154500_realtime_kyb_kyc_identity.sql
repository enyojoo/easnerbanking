-- Live KYC/KYB and Stripe Connect status on Business web + mobile.
-- Webhooks persist partner status to these tables; the client channel
-- already multiplexes money-movement tables and now also identity rows.

do $$
begin
  begin
    alter publication supabase_realtime add table public.businesses;
  exception
    when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.business_kyb_applications;
  exception
    when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.users;
  exception
    when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.business_stripe_connect_accounts;
  exception
    when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.business_checkout_settings;
  exception
    when duplicate_object then null;
  end;
end $$;

-- Full replica identity so UPDATE payloads include status columns and
-- non-PK filters (`business_id`) match.
alter table public.businesses replica identity full;
alter table public.business_kyb_applications replica identity full;
alter table public.business_stripe_connect_accounts replica identity full;
alter table public.business_checkout_settings replica identity full;
