-- Repair local KYB state after hosted-flow wiring (no emails).
-- Run manually against production/staging after deploy.

-- Mid-flow businesses: Grid PENDING with incomplete UBO — local should be in_progress.
update public.businesses
set verification_status = 'in_progress',
    updated_at = now()
where id in (
  '4769329d-a171-49cf-8647-7e9b8a0128d3', -- Easner Group
  '5148b9d1-8f2a-4c0e-9c3a-8b225c572c81'  -- Enyo's Business
);

-- Null known leaked shell tax_ids from historic Grid create stubs.
-- Do not touch Easner Group real EIN 320855540.
update public.businesses
set tax_id = null,
    updated_at = now()
where tax_id in (
  '942523714',  -- Fruitful Africa shell
  '354464292',  -- Peng shell
  '826133176',  -- YOGI shell
  '118341373'   -- bizdemo shell
);

-- Verify Easner EIN unchanged:
-- select id, name, tax_id, verification_status from businesses where name ilike '%Easner Group%';
