alter table public.users
  add column if not exists stripe_link_oauth_token_ciphertext text;
