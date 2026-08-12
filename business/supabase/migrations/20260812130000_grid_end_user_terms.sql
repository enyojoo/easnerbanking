-- Grid End User Terms acceptance audit (Lightspark disclosure requirement).
-- Recorded on signup/login via /api/auth/bootstrap; replayed as endUserTermsConsent on Grid customer create/PATCH.

alter table public.users
  add column if not exists grid_end_user_terms_version text,
  add column if not exists grid_end_user_terms_accepted_at timestamptz,
  add column if not exists grid_end_user_terms_accept_ip text,
  add column if not exists grid_end_user_terms_accept_method text,
  add column if not exists grid_end_user_terms_synced_at timestamptz;

comment on column public.users.grid_end_user_terms_version is
  'Grid End User Terms version accepted (from GET /customers/end-user-terms).';
comment on column public.users.grid_end_user_terms_accepted_at is
  'When the user accepted the combined Terms that include Lightspark EUT.';
comment on column public.users.grid_end_user_terms_accept_ip is
  'Client IP at acceptance time (x-forwarded-for / x-real-ip).';
comment on column public.users.grid_end_user_terms_accept_method is
  'Local audit method: signup_email | login_email | signup_apple | login_google | etc.';
comment on column public.users.grid_end_user_terms_synced_at is
  'When endUserTermsConsent was last successfully sent to Grid for this user.';
