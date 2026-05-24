# Noah Global Payout corridors

Fiat payouts use Noah Reliance **sell** flow: `GET /channels/sell` → `POST /transactions/sell/prepare` → `POST /transactions/sell`.

## Ops scripts

```bash
# Probe Noah catalog + optional manifest (from repo root)
cd business && node --env-file=.env.local --import tsx scripts/probe-noah-pairs.ts
PROBE_WRITE_MANIFEST=true node --env-file=.env.local --import tsx scripts/probe-noah-pairs.ts

# Sync FormSchema hints into payout_corridors.fields_schema
cd business && node --env-file=.env.local --import tsx scripts/apply-payout-corridor-schemas.ts
# Optional: APPLY_SCHEMAS_ENABLE=true to insert disabled rows for new corridors
```

## Client contract

| Step | API | Notes |
|------|-----|-------|
| Catalog | `GET /api/send-destinations` | `fields_schema` per corridor (bank enums, reference rules, CA purpose list) |
| Quote | `POST /api/noah/payouts/quote` | `note`, `paymentPurpose` → prepare `Form` |
| Execute | `POST /api/noah/transfers` | `countryCode` required for form-session sell; `payoutCorridorGate` on execute |

## Send amount UX

| Corridor | Amount screen | Noah field |
|----------|---------------|------------|
| EUR SEPA | Note (required on CTA) | `Reference` |
| US ACH/Fedwire | Note (optional) | `Reference` when set |
| Canada CAD | Payment purpose dropdown | `PaymentPurpose` |
| Africa / mobile | Note (optional) | When schema allows |
| Easetag | Note (optional) | Ledger `metadata.send_note` only |

## Priority corridors

US (USD), Eurozone (EUR), KE (KES bank + mobile), NG (NGN bank enum), GH (GHS), ZA (ZAR), CA (CAD), GB (GBP).

Schema reference: [noah-labs/public-schemas](https://github.com/noah-labs/public-schemas).
