-- Allow Grid webhook deliveries in event_inbox (app writes provider = 'grid').

alter table public.event_inbox
  drop constraint if exists event_inbox_provider_check;

alter table public.event_inbox
  add constraint event_inbox_provider_check check (
    provider = any (
      array[
        'noah'::text,
        'turnkey'::text,
        'yellowcard'::text,
        'grid'::text,
        'other'::text
      ]
    )
  );

comment on column public.event_inbox.provider is
  'Webhook source: noah | turnkey | yellowcard | grid | other';
