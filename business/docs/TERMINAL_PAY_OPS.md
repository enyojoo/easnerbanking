# Stablecoin Terminal (`/terminal`, `/pay`) — production checklist

Custom flow only (in-app UI + Noah `POST /workflows/onchain-deposit-to-payment-method`). No hosted checkout.

## Merchants

1. Complete **Setup payout** on `/terminal` and save a **default** terminal payout (`terminal_settings.default_terminal_payout_id`).
2. Without a default, `POST /api/terminal/sessions` returns *Choose a default payout method on Stablecoin Terminal first.*
3. Share the **counter URL** (`/pay` on the business app origin) for in-person collection.

## Environment

- **`NOAH_TERMINAL_SOURCE_ADDRESS`**: On-chain address Noah uses as the automated-payout trigger `SourceAddress`. Required unless the client sends `source_address` on session create. Set in sandbox to a test wallet you control; in production, use the operational wallet Noah expects (or plan per-tenant config if required).
- Standard Noah env vars must be valid (`requireNoahEnv`) and the business user must pass Noah verification (`requireNoahVerificationApproved`).

## Webhooks (staging / production)

1. Configure Noah **Transaction** (and related) webhooks to the deployed ingress that runs `recordNoahWebhookDelivery` in `lib/noah/process-webhook.ts` (same pipeline as other Noah webhooks).
2. Terminal sessions use **`ExternalID` = `terminal_sessions.id`**. Webhook handling updates `terminal_sessions.status` when the linked transaction progresses.
3. **Smoke test:** create a charge, complete or simulate deposit (sandbox), confirm the row moves past `awaiting_deposit` (e.g. `deposit_detected` / `payout_complete`).

## Quote semantics

- Workflow triggers use **`GTEQ`** on a minimum crypto amount from prepare. Final on-chain amount is authoritative; slight overpay may still settle—confirm with Noah for each corridor.

## Optional estimate

- `GET /api/noah/prices` supports a **terminal preview** (indicative only): query params `terminalCrypto`, `chargeFiat` (`USD` | `EUR`), and `terminalFiatAmount` (positive decimal string). Response includes `estimatedCryptoAmount`. The **authoritative** minimum crypto is from Noah `prepare` and `terminal_sessions.crypto_amount_expected` after session creation.
