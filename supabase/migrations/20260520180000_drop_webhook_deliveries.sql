-- Noah/Turnkey webhooks use `event_inbox` only; `webhook_deliveries` is retired.
-- In some environments this was a view over `event_inbox`, not a base table.
drop view if exists public.webhook_deliveries;
drop table if exists public.webhook_deliveries;
