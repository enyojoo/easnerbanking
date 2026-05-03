-- =============================================================================
-- EASNER_ETID_RESERVATIONS — diagnose, emergency restore, permanent fix steps
-- =============================================================================
-- Error: relation "public.easner_etid_reservations" does not exist
-- Cause: the TABLE was dropped but a function (usually transfer_easetag_p2p)
--        still references it.
--
-- Run this file MANUALLY in Supabase SQL Editor (do not rely on it as a
-- numbered migration unless you intend everyone to get SECTION 2).
-- =============================================================================


-- -----------------------------------------------------------------------------
-- SECTION 1 — DIAGNOSE
-- -----------------------------------------------------------------------------

select n.nspname as schema,
       p.proname as function_name,
       p.oid::regprocedure as signature
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and coalesce(p.prosrc, '') ilike '%easner_etid_reservations%';

select n.nspname,
       p.proname,
       p.oid::regprocedure as signature
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and pg_get_functiondef(p.oid) ilike '%easner_etid_reservations%';

select schemaname, viewname
from pg_views
where definition ilike '%easner_etid_reservations%';


-- -----------------------------------------------------------------------------
-- SECTION 2 — EMERGENCY RESTORE (unblock production quickly)
-- Recreates the table so existing RPC code stops failing with "relation does
-- not exist". You still need SECTION 3 for a real long-term fix.
-- -----------------------------------------------------------------------------

create table if not exists public.easner_etid_reservations (
  etid text not null,
  user_id uuid not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  constraint easner_etid_reservations_pkey primary key (etid),
  constraint easner_etid_reservations_user_id_fkey
    foreign key (user_id) references auth.users (id) on delete cascade
);

create index if not exists easner_etid_reservations_user_expires_idx
  on public.easner_etid_reservations using btree (user_id, expires_at);


-- -----------------------------------------------------------------------------
-- SECTION 3 — YOUR PERMANENT FIX (comments only; you execute the real SQL)
-- -----------------------------------------------------------------------------
-- 1) Get live definition of the RPC:
--      select pg_get_functiondef('public.transfer_easetag_p2p'::regprocedure);
-- 2) Copy it locally. Remove every use of easner_etid_reservations.
--    Keep behavior for p_reserved_debit_etid from the app (client ETID).
-- 3) Deploy: CREATE OR REPLACE FUNCTION public.transfer_easetag_p2p ...
-- 4) Re-run SECTION 1 — zero rows.
-- 5) Then run: supabase/migrations/20260203180000_drop_easner_etid_reservations.sql
--    (or drop table manually). If you used SECTION 2 only as a bridge, drop
--    the table after the RPC no longer references it.
-- =============================================================================
