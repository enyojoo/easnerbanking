-- Office ops set this row. Their ids are admin_users, not public.users.
alter table public.business_checkout_fee_overrides
  drop constraint if exists business_checkout_fee_overrides_updated_by_fkey;

alter table public.business_checkout_fee_overrides
  add constraint business_checkout_fee_overrides_updated_by_fkey
  foreign key (updated_by) references public.admin_users (id) on delete set null;

comment on column public.business_checkout_fee_overrides.updated_by is
  'Office admin_users.id that last set the override.';
