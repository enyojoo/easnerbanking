-- Remove unused recipient columns (Easetag uses bank_name + account_number; wallet memo unused in UI).
alter table public.recipients
  drop column if exists wallet_memo_tag,
  drop column if exists address_line2,
  drop column if exists payee_easetag,
  drop column if exists payee_avatar_url;
