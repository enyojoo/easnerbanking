# Stripe Connect Direct Charges – Ops checklist

## Product model

- Each Easner business is the **merchant of record**. Charges are **Direct Charges** on
  that business’s connected account. The **business name** is on the card statement.
- Easner is the Connect platform only, with an optional application fee.
- Connected account auto-payouts to the Office-routed **Grid or Bridge USD/EUR VA**
  in that business’s name. ACH originator **EASNER** is a Connect payout (match to
  Incoming invoice / link / checkout). Originator **Bridge Building** is a Stripe
  Dashboard / platform payout – keep as a bank deposit.
- Grid `INCOMING_PAYMENT.COMPLETED` or Bridge VA deposit is the settlement signal
  (Hop 3). `payout.paid` on connected accounts is optional enrichment.

Connect onboarding, Direct Charges, zero platform fee, and daily payouts are **built into the app** whenever Stripe invoice payments are enabled (keys present). No extra env flags.

## Dashboard (one-time)

1. Confirm Connect: Buyers purchase from you · sellers paid individually · embedded.
2. Connected-account statement descriptor is the **business name** (Direct Charges).
3. Webhook `/api/webhooks/stripe`:
   - **Listen to events on Connected accounts** is required (charges live on `acct_…`).
   - Events: `account.updated`, `account.external_account.created`, `account.external_account.updated`,
     `account.external_account.deleted`, `capability.updated`, `checkout.session.completed`,
     `payment_intent.succeeded`, `payment_intent.payment_failed`, `charge.succeeded`,
     `payout.paid`, `payout.failed`, `charge.dispute.created`, `charge.refunded`,
     `transfer.created`, `invoice.paid`, `invoice.payment_failed`,
     `customer.subscription.updated`, `customer.subscription.deleted`.
4. Payment method domains: `business.easner.com`, `invoice.easner.com`, `pay.easner.com`,
   plus every merchant domain registered in Online Checkout settings (Payment Element on
   merchant sites needs the domain registered for wallets).
5. Prefer **disabling** merchant self-serve external account collection in embedded
   onboarding (Easner links the Office-routed VA via API). Already disabled in Account Session features.
