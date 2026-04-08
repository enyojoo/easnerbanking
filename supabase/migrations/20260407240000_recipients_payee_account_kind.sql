-- Optional metadata for Easetag (P2P) recipients: personal user vs business profile.
alter table public.recipients
  add column if not exists payee_account_kind text;
