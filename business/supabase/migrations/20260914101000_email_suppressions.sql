-- SES bounce/complaint suppressions. Service role writes via SNS webhook.

create table if not exists public.email_suppressions (
  email text primary key,
  reason text not null check (reason in ('bounce', 'complaint')),
  source text not null default 'ses',
  created_at timestamptz not null default now(),
  raw jsonb
);

alter table public.email_suppressions enable row level security;
