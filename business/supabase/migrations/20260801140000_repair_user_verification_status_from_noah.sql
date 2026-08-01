-- Repair individual canonical SoR when Noah KYC mirror is ahead of verification_status.
-- Happens when Noah webhooks updated noah_kyc_status after the Grid cutover columns landed
-- without writing verification_status (money-movement gates read the canonical column).

update public.users
set
  verification_provider = coalesce(nullif(trim(verification_provider), ''), 'noah'),
  verification_status = case
    when lower(coalesce(noah_kyc_status, '')) = 'approved' then 'approved'
    when lower(coalesce(noah_kyc_status, '')) in ('pending', 'in_review', 'under_review') then 'pending'
    when lower(coalesce(noah_kyc_status, '')) = 'rejected' then 'rejected'
    when lower(coalesce(noah_kyc_status, '')) = 'hold' then 'hold'
    else verification_status
  end,
  kyc_verified_at = case
    when lower(coalesce(noah_kyc_status, '')) = 'approved'
      then coalesce(kyc_verified_at, now())
    else kyc_verified_at
  end
where coalesce(nullif(trim(verification_provider), ''), 'noah') <> 'grid'
  and lower(coalesce(verification_status, 'not_started')) in ('not_started', '')
  and lower(coalesce(noah_kyc_status, '')) in (
    'approved',
    'pending',
    'in_review',
    'under_review',
    'rejected',
    'hold'
  );
