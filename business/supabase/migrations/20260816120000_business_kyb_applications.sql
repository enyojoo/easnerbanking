-- First-party Grid KYB drafts and records. Packet lives here; businesses.verification_status stays the product gate.

create table if not exists public.business_kyb_applications (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null unique references public.businesses (id) on delete cascade,
  status text not null default 'draft'
    check (status in ('draft', 'submitted', 'resolve_errors', 'in_review', 'approved', 'rejected', 'hold')),
  company jsonb not null default '{}'::jsonb,
  grid_customer_id text,
  grid_verification_id text,
  last_errors jsonb not null default '[]'::jsonb,
  submitted_at timestamptz,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.business_kyb_applications is
  'One KYB application per business. Company draft + Grid verification gaps. Identifiers live on people/documents.';

create table if not exists public.business_kyb_people (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.business_kyb_applications (id) on delete cascade,
  business_id uuid not null references public.businesses (id) on delete cascade,
  first_name text not null default '',
  middle_name text,
  last_name text not null default '',
  email text,
  phone text,
  birth_date text,
  nationality text,
  address_line1 text,
  address_line2 text,
  city text,
  state text,
  postal_code text,
  address_country text,
  ownership_percentage numeric,
  roles text[] not null default '{}',
  id_type text,
  identifier_ciphertext text,
  identifier_key_id text,
  country_of_issuance text,
  grid_beneficial_owner_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists business_kyb_people_application_idx
  on public.business_kyb_people (application_id);

create table if not exists public.business_kyb_documents (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.business_kyb_applications (id) on delete cascade,
  business_id uuid not null references public.businesses (id) on delete cascade,
  person_id uuid references public.business_kyb_people (id) on delete cascade,
  category text not null,
  document_type text,
  issuing_country text,
  issuing_authority text,
  document_number_ciphertext text,
  document_number_key_id text,
  storage_path text not null,
  file_name text,
  content_type text,
  byte_size integer,
  side text,
  grid_document_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists business_kyb_documents_application_idx
  on public.business_kyb_documents (application_id);

insert into storage.buckets (id, name, public)
values ('kyb-documents', 'kyb-documents', false)
on conflict (id) do update set public = false;

alter table public.business_kyb_applications enable row level security;
alter table public.business_kyb_people enable row level security;
alter table public.business_kyb_documents enable row level security;

create policy business_kyb_applications_select_member
  on public.business_kyb_applications
  for select
  using (
    exists (
      select 1 from public.users u
      where u.id = auth.uid()
        and u.easner_business_id = business_kyb_applications.business_id
    )
  );

create policy business_kyb_people_select_member
  on public.business_kyb_people
  for select
  using (
    exists (
      select 1 from public.users u
      where u.id = auth.uid()
        and u.easner_business_id = business_kyb_people.business_id
    )
  );

create policy business_kyb_documents_select_member
  on public.business_kyb_documents
  for select
  using (
    exists (
      select 1 from public.users u
      where u.id = auth.uid()
        and u.easner_business_id = business_kyb_documents.business_id
    )
  );
