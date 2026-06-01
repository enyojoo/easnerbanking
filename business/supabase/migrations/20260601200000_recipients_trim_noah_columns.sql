-- Recipients schema cleanup + country_code backfill.
-- Safe to re-run. Do NOT paste INSERT INTO recipients — existing rows will hit recipients_pkey.

-- 1) Drop unused Noah columns (quote/session lives on terminal_sessions).
alter table public.recipients
  drop column if exists noah_external_account_id,
  drop column if exists noah_form_session_id,
  drop column if exists noah_sell_crypto_authorized,
  drop column if exists noah_sell_crypto_currency;

-- 2) Backfill country_code where mobile legacy insert omitted it.
update public.recipients
set country_code = 'NG'
where (country_code is null or btrim(country_code) = '')
  and upper(currency) = 'NGN';

update public.recipients
set country_code = 'ZA'
where (country_code is null or btrim(country_code) = '')
  and upper(currency) = 'ZAR';

update public.recipients
set country_code = 'KE'
where (country_code is null or btrim(country_code) = '')
  and upper(currency) = 'KES';

update public.recipients
set country_code = 'GH'
where (country_code is null or btrim(country_code) = '')
  and upper(currency) = 'GHS';

update public.recipients
set country_code = 'US'
where (country_code is null or btrim(country_code) = '')
  and upper(currency) = 'USD'
  and coalesce(bank_name, '') not ilike '%easetag%';

update public.recipients
set country_code = 'GB'
where (country_code is null or btrim(country_code) = '')
  and upper(currency) = 'GBP';

update public.recipients
set country_code = 'CA'
where (country_code is null or btrim(country_code) = '')
  and upper(currency) = 'CAD';

update public.recipients
set country_code = 'DE'
where (country_code is null or btrim(country_code) = '')
  and upper(currency) = 'EUR'
  and iban is not null;
