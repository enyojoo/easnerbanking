-- Hide orphan duplicate Yellowcard balance_payout ledger rows.
-- Keep the row referenced by yc_transfers.transaction_id; hide siblings with the same easner_payout_id.
--
-- Run manually after deploy.
-- Step 1: run the SELECT preview below and confirm orphan_id rows.
-- Step 2: run the UPDATE block (same CTEs — each statement needs its own WITH).

-- ========== Step 1: PREVIEW (read-only) ==========
WITH payout_groups AS (
  SELECT
    t.metadata->>'easner_payout_id' AS easner_payout_id,
    array_agg(t.id ORDER BY t.created_at) AS row_ids,
    count(*) AS row_count
  FROM transactions t
  WHERE lower(coalesce(t.provider, '')) = 'yellowcard'
    AND t.metadata->>'yc_mode' = 'balance_payout'
    AND coalesce(t.metadata->>'easner_payout_id', '') <> ''
  GROUP BY t.metadata->>'easner_payout_id'
  HAVING count(*) > 1
),
canonical AS (
  SELECT
    pg.easner_payout_id,
    coalesce(yt.transaction_id, pg.row_ids[1]) AS keep_id
  FROM payout_groups pg
  LEFT JOIN LATERAL (
    SELECT yt.transaction_id
    FROM yc_transfers yt
    WHERE yt.mode = 'balance_payout'
      AND yt.metadata->>'easner_payout_id' = pg.easner_payout_id
    ORDER BY yt.created_at DESC
    LIMIT 1
  ) yt ON true
),
orphans AS (
  SELECT t.id AS orphan_id, c.easner_payout_id, c.keep_id
  FROM transactions t
  JOIN canonical c ON c.easner_payout_id = t.metadata->>'easner_payout_id'
  WHERE t.id <> c.keep_id
    AND lower(coalesce(t.provider, '')) = 'yellowcard'
    AND t.metadata->>'yc_mode' = 'balance_payout'
    AND coalesce(t.hidden_from_feed, false) = false
)
SELECT orphan_id, easner_payout_id, keep_id FROM orphans;

-- ========== Step 2: APPLY (after preview looks correct) ==========
-- BEGIN;

WITH payout_groups AS (
  SELECT
    t.metadata->>'easner_payout_id' AS easner_payout_id,
    array_agg(t.id ORDER BY t.created_at) AS row_ids,
    count(*) AS row_count
  FROM transactions t
  WHERE lower(coalesce(t.provider, '')) = 'yellowcard'
    AND t.metadata->>'yc_mode' = 'balance_payout'
    AND coalesce(t.metadata->>'easner_payout_id', '') <> ''
  GROUP BY t.metadata->>'easner_payout_id'
  HAVING count(*) > 1
),
canonical AS (
  SELECT
    pg.easner_payout_id,
    coalesce(yt.transaction_id, pg.row_ids[1]) AS keep_id
  FROM payout_groups pg
  LEFT JOIN LATERAL (
    SELECT yt.transaction_id
    FROM yc_transfers yt
    WHERE yt.mode = 'balance_payout'
      AND yt.metadata->>'easner_payout_id' = pg.easner_payout_id
    ORDER BY yt.created_at DESC
    LIMIT 1
  ) yt ON true
),
orphans AS (
  SELECT t.id AS orphan_id
  FROM transactions t
  JOIN canonical c ON c.easner_payout_id = t.metadata->>'easner_payout_id'
  WHERE t.id <> c.keep_id
    AND lower(coalesce(t.provider, '')) = 'yellowcard'
    AND t.metadata->>'yc_mode' = 'balance_payout'
    AND coalesce(t.hidden_from_feed, false) = false
)
UPDATE transactions t
SET hidden_from_feed = true,
    updated_at = now()
FROM orphans o
WHERE t.id = o.orphan_id;

-- COMMIT;
