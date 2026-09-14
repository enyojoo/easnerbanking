-- Office Platform Access: per-product maintenance + registration (Business vs Mobile).

insert into public.system_settings (key, value, data_type, category, is_active, updated_at)
values
  ('maintenance_mode_business', 'false', 'boolean', 'platform', true, now()),
  ('maintenance_mode_personal', 'false', 'boolean', 'platform', true, now()),
  ('registration_enabled_business', 'true', 'boolean', 'platform', true, now()),
  ('registration_enabled_personal', 'true', 'boolean', 'platform', true, now()),
  ('currency_active_USD', 'true', 'boolean', 'currency', true, now()),
  ('currency_active_EUR', 'true', 'boolean', 'currency', true, now())
on conflict (key) do nothing;
