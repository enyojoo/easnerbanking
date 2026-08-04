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
   - Events: `account.updated`, `account.external_account.created`, `account.external_account.updated`,
     `account.external_account.deleted`, `capability.updated`, `checkout.session.completed`,
     `payment_intent.succeeded`, `payout.paid`, `payout.failed`, `charge.dispute.created`,
     `charge.refunded`, `transfer.created`.
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

## Merchant setup (Settings → Verification)

1. Tier 1: complete global banking verification + Grid VA on `/accounts`.
2. Tier 3: start / continue Stripe embedded onboarding (business profile only — no bank form).
3. On submit, Easner **automatically links** the Grid VA as the Stripe payout destination when eligible.
4. Tier 3 shows **Ready** once Stripe enables transfers + payouts → Pay online on invoices.

**Invoicing → Pay online** is on by default. Turn it off to hide Tier 3 on Verification.

Manual **Link payout** appears only if auto-link fails.

### Sandbox: manually onboarded Connect accounts

If a connected account was created in the Stripe Dashboard (`acct_…`) but Settings shows “Not started”:

1. Set account metadata `easner_business_id` to the Easner business UUID, **or**
2. Set env `STRIPE_CONNECT_ACCOUNT_BY_BUSINESS_ID='{"<business-uuid>":"acct_…"}'`

The status API discovers and links the account on load.

## E2E test (test mode)

1. Complete merchant Connect setup.
2. Pay invoice → Hop 1: invoice paid, Incoming, `payment_received`.
3. Confirm transfer on connected account in Stripe Dashboard.
4. Wait/trigger payout → Hop 2: `payout_sent`.
5. Grid inbound → Hop 3: balance credited, ledger settled.

## Monitoring

- Confirm `event_inbox` receives **`account.updated`** for Connect onboarding (not just checkout events).
  Enable **Listen to events on Connected accounts** on the platform webhook.
- Status syncs from Stripe on Settings load; Grid VA payout linking runs automatically after verification.
- Payout destination reconciliation re-asserts the Grid VA as default when Stripe Dashboard edits drift.

### Auto-synced from Stripe (Connect account)

| Area | Fields | Trigger |
|------|--------|---------|
| Verification | `details_submitted`, `requirements_*`, errors, deadlines, `disabled_reason` | `account.updated`, status load |
| Capabilities | transfers, card_payments, (+ all capability keys) | `account.updated`, `capability.updated` |
| Payment flags | `charges_enabled`, `payouts_enabled` | `account.updated` |
| Payout schedule | daily/weekly schedule json | `account.updated` |
| Business profile | name, url, support email/phone, mcc, country | `account.updated` |
| Payout bank | default external account id, last4, bank name, status | external account webhooks + reconcile |
| Settlement | invoice payment + payout hops | checkout / payout webhooks |

Edits in embedded onboarding or the Stripe Dashboard are pulled back on the next webhook or Verification tab visit. Easner re-asserts the virtual account as default payout destination when it drifts.

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
