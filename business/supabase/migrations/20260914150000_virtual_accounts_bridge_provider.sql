-- Bridge virtual accounts persist on public.virtual_accounts (same table as Noah/Grid).
-- The table is not defined in this repo; production may still CHECK provider without 'bridge'.

do $$
declare
  rec record;
begin
  if to_regclass('public.virtual_accounts') is null then
    return;
  end if;

  for rec in
    select c.conname
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'virtual_accounts'
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) ~* 'provider\s+in\s*\('
  loop
    execute format('alter table public.virtual_accounts drop constraint %I', rec.conname);
  end loop;

  alter table public.virtual_accounts
    drop constraint if exists virtual_accounts_provider_check;

  alter table public.virtual_accounts
    add constraint virtual_accounts_provider_check
    check (provider in ('noah', 'yellowcard', 'grid', 'bridge'));
end $$;
