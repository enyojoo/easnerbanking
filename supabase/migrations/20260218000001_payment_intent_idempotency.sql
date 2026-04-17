-- Optional idempotency for POST /onramp/intents and /offramp/intents
alter table public.payment_intents add column if not exists idempotency_key text;

create unique index if not exists payment_intents_idempotency_key_uidx
  on public.payment_intents (idempotency_key)
  where idempotency_key is not null;
