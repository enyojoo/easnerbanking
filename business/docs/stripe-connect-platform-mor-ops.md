# Stripe Connect Platform MoR — Ops checklist

## Product model

- Customers pay **Easner** (platform MoR) — Easner appears on the card statement.
- Destination charges transfer net funds to the merchant’s **connected account**.
- Connected account auto-payouts (daily) to the merchant’s **Grid VA**.
- Grid inbound credits the merchant’s **Easner wallet balance** (existing Hop 3).

Connect onboarding, destination charges, zero platform fee, and daily payouts are **built into the app** whenever Stripe invoice payments are enabled (keys present). No extra env flags.

## Dashboard (one-time)

1. Confirm Connect: Buyers purchase from you · sellers paid individually · embedded.
2. Platform statement descriptor prefix: **EASNER**.
3. Webhook `/api/webhooks/stripe`:
   - Enable **Listen to events on Connected accounts**.
   - Events: `account.updated`, `checkout.session.completed`, `payment_intent.succeeded`,
     `payout.paid`, `payout.failed`, `charge.dispute.created`, `charge.refunded`,
     `transfer.created`.
4. Payment method domains: `business.easner.com`.
5. Prefer **disabling** merchant self-serve external account collection in embedded
   onboarding (Easner links Grid VA via API). Already disabled in Account Session features.

## Environment

```bash
STRIPE_SECRET_KEY=
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=
STRIPE_WEBHOOK_SECRET=
# Optional kill-switch only:
# STRIPE_INVOICE_PAYMENTS_ENABLED=false
```

## Rollout

1. Apply migration `20260805100000_stripe_connect_platform_mor.sql`.
2. Staging: onboard a test business, link Grid VA, pay a test invoice.
3. Pilot 1–2 merchants.
4. GA once Hop 1–3 verified end-to-end.

## Merchant setup (Settings → Invoicing)

1. Tier-1 verification complete + Grid VA provisioned.
2. Start / continue Stripe embedded onboarding.
3. Link Grid VA as payout destination.
4. Status shows **Ready** → Pay online appears on invoices.

## E2E test (test mode)

1. Complete merchant Connect setup.
2. Pay invoice → Hop 1: invoice paid, Incoming, `payment_received`.
3. Confirm transfer on connected account in Stripe Dashboard.
4. Wait/trigger payout → Hop 2: `payout_sent`.
5. Grid inbound → Hop 3: balance credited, ledger settled.

## Monitoring

```bash
npx tsx scripts/stripe-connect-reconcile-settlements.ts
```

Alerts:

- `payment_received` older than 7 days
- `payout_sent` older than 14 days without `credited`

## Support notes

- Refunds before credit: use invoice refund API (`reverse_transfer: true`).
- Refunds after credit: clawback required (API returns 409).
- Disputes debit the **platform**; reverse transfer manually if needed.
