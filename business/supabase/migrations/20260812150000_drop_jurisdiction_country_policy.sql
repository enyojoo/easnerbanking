-- Drop unused Office jurisdiction allowlist.
-- Signup/KYB country eligibility is enforced in code via product hard-blocks
-- (Grid for Business, Noah for Mobile). The system_settings key is no longer read.

delete from public.system_settings
where key = 'jurisdiction_country_policy';
