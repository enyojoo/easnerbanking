-- Grid cutover: clear stale KYB verified timestamps so legacy Noah approval does not linger
-- on orgs reset to verification_status = not_started (Noah mirrors kept for audit).

update public.businesses
set kyb_verified_at = null
where verification_provider = 'grid'
  and compliance_cutover_at is not null
  and lower(coalesce(verification_status, 'not_started')) <> 'approved'
  and kyb_verified_at is not null;
