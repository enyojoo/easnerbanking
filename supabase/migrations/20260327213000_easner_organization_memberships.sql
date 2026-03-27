begin;

create table if not exists public.easner_organization_memberships (
  id uuid not null default gen_random_uuid(),
  organization_id uuid not null references public.easner_organizations(id) on delete cascade,
  user_id uuid null references public.users(id) on delete set null,
  full_name text not null,
  email text not null,
  role text not null default 'member',
  status text not null default 'active',
  invited_by uuid null references public.users(id) on delete set null,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint easner_organization_memberships_pkey primary key (id),
  constraint easner_organization_memberships_role_check check (role in ('owner', 'admin', 'member', 'viewer')),
  constraint easner_organization_memberships_status_check check (status in ('active', 'invited')),
  constraint easner_organization_memberships_org_email_key unique (organization_id, email)
) tablespace pg_default;

create index if not exists idx_easner_org_memberships_org
  on public.easner_organization_memberships using btree (organization_id) tablespace pg_default;

create index if not exists idx_easner_org_memberships_user
  on public.easner_organization_memberships using btree (user_id) tablespace pg_default;

-- Seed owner membership from users for existing org-linked accounts.
insert into public.easner_organization_memberships (
  organization_id,
  user_id,
  full_name,
  email,
  role,
  status
)
select
  u.easner_organization_id,
  u.id,
  coalesce(nullif(trim(u.full_name), ''), 'Account Owner'),
  coalesce(lower(u.email), ''),
  'owner',
  'active'
from public.users u
where u.easner_organization_id is not null
  and coalesce(u.email, '') <> ''
on conflict (organization_id, email) do nothing;

commit;
