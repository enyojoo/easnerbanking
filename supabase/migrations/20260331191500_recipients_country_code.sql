-- Persist selected recipient country for currencies shared by multiple countries (e.g., XOF).
alter table public.recipients
  add column if not exists country_code text;

