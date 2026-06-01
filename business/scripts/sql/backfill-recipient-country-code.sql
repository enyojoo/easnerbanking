-- Run this alone if 20260601200000 migration ALTER already applied, or to re-run backfill only.
-- No INSERTs. Idempotent.

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
