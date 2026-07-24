# Grid KYC — production confirmation (ops)

Before enabling Grid in **production**, confirm with Lightspark:

1. **Regulated / BYO KYC** — Easner submits customer identity via `POST /customers` using Noah-approved profiles (`platformCustomerId`). No hosted SumSub flow required.
2. **Platform currency enablement** — Request NGN/KES (and other EM corridors) as FX source currencies if local pay-in and cross-border quotes need non-USD sources.
3. **Webhook endpoint** — Register `POST /api/webhooks/grid` in the Grid dashboard. Set `GRID_WEBHOOK_PUBLIC_KEY` to the PEM verification key from Developers → Webhooks (not a shared secret).

Implementation assumes BYO KYC until Lightspark confirms otherwise. If unregulated mode is required, add hosted KYC/KYB + verification webhooks as a follow-up.

Docs: https://docs.lightspark.com/payouts-and-b2b/onboarding/configuring-customers
