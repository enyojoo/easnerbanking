-- ZA BankLocal and similar Noah corridors require beneficiary email on prepare.
alter table public.recipients
  add column if not exists email text;

comment on column public.recipients.email is 'Beneficiary email when Noah FormSchema requires Email (e.g. ZA BankLocal).';
