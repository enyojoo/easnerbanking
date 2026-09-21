alter table public.platform_api_logs
  add column if not exists idempotency_key text;
