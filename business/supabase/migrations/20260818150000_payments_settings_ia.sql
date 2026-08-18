-- Payments Settings IA: business-level master switch for card/bank collections.

alter table public.business_checkout_settings
  add column if not exists online_payments_enabled boolean not null default true;

comment on column public.business_checkout_settings.online_payments_enabled is
  'Master switch for card/bank collections (invoices, payment links, website checkout).';

-- Ensure every business has a checkout settings row.
insert into public.business_checkout_settings (business_id, online_payments_enabled)
select b.id, true
from public.businesses b
on conflict (business_id) do nothing;

-- Preserve legacy behavior: businesses that turned off invoice Pay online also had collections disabled.
update public.business_checkout_settings cs
set online_payments_enabled = false
from public.businesses b
where cs.business_id = b.id
  and b.invoice_settings is not null
  and (b.invoice_settings->>'showOnlinePayment') = 'false';
