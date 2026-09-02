-- Office Platform Configuration: global wallet send compliance toggle (default on).

insert into public.system_settings (key, value, data_type, category, is_active, updated_at)
values (
  'wallet_send_compliance_enabled',
  'true',
  'boolean',
  'platform',
  true,
  now()
)
on conflict (key) do nothing;
