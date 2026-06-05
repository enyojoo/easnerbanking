-- Wallet send orchestration rows were missing occurred_at, so they sorted after all
-- dated transactions (occurred_at DESC NULLS LAST) and never appeared on dashboard.

-- All wallet_send rows still missing occurred_at.
UPDATE public.transactions
SET
  occurred_at = created_at,
  settled_at = COALESCE(settled_at, created_at)
WHERE occurred_at IS NULL
  AND metadata->>'activity_type' = 'wallet_send';

-- Idempotent safety net for the two Jun 5 direct_turnkey wallet sends (ETID15597451, ETID44734790).
UPDATE public.transactions
SET
  occurred_at = COALESCE(occurred_at, created_at),
  settled_at = COALESCE(settled_at, created_at)
WHERE metadata->>'activity_type' = 'wallet_send'
  AND (
    id IN (
      'ac309ce2-7f19-4f9d-a806-3c86e2e34f40',
      '07e182b8-98dd-4d9f-983b-583c26f25c11'
    )
    OR easner_transaction_id IN ('ETID15597451', 'ETID44734790')
  );
