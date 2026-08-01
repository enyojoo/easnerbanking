# Grid KYC — production confirmation (ops)

Before enabling Grid in **production**, confirm with Lightspark:

1. **Regulated / BYO KYC** — Easner submits customer identity via `POST /customers` using Noah-approved profiles (`platformCustomerId`). No hosted SumSub flow required.
2. **Platform currency enablement** — Request NGN/KES (and other EM corridors) as FX source currencies if local pay-in and cross-border quotes need non-USD sources.
3. **Webhook endpoint** — Register `POST /api/webhooks/grid` in the Grid dashboard. Set `GRID_WEBHOOK_PUBLIC_KEY` to the PEM verification key from Developers → Webhooks (not a shared secret).

## Sandbox / staging (Grid KYB cutover)

Do this for each environment (staging, sandbox) before relying on webhooks:

1. **Register webhook URL** — In Lightspark Grid dashboard → Developers → Webhooks, add:
   - URL: `https://<your-app-host>/api/webhooks/grid`
   - Events: at minimum `CUSTOMER.KYB_*` (status changes)
2. **Verify delivery** — After a KYB status change, confirm rows in `event_inbox` with `provider = 'grid'`. If empty, webhooks are not registered or the URL/key is wrong.
3. **Poll backstop** — Until webhooks are live, `POST /api/grid/sync-status` (and the client poll hook) runs the **same** sync as the webhook handler: full Grid customer GET → `persistVerificationStatus` → profile backfill → provision on approve.

Implementation assumes BYO KYC until Lightspark confirms otherwise. If unregulated mode is required, add hosted KYC/KYB + verification webhooks as a follow-up.

Docs: https://docs.lightspark.com/payouts-and-b2b/onboarding/configuring-customers
