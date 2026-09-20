-- Phase 2.1: multiple named API keys per mode, independently revocable.
-- Today `business_api_keys_business_active_idx` enforces at most one active
-- key per (business_id, mode), and the issuing route revokes the existing
-- key before inserting a new one — so "rotate" and "have two active keys"
-- were mutually exclusive. Key lookup (authenticate-merchant-key.ts) already
-- matches by unique hash/publishable_key, never by "the one active key for
-- this mode," so relaxing this constraint is safe.
alter table public.business_api_keys
  add column if not exists name text;

drop index if exists business_api_keys_business_active_idx;

create index if not exists business_api_keys_business_mode_idx
  on public.business_api_keys (business_id, mode)
  where revoked_at is null;

-- Phase 2.2/2.3: a real Event object, decoupled from webhook delivery, plus
-- multiple webhook endpoints per business/mode (today: a single URL on
-- business_checkout_settings.webhook_url).
create table if not exists public.platform_events (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  livemode boolean not null default false,
  type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists platform_events_business_idx
  on public.platform_events (business_id, livemode, created_at desc);

alter table public.platform_events enable row level security;

create table if not exists public.platform_webhook_endpoints (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  livemode boolean not null default false,
  url text not null,
  description text,
  webhook_secret_ciphertext text,
  webhook_secret_last4 text,
  events jsonb not null default '[]'::jsonb,
  disabled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists platform_webhook_endpoints_business_idx
  on public.platform_webhook_endpoints (business_id, livemode)
  where disabled_at is null;

alter table public.platform_webhook_endpoints enable row level security;

-- Deliveries now reference an endpoint + an event, replacing the implicit
-- single-endpoint model `checkout_webhook_deliveries` assumed.
create table if not exists public.platform_webhook_deliveries (
  id uuid primary key default gen_random_uuid(),
  endpoint_id uuid not null references public.platform_webhook_endpoints (id) on delete cascade,
  event_id uuid not null references public.platform_events (id) on delete cascade,
  business_id uuid not null references public.businesses (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'delivered', 'failed')),
  attempt_count integer not null default 0,
  last_status_code integer,
  last_error text,
  next_attempt_at timestamptz,
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists platform_webhook_deliveries_endpoint_idx
  on public.platform_webhook_deliveries (endpoint_id, created_at desc);
create index if not exists platform_webhook_deliveries_event_idx
  on public.platform_webhook_deliveries (event_id);

alter table public.platform_webhook_deliveries enable row level security;

-- Backfill: turn each business's single legacy endpoint
-- (business_checkout_settings.webhook_url) into a row in the new table, so
-- existing merchant integrations keep receiving deliveries unchanged.
insert into public.platform_webhook_endpoints (
  business_id, livemode, url, webhook_secret_ciphertext, webhook_secret_last4, events, created_at
)
select
  s.business_id,
  false,
  s.webhook_url,
  s.webhook_secret_ciphertext,
  s.webhook_secret_last4,
  coalesce(s.webhook_events, '[]'::jsonb),
  now()
from public.business_checkout_settings s
where s.webhook_url is not null
  and not exists (
    select 1 from public.platform_webhook_endpoints e
    where e.business_id = s.business_id and e.url = s.webhook_url
  );

-- Phase 3.3: audit log for key/webhook changes.
create table if not exists public.platform_audit_log (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  actor_user_id uuid references public.users (id) on delete set null,
  action text not null,
  target_type text not null,
  target_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists platform_audit_log_business_idx
  on public.platform_audit_log (business_id, created_at desc);

alter table public.platform_audit_log enable row level security;
