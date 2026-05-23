# Exchange rates seed data

## Preferred: Supabase migration

Production seed lives in:

`business/supabase/migrations/20250526120000_seed_exchange_rates_ciuna.sql`

It upserts **156** rows into `exchange_rates` using only Easner columns (`from_currency`, `to_currency`, `rate`, `fee_type`, `fee_amount`, `min_amount`, `max_amount`, `status`, `source`, `as_of`, `updated_at`). Ciuna-only columns (`logistics_fee_type`, `bank_receive_*`, `cash_receive_*`, etc.) are not imported.

Apply with your normal migration flow (`supabase db push` / deploy migrations).

## Regenerate from a new Ciuna dump

1. Save the Ciuna `INSERT INTO exchange_rates ...` dump as `ciuna-exchange-rates.insert.sql` in this folder.
2. Generate SQL:

```bash
cd business
npx tsx scripts/generate-exchange-rates-seed-sql.ts \
  scripts/data/ciuna-exchange-rates.insert.sql \
  supabase/migrations/20250526120000_seed_exchange_rates_ciuna.sql
```

## Optional: live DB import (no migration)

```bash
cd business
node --env-file=.env.local --import tsx scripts/import-ciuna-exchange-rates.ts scripts/data/ciuna-exchange-rates.insert.sql
```

Upsert conflict key: `(from_currency, to_currency)`.
