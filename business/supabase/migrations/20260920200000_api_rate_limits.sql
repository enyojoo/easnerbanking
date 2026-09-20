-- Shared rate-limit counters for public /v1 vs first-party /api.
-- Also store handler duration on platform API logs for p95.

create table if not exists public.api_rate_limits (
  rate_key text primary key,
  window_started_at timestamptz not null default now(),
  request_count integer not null default 0,
  updated_at timestamptz not null default now()
);

create or replace function public.consume_api_rate_limit(
  p_rate_key text,
  p_limit integer,
  p_window_seconds integer
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  current_count integer;
begin
  insert into public.api_rate_limits (rate_key, window_started_at, request_count, updated_at)
  values (p_rate_key, now(), 1, now())
  on conflict (rate_key) do update set
    window_started_at = case
      when public.api_rate_limits.window_started_at <= now() - make_interval(secs => p_window_seconds)
      then now() else public.api_rate_limits.window_started_at end,
    request_count = case
      when public.api_rate_limits.window_started_at <= now() - make_interval(secs => p_window_seconds)
      then 1 else public.api_rate_limits.request_count + 1 end,
    updated_at = now()
  returning request_count into current_count;
  return current_count <= p_limit;
end;
$$;

revoke all on function public.consume_api_rate_limit(text, integer, integer) from public;
grant execute on function public.consume_api_rate_limit(text, integer, integer) to service_role;

alter table public.api_rate_limits enable row level security;

alter table public.platform_api_logs
  add column if not exists duration_ms integer;
