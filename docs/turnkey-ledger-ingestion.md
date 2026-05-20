# Turnkey ledger ingestion

## User-facing rows (one per story)

| Flow | Feed | Balance credit |
|------|------|----------------|
| Noah bank on-ramp | Bank Deposit | Noah pay-in settle + ATA sync |
| External USDC/EURC to deposit ATA | Stablecoin Deposit | Turnkey `BALANCE_CONFIRMED_UPDATES` webhook |
| Easetag P2P | Easetag Send / Received | Internal `easetag_p2p` ledger |
| Easner outbound send | Stablecoin Transfer | Send API / outbound chain |

## Webhook types

1. **Activity** (`FEATURE_NAME_WEBHOOK` → `POST /api/webhooks/turnkey`) — audit/orchestration. Non-deposit activities are no-ops for the ledger.
2. **Balance** (`BALANCE_CONFIRMED_UPDATES` on the same URL) — organic inbound stablecoin. Requires `TURNKEY_BALANCE_WEBHOOKS_ENABLED=1` after endpoint registration.

Register balance webhooks (internal cron auth):

```bash
curl -X POST "$BUSINESS_APP_URL/api/internal/turnkey-balance-webhook-endpoint" -H "Authorization: Bearer $CRON_SECRET"
```

## `sync-chain-ledger` (mobile / dashboard)

- Always: ATA balance snapshot + Noah reconcile + inbound RPC ingest + **ATA-first organic deposit scan** (creates `transactions` rows with `metadata.source = turnkey_chain_sync` for the activity feed).
- Product fallback when Turnkey balance webhooks are not registered or `TURNKEY_BALANCE_WEBHOOKS_ENABLED` is off.
- `SYNC_CHAIN_LEDGER_TX_BACKFILL=1` — deeper repair scan (120 signatures, faster throttle) for support only.
- Mobile/business call this on screen focus; server cooldown still runs ATA + light ingest every time.

## Troubleshooting

### Missing Stablecoin Deposit

1. Check `event_inbox` for `BALANCE%` event types (processed).
2. Confirm `TURNKEY_BALANCE_WEBHOOKS_ENABLED=1`.
3. Run user `POST /api/wallets/sync-chain-ledger` for ATA + Noah reconcile (not for organic deposit creation).

### Duplicate deposit (Bank + Stablecoin)

1. Same Solana `tx_hash` on Noah pay-in and Turnkey inbound → run `business/scripts/suppress-noah-turnkey-mirror-rows.ts`.
2. Verify Noah credit: pay-in `metadata.wallet_balance_credit_key` set; Turnkey mirror must not have `balance_delta_applied` unless it actually credited.

### Bank on-ramp balance wrong

1. Noah webhook delivered FiatDeposit + orchestration Out.
2. `reconcileNoahBankOnrampCreditForSolanaTx` on Solana hash.
3. ATA sync via `sync-chain-ledger`.

## Ops health

`GET /api/admin/ops/turnkey-webhook-health` (office admin) — inbox counts, balance webhook flags, route reachability.

## One-time cleanup

```bash
cd business && npx tsx scripts/suppress-noah-turnkey-mirror-rows.ts --dry-run
cd business && npx tsx scripts/suppress-noah-turnkey-mirror-rows.ts
```
