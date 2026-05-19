-- Noah does not provide a signed agreement id for storage on users.
ALTER TABLE public.users
  DROP COLUMN IF EXISTS noah_signed_agreement_id;
