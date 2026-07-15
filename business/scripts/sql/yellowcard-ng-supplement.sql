-- Nigeria local verification supplement for Yellowcard (NIN + BVN).
-- Stored separately from Noah-synced kyc_id_* columns. Business uses org owner users row.

alter table public.users
  add column if not exists ng_local_id_type text;

alter table public.users
  add column if not exists ng_local_id_number text;

comment on column public.users.ng_local_id_type is
  'Easner NG supplement ID type: NIN or BVN (the ID missing from Noah kyc_id_*).';

comment on column public.users.ng_local_id_number is
  'Easner NG supplement ID number (11 digits). Never overwrite Noah kyc_id_number.';
