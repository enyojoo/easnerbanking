# Turnkey ledger ingestion

**Primary organic deposits:** Turnkey **balance** webhooks (`BALANCE_CONFIRMED_UPDATES` → `balances:confirmed`). Activity webhooks (`FEATURE_NAME_WEBHOOK`) do not carry inbound SPL deposits.

## User-facing rows (one per story)

| Flow | Feed | Balance credit |
|------|------|----------------|
| Noah bank on-ramp | Bank Deposit | Noah pay-in settle + ATA sync |
| External USDC/EURC to deposit ATA | Stablecoin Deposit | `POST /api/webhooks/turnkey` (`metadata.source = turnkey_balance_webhook`) |
| Easetag P2P | Easetag Send / Received | Internal `easetag_p2p` ledger |
| Easner outbound send | Stablecoin Transfer | Send API / outbound chain |

## Webhook types (two separate registrations)

1. **Activity** — `setOrganizationFeature(FEATURE_NAME_WEBHOOK)` → same URL. Wallet create, Sol send, etc. **No** organic deposit ingest.
2. **Balance** — `createWebhookEndpoint` + subscription `BALANCE_CONFIRMED_UPDATES` → same URL. Payload `type: "balances:confirmed"` with `msg.operation`, `msg.txHash`, `msg.address`, `msg.idempotencyKey`, `msg.asset`.

Register balance endpoint (internal cron auth):

```bash
curl -sS -X POST "$APP_URL/api/internal/turnkey-balance-webhook-endpoint" \
  -H "Authorization: Bearer $INTERNAL_CRON_SECRET"
```

Then set on the deployment:

- `TURNKEY_BALANCE_WEBHOOK_ENDPOINT_ID` — from POST response
- `TURNKEY_BALANCE_WEBHOOKS_ENABLED=1`

Verify inbox after a test deposit:

```sql
SELECT event_id, event_type, processed_at, error
FROM event_inbox
WHERE provider = 'turnkey' AND event_type ILIKE '%balance%'
ORDER BY created_at DESC LIMIT 20;
```

## `sync-chain-ledger` (fallback)

- Always: ATA balance snapshot + Noah reconcile + Noah hash link (`PublicID` → pay-in).
- Organic deposit **RPC scan** only when `TURNKEY_BALANCE_WEBHOOKS_ENABLED` is off (or missed events).
- When balance webhooks are on, sync skips ATA tx parse — deposits come from `balances:confirmed`.
- Cooldown (within 10 min): ATA + Noah only — no tx parse (RPC 429 guard).

## Troubleshooting

### Missing Stablecoin Deposit

1. `GET /api/internal/turnkey-balance-webhook-endpoint` — `create_webhook_endpoint_supported`, endpoint id.
2. `event_inbox` for `balances:confirmed` (not only `ACTIVITY_TYPE_*`).
3. `TURNKEY_BALANCE_WEBHOOKS_ENABLED=1`.
4. Fallback: user `POST /api/wallets/sync-chain-ledger`.

### Duplicate deposit (Bank + Stablecoin)

1. Same Solana `tx_hash` on Noah pay-in and organic ingest → `business/scripts/suppress-noah-turnkey-mirror-rows.ts`.
2. Noah Out `PublicID` must be linked before chain sync (see Noah on-ramp suppression).

## Webhooks V2 delivery headers

`POST /api/webhooks/turnkey` accepts Turnkey V2 headers (payload shapes unchanged):

| Header | Use |
|--------|-----|
| `X-Turnkey-Signature` | HMAC-SHA256 verify (`TURNKEY_WEBHOOK_SECRET`) |
| `X-Turnkey-Event-Id` | `event_inbox` dedupe (preferred over body) |
| `X-Turnkey-Event-Type` | Inbox `event_type` |
| `X-Turnkey-Organization-Id` | Must match `TURNKEY_ORGANIZATION_ID` when present |
| `X-Turnkey-Timestamp` | Reject if &gt;5 min skew when present |

V2 deliveries without a signature are rejected unless legacy unsigned activity is explicitly allowed (`TURNKEY_WEBHOOK_ALLOW_UNSIGNED=true`). After migration stabilizes, disable allow-unsigned in production.

If verify fails with `X-Turnkey-Signature-Algorithm` / `Key-Id` set, upgrade to Turnkey SDK webhook verify (shared-secret HMAC may no longer apply).

## Webhook storage

All providers use **`event_inbox`** (`provider`, `event_id`, payload, `status`, replay via `POST /api/admin/event-inbox/replay`).

## Ops health

`GET /api/admin/ops/turnkey-webhook-health` — inbox counts, balance flags, setup route.

## One-time cleanup

```bash
cd business && npx tsx scripts/suppress-noah-turnkey-mirror-rows.ts --dry-run
cd business && npx tsx scripts/suppress-noah-turnkey-mirror-rows.ts
```
