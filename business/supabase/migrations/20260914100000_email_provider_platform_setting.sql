-- Office Platform Configuration: transactional email backend (SES default, SendGrid fallback).

insert into public.system_settings (key, value, data_type, category, is_active, updated_at)
values (
  'email_provider',
  'ses',
  'string',
  'platform',
  true,
  now()
)
on conflict (key) do nothing;
