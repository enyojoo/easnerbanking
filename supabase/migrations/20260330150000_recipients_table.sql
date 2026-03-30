-- Saved recipients for send-money flows (mobile recipientService).

create table if not exists public.recipients (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  full_name text not null,
  account_number text not null default '',
  bank_name text not null,
  phone_number text,
  currency text not null default 'USD',
  routing_number text,
  sort_code text,
  iban text,
  swift_bic text,
  noah_external_account_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists recipients_user_id_created_at_idx
  on public.recipients (user_id, created_at desc);

alter table public.recipients enable row level security;

create policy "Users can select own recipients"
  on public.recipients
  for select
  using (auth.uid() = user_id);

create policy "Users can insert own recipients"
  on public.recipients
  for insert
  with check (auth.uid() = user_id);

create policy "Users can update own recipients"
  on public.recipients
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete own recipients"
  on public.recipients
  for delete
  using (auth.uid() = user_id);
