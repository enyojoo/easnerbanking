-- Canonical verification SoR (Grid business KYB cutover) + provider-tagged virtual accounts.

alter table public.businesses
  add column if not exists verification_provider text,
  add column if not exists verification_status text not null default 'not_started',
  add column if not exists verification_rejection_reasons jsonb,
  add column if not exists compliance_cutover_at timestamptz;

alter table public.users
  add column if not exists verification_provider text,
  add column if not exists verification_status text not null default 'not_started',
  add column if not exists verification_rejection_reasons jsonb;

comment on column public.businesses.verification_provider is 'Compliance SoR: grid | noah';
comment on column public.businesses.verification_status is 'Canonical KYB/KYC: not_started|pending|approved|rejected|hold';
comment on column public.users.verification_provider is 'Compliance SoR: grid | noah';
comment on column public.users.verification_status is 'Canonical KYC: not_started|pending|approved|rejected|hold';

alter table public.virtual_accounts
  add column if not exists provider text not null default 'noah',
  add column if not exists status text not null default 'active',
  add column if not exists settlement_target text not null default 'turnkey';

create index if not exists virtual_accounts_provider_status_idx
  on public.virtual_accounts (provider, status);

create index if not exists businesses_verification_status_idx
  on public.businesses (verification_status);

create index if not exists users_verification_status_idx
  on public.users (verification_status);

-- Backfill mobile/users from Noah KYC mirror (no reset).
update public.users
set
  verification_provider = coalesce(verification_provider, 'noah'),
  verification_status = case
    when lower(coalesce(noah_kyc_status, '')) = 'approved' then 'approved'
    when lower(coalesce(noah_kyc_status, '')) in ('pending', 'in_review', 'under_review') then 'pending'
    when lower(coalesce(noah_kyc_status, '')) = 'rejected' then 'rejected'
    when lower(coalesce(noah_kyc_status, '')) = 'hold' then 'hold'
    else coalesce(nullif(trim(verification_status), ''), 'not_started')
  end
where verification_provider is null
   or verification_status = 'not_started';

-- Hard reset businesses onto Grid KYB (keep Noah mirrors for audit).
update public.businesses
set
  verification_provider = 'grid',
  verification_status = 'not_started',
  verification_rejection_reasons = null,
  compliance_cutover_at = coalesce(compliance_cutover_at, now())
where verification_provider is distinct from 'grid'
   or verification_status is distinct from 'not_started'
   or compliance_cutover_at is null;

-- Tag existing VAs; soft-retire business Noah VAs from product surfaces.
update public.virtual_accounts
set provider = coalesce(nullif(trim(provider), ''), 'noah')
where provider is null or trim(provider) = '';

update public.virtual_accounts
set status = 'retired'
where business_id is not null
  and coalesce(provider, 'noah') = 'noah'
  and status = 'active';
