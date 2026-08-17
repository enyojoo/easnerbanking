-- Fleet audit: Grid KYB-approved businesses and their active virtual_accounts rows.
-- Flag orgs with only provider=noah active VAs or no VA at all.

SELECT
  b.id,
  b.name,
  b.verification_provider,
  b.verification_status,
  b.grid_customer_id,
  va.id AS va_id,
  va.provider,
  va.currency,
  va.status AS va_status,
  va.provider_virtual_account_id,
  va.updated_at AS va_updated_at
FROM businesses b
LEFT JOIN virtual_accounts va
  ON va.business_id = b.id
  AND va.status = 'active'
WHERE b.verification_provider = 'grid'
  AND b.verification_status = 'approved'
ORDER BY b.name, va.provider;
