-- Individual pre-KYC geo pre-screen (Noah PrimaryResidence.Country proxy).
-- Nullable for legacy accounts; collected at mobile signup or once in verification if missing.

alter table public.users
  add column if not exists residence_country text;

comment on column public.users.residence_country is
  'ISO2 country of residence declared at mobile signup; used for Noah geo pre-screen before KYC.';