6. **Turn off Stripe customer receipts** on connected accounts (Direct Charges live there):
   [Settings → Business → Customer emails](https://dashboard.stripe.com/settings/emails) →
   under Payments, disable **Successful payments**.
   Checkout still collects a customer email so `confirm()` can run; Stripe will mail that
   address whenever this toggle is on, even if we never set `receipt_email` on the session.
   Easner sends its own receipt from **`receipt@easner.com`**. Invoice mail stays
   `invoices@easner.com`. Connected-account Customer emails apply to Direct Charges
   on that account.

## Environment

```bash
STRIPE_SECRET_KEY=
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=
STRIPE_WEBHOOK_SECRET=
# Customer-facing hosts (default to invoice.easner.com / pay.easner.com):
NEXT_PUBLIC_INVOICE_APP_URL=
NEXT_PUBLIC_PAY_APP_URL=
# Encrypts merchant webhook signing secrets (falls back to KYB_PII_ENCRYPTION_KEY):
CHECKOUT_SECRET_ENCRYPTION_KEY=
# Optional: IANA zone for Easner checkout/link receipt “When” (else Dashboard timezone):
# EASNER_RECEIPT_TIMEZONE=Asia/Jerusalem
# Optional kill-switches only:
# STRIPE_INVOICE_PAYMENTS_ENABLED=false
# ONLINE_CHECKOUT_ENABLED=false
```

## Rollout

1. Apply migration `20260805100000_stripe_connect_platform_mor.sql`.
2. Staging: onboard a test business, link the Office-routed VA (Grid or Bridge), pay a test invoice.
3. Pilot 1–2 merchants.
4. GA once Hop 1–3 verified end-to-end.

## Merchant setup (Settings → Verification)

1. Tier 1: complete global banking verification + virtual account on `/accounts`.
2. Tier 3: start / continue Stripe embedded onboarding (business profile only – no bank form).
3. On submit, Easner **automatically links** the Office-routed virtual account as the Stripe payout destination when eligible.
4. Tier 3 shows **Ready** once Stripe enables transfers + payouts → Pay online on invoices.

**Settings → Payments → turn off online payments** to hide card/bank across Collections and Tier 3 verification. Invoice Pay online on customer pages is controlled separately under Payments → Where customers pay.

Manual **Link payout** appears only if auto-link fails.

### Sandbox: manually onboarded Connect accounts

If a connected account was created in the Stripe Dashboard (`acct_…`) but Settings shows “Not started”:

1. Set account metadata `easner_business_id` to the Easner business UUID, **or**
2. Set env `STRIPE_CONNECT_ACCOUNT_BY_BUSINESS_ID='{"<business-uuid>":"acct_…"}'`

The status API discovers and links the account on load.

## E2E test (test mode)

1. Complete merchant Connect setup.
2. Pay invoice → Hop 1: invoice paid, Incoming, `payment_received`. The charge lives on `acct_…`.
3. Confirm the Direct Charge on the connected account in Stripe (business statement name).
4. When the connected-account payout hits the Office-routed VA (Grid or Bridge), originator is **EASNER**.
   Hop 3: pack that inbound to open `payment_received` nets (FIFO), credit wallet once, settle
   the Stripe ledger. Do **not** post a second Bank Deposit.
5. A **Bridge Building** ACH on the same VA is a Dashboard payout – leave it as a bank deposit.

## Monitoring

- Confirm `event_inbox` receives Grid `INCOMING_PAYMENT.COMPLETED` for Connect (originator EASNER).
  `payout.paid` may be absent; that is expected unless connected-account events are enabled.
- Status syncs from Stripe on Settings load; virtual-account payout linking runs automatically after verification.
- Payout destination reconciliation re-asserts the Office-routed VA as default when Stripe Dashboard edits drift.

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
npx tsx scripts/stripe-connect-reconcile-settlements.ts --heal
```

Alerts:

- `payment_received` older than 7 days
- `payout_sent` older than 14 days without `credited`

`--heal` credits invoice `ETID94909659` from Grid EASNER inbound `ETID97792716`, **deletes**
that mistaken bank-deposit row, and does **not** credit the wallet again. Leaves Bridge Building
`ETID27341688` as a Dashboard deposit.

## Support notes

- Refunds before credit: use invoice refund API, or
  `POST /api/checkout/refund` with `settlement_id` for a Payment Link / website checkout payment.
- Refunds after credit: clawback required (API returns 409).
- Disputes debit the **connected account** first (Direct Charges). Platform `losses.payments: application` may still absorb negative balances commercially.
- A refund issued from the Stripe Dashboard is picked up by `charge.refunded` / `refund.created`
  and fails the matching settlement and ledger entry for both invoices and collections.

## Collections go-live (Payment Links + Online Checkout)

Payment Links and the website embed share the invoice settlement rail: one session creator
(`createOnlineCheckoutSession`), Direct Charges with `application_fee_amount`, and the
Office-routed Grid or Bridge VA hop. Settlements land in `checkout_stripe_settlements` and
the ledger source is `checkout_stripe`.

Before enabling for a merchant:

1. Apply migration `20260818140000_collections_checkout.sql`.
2. Connect account has **transfers + payouts active** and the Office-routed VA linked (same gate as
   invoice Pay online – `resolveConnectReadyForCheckout`).
3. Fee policy decided: business picks merchant net or buyer surcharge on `/checkout`; ops can
   force any of the three modes (including Easner absorbs) from the Office business profile,
   which supersedes the business choice.
4. Customer hosts resolve: `invoice.easner.com` and `pay.easner.com` both point at this app
   (middleware rewrites each host onto its own route tree).
5. Radar rules reviewed on the platform account – Collections raises card volume from
   unknown buyers, unlike invoices sent to named customers.
6. Statement descriptor: the **connected business name** is on the card. Invoices add suffix `INV <number>`.
7. Merchant webhook endpoint saved and test event delivered from `/checkout`, then two smoke
   payments with test card `4242 4242 4242 4242`: one through the hub's payment preview
   (embed path) and one on a real Payment Link at `pay.easner.com` (link path). Both should
   appear in Transactions as an Online Checkout collection. The charge must live on `acct_…`.
8. Margin report smoke test: confirm `application_fee_cents` on new sessions matches the
   settlement fee for each fee mode.

Recurring links (Stripe Billing on the **connected account**):

- Closing a recurring link cancels its active subscriptions, so no further renewals are charged.
- Renewals settle on `invoice.paid`; failures send the merchant a `checkout.failed` event with
  the subscription id so dunning can be handled on their side.

Reference: `connect-recommend-plan.md` for the product spec and fee math.
