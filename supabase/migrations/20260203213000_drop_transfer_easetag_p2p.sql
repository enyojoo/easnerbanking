-- Easetag P2P is implemented in the business app (`executeEasetagTransfer`: `wallet_balances` + `transactions`).
-- Remove any `transfer_easetag_p2p` overloads that still reference dropped `easner_etid_reservations`.

do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as proc
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'transfer_easetag_p2p'
  loop
    execute 'drop function if exists ' || r.proc || ' cascade';
  end loop;
end $$;
