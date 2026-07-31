-- Office-editable per-user / per-business Easner processing fee overrides.
create table if not exists public.processing_fee_overrides (
  id uuid primary key default gen_random_uuid(),
  subject_type text not null check (subject_type in ('business', 'user')),
  subject_id uuid not null,
  pay_in_bps int check (pay_in_bps is null or pay_in_bps >= 0),
  pay_out_bps int check (pay_out_bps is null or pay_out_bps >= 0),
  cross_border_bps int check (cross_border_bps is null or cross_border_bps >= 0),
  reason text,
  updated_by uuid,
  updated_at timestamptz not null default now(),
  unique (subject_type, subject_id)
);

comment on table public.processing_fee_overrides is
  'Per-user or per-business Easner processing fee bps overrides; null direction fields fall through to processing_fee_schedule.';

create index if not exists processing_fee_overrides_subject_id_idx
  on public.processing_fee_overrides (subject_id);
