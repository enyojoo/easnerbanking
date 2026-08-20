# Recommended Connect integration

Product: **Online Checkout** for Easner Business – dashboard Payment Links (one-time, recurring, and stablecoin / QR Pay), website embed, later Checkout API. Sidebar: **Spending** then **Collections** (Invoices, Checkout, Links, Terminal). Card/bank funds settle to Easner Balance on the same destination-charge rail as invoice Pay online.

Decisions locked 2026-08-15. Visual companion: Cursor canvases `online-checkout-connect.canvas.tsx`, `collections-ux-spec.canvas.tsx`.

## Product offer (Easner Business)

Bring **Collections** back in the sidebar. Group money-out under **Spending** (not Spend): Collections / Spending are parallel category nouns – inbound vs outbound. Spend reads as a verb next to Send.

### Information architecture (sidebar)

Nav labels are short; page titles use full product names (e.g. sidebar **Checkout** → page **Online Checkout**).

```
Home
Spending
  Send
  Cards
  Payroll
Collections
  Invoices
  Checkout
  Links
  Terminal
Transactions
Accounts
```

Operator routes: `/invoices`, `/checkout`, `/links`, `/send`, `/cards`, `/payroll`, `/terminal`. QR Pay placards live under `/links` (no `/qr-pay` route or redirect).

| Nav label | Page title | Role |
| --- | --- | --- |
| **Invoices** | Invoices | B2B receivables: create, send, remind, pay. |
| **Checkout** | Online Checkout | Website embed (and later Checkout API). Collect on the merchant’s site. |
| **Links** | Payment Links | Create and share links: one-time, recurring, stablecoin (QR Pay placards until unified create ships). |
| **Terminal** | Terminal | In-person collections. |
| **Send / Cards / Payroll** | (same) | Outbound spend, grouped under Spending. |

### Checkout surfaces (under Online Checkout + Payment Links)

| Surface | Operator experience | Customer experience | v1 |
| --- | --- | --- | --- |
| Payment Links | Create, copy, archive; pick one-time, recurring, or stablecoin | Easner-hosted pay page or QR/placard | Yes |
| Website embed | Snippet + Easner session API (Online Checkout) | Payment Element on merchant.com | Yes |
| Checkout API | Developers keys, webhooks | Custom cart | Follow-up, same backend |

Do not give businesses Stripe keys or Stripe Dashboard. Do not send customers to `pay.stripe.com`. Card and bank Payment Links use Easner URLs that create Checkout Sessions on the platform. Stablecoin links reuse the existing QR Pay / autopayout rail into Easner Balance – not Stripe.

Recurring (card/bank) Payment Links use Stripe Billing on the platform (`mode: subscription`) with `transfer_data.destination` to the connected account. Easner owns cancel, pause, and failed-payment UX. Stripe Billing has a separate price list – see [stripe.com/billing/pricing](https://stripe.com/billing/pricing).

### Online Checkout page (merchant checklist)

Route: `/checkout` under Collections – not a Settings tab. Settings → Verification remains the single Connect onboarding. This page is the website-embed setup. Hide keys and live toggle until `resolveConnectReadyForCheckout` is true.

| Step | Merchant action | Easner stores |
| --- | --- | --- |
| 1. Online payments | Same status as invoice Pay online | Existing Connect row |
| 2. Website | Allowlisted origin(s), e.g. `https://shop.acme.com` | `checkout_allowed_origins` |
| 3. Return URLs | Default success + cancel; `{CHECKOUT_SESSION_ID}` supported | `checkout_success_url`, `checkout_cancel_url` |
| 4. API keys | `easner_pk_test/live` (browser) and `easner_sk_test/live` (server, shown once). Checkout-scoped secret preferred so a leak cannot send payroll. | Developers keys, or a restricted key minted here |
| 5. Snippet | `js.easner.com/checkout.js` + `EasnerCheckout.mount(#el, { publishableKey, clientSecret })` | Optional appearance (color, font) |
| 6. Create session | `POST /v1/checkout/sessions` with `mode: payment \| subscription`, amount, line items. Returns `client_secret`. Amount set server-side. | Checkout session row |
| 7. Webhook | HTTPS URL + signing secret. Events: `checkout.completed`, `checkout.async_succeeded`, `checkout.failed`, `payment.available`, `subscription.updated`, `subscription.canceled`. Easner names, not Stripe’s. | Developers webhooks or a checkout-specific endpoint |
| 8. Test payment | Test card through the Element; shows on Transactions as Online Checkout | Test-mode session |

Their site owns catalog and cart. This screen owns credentials and the embed. Stripe stays on the platform.

Sketch: Cursor canvas `online-checkout-settings.canvas.tsx`. Full domains + operator UX: `collections-ux-spec.canvas.tsx`.

---

## Customer domains & UX spec

**Operator dashboard:** `business.easner.com` – Collections, Spending, Settings, Developers.

**Customer pay surfaces** use dedicated hosts so pay links are not confused with the business app:

| Surface | Who | Host |
| --- | --- | --- |
| Dashboard, setup, keys | Business | `business.easner.com` |
| **Invoices** (view + Pay online) | Customer | `invoice.easner.com` |
| **Payment Links** + thank-you pages | Customer | `pay.easner.com` |
| Website embed script | Merchant site | `js.easner.com/checkout.js` |
| Session API | Merchant server | `api.easner.com` |

**Online Checkout** does **not** host shoppers on `pay.easner.com`. Customers pay on the merchant’s site. `pay.easner.com` is for Payment Links, stablecoin charge sessions, and optional thank-you redirects – not website embed.

### URL patterns (locked)

**Canonical paths** (when business has @easetag set):

```
invoice.easner.com/{easetag}/{invoiceNumber}     Invoice view + Pay online
pay.easner.com/{easetag}/{slug}                  Payment Link (card/bank one-time or sub)
pay.easner.com/{easetag}/{sessionId}             Stablecoin charge session
pay.easner.com/thanks                            Default Payment Link success (optional per-link redirect)

business.easner.com/checkout                     Online Checkout integration hub
business.easner.com/links                        Payment Links – create & manage
```

**No @easetag yet** – same hosts, shorter paths (matches today’s invoice behavior in `buildInvoiceCustomerViewPath`):

```
invoice.easner.com/{invoiceId}                   Single segment – invoice row UUID
pay.easner.com/plink_{hex32}                     Payment Link – typed public id (see below)
pay.easner.com/{sessionId}                       Stablecoin – terminal session UUID (standard shape)
```

**Payment link public id (locked):** prefix `plink_` + 32 hex chars (UUID without dashes). Example: `plink_550e8400e29b41d4a716446655440000`. Never a raw UUID for links – that removes ambiguity with stablecoin session ids on one-segment `pay.easner.com` paths. Helper: `business/lib/payment-links/public-id.ts`.

When the business later sets @easetag, **new** share links use the two-segment canonical form. Old one-segment links keep working (no broken emails or QR codes).

### @easetag optional – how routing works

`{easetag}` is **only in the URL when the business has set @easetag**. If not set, one-segment fallbacks still work.

| Host | Segments | Resolver |
| --- | --- | --- |
| `invoice.easner.com` | 2 | `easetag` + `invoiceNumber` → public invoice API |
| `invoice.easner.com` | 1 | `invoiceId` (UUID) → public by-id API |
| `pay.easner.com` | 2 | `easetag` + second segment: if UUID → terminal session (stablecoin); else → payment link slug for that business |
| `pay.easner.com` | 1 | `plink_{hex32}` → payment link; UUID v4 → terminal session |

Second segment on `pay.easner.com/{easetag}/…` disambiguates **without** a `/l/` or `/charge/` prefix: human slug vs session UUID are different shapes. No collision between `acme/pro-plan` and `acme/8f3c…-session`.

**Share sheet copy** uses the best URL for the business today:

- Has easetag → `pay.easner.com/{easetag}/{slug}` or `invoice.easner.com/{easetag}/{invoiceNumber}`
- No easetag → one-segment fallback; UI nudges “Add @easetag for shorter links” (existing `easetagHint` copy)

**Cleanup on migration:** Stripe invoice `return_url` today uses literal `pay` when easetag is missing (`/invoice/pay/{invoiceNumber}`). Align to `invoice.easner.com/{invoiceId}` or canonical two-segment once easetag exists.

**Migration (v1 or follow-up):**

- `business.easner.com/invoice/…` → `invoice.easner.com/…`
- `business.easner.com/qr-pay` – removed; use `/links`
- `business.easner.com/pay/charge/{id}` → `pay.easner.com/{easetag}/{sessionId}` or `pay.easner.com/{sessionId}`
- `business.easner.com/online-checkout` → `/checkout` (if introduced)
- Do **not** use `business.easner.com/pay/…` for new card Payment Links

### Merchant path (“I need to collect money”)

```
No website / share a link / Instagram / QR
  → Collections → Payment Links → create → copy pay.easner.com/…

Shop with dev (Woo, custom, Webflow)
  → Collections → Online Checkout → website + keys + snippet + webhook

Bill known customers with terms
  → Collections → Invoices → customer gets invoice.easner.com/…
```

### Online Checkout – operator UX

**Not** “create a site.” **Connect your website.**

**Route:** `business.easner.com/checkout` (Collections → Online Checkout).

**Layout:** readiness banner + checklist (left) + detail panel (right).

| Step | Merchant does | Easner stores |
| --- | --- | --- |
| 1. Online payments | Same Ready gate as invoices | Connect row |
| 2. Your website | Allowlisted origin(s) `https://shop.acme.com` | `checkout_allowed_origins` |
| 3. Return URLs | Default success / cancel on *their* domain | `checkout_success_url`, `checkout_cancel_url` |
| 4. API keys | `easner_pk_*` + checkout-scoped `easner_sk_*` | Developers / restricted key |
| 5. Add to your site | Snippet + server example + webhook docs | Appearance optional |
| 6. Test | Test card in preview panel on business.easner.com | Test session |
| 7. Go live | Switch test → live keys | Live badge |

**Deliverables on the page:**

- Snippet: `checkout.js` + `EasnerCheckout.mount(#el, { publishableKey, clientSecret })`
- Server example: `POST api.easner.com/v1/checkout/sessions` on Pay click
- Webhook URL + signing secret + Easner event names
- Optional v1: integration pack zip, link to Developers logs, Element appearance (color/logo)

**Merchant builds:**

```
merchant.com/checkout
  → their server: create session (secret key, amount)
  → their page: mount Element (client_secret)
  → their server: webhook → fulfill
```

### Payment Links – operator UX

**Route:** `business.easner.com/links` (absorbs QR Pay).

**List:** active / archived – name, type (one-time / recurring / stablecoin), amount, link, payment count, created. **Create payment link** CTA.

**Create flow** – one form, sections (locked: **single form with rail toggle**, not separate nav products):

1. **What are you collecting?** – One-time (card/bank) · Recurring (card/bank) · Stablecoin (QR/wallet)
2. **Details** – label, amount, currency, description; if recurring: interval (month/year), optional trial
3. **After payment** – default Easner thank-you on `pay.easner.com`; optional redirect URL
4. **Create** → share sheet

**Share sheet:** `https://pay.easner.com/{easetag}/{slug}` (or one-segment fallback) · copy link · download QR/placard · open preview · archive (edit label only if payments exist – void & recreate for amount changes)

**Customer on pay.easner.com:** business logo + name · amount + description · card/bank = Payment Element · stablecoin = charge/QR flow · recurring = first payment + interval copy · success = thank-you or redirect. No Stripe URL. No merchant Stripe keys.

### Online Checkout vs Payment Links

| | Online Checkout | Payment Links |
| --- | --- | --- |
| Merchant skill | Dev / agency | No dev |
| Customer stays on | `merchant.com` | `pay.easner.com` |
| Merchant gets | Keys, snippet, API, webhook | Create form, copy link, QR |
| Catalog / cart | Merchant’s | Fixed amount on link |
| Subscriptions | Server: `mode: subscription` | Create: recurring |
| Stablecoin | Not this product | Same create flow |
| Customer host | Merchant site | `pay.easner.com` |

Same Connect destination-charge rail and **merchant net** fees for card/bank on both.

### v1 UX scope (locked)

- **Payment Links:** full create / list / share / archive; QR Pay redirects here; stablecoin in same create flow; customer pages on `pay.easner.com`
- **Online Checkout:** integration hub only (checklist, keys, snippet, server sample, webhook, test preview). No hosted checkout page builder on Easner
- **Invoices:** customer pages on `invoice.easner.com/{easetag}/{invoiceNumber}`; redirect legacy `business.easner.com/invoice/…`

---

## Recommended Connect integration

### A. Account configuration

Accounts API: `/v2/core/accounts`  
Legacy account `type`: not used  
Dashboard: none (you build all seller-facing UIs)  
Fee collection: your platform manages pricing (`fees_collector: "application"`)  
Negative balance liability: your platform (`losses_collector: "application"`)

Easner is a white-label banking layer: businesses never see Stripe, and collected funds must land in Easner Balance via the Grid virtual-account payout, not stay in a seller Stripe balance. Dashboard none plus platform-owned pricing and negative balance liability is the allowed combination for that model. Existing connected accounts already use the equivalent v1 controller properties (`stripe_dashboard.type: none`, `fees.payer: application`, `losses.payments: application`). Reuse those accounts for Online Checkout. Create **new** accounts with Accounts v2; do not introduce legacy `type: custom | express | standard`.

Each connected account needs recipient configuration (`configuration.recipient`) with `stripe_transfers` on `stripe_balance` requested, so the account can receive transfers from the platform. Marketplace-style recipient accounts should not request merchant configuration or `card_payments` for this charge pattern – that lengthens onboarding. Existing v1 rows currently request both `transfers` and `card_payments`; do not expand that for Checkout. Leave a later cleanup to drop unused `card_payments` if onboarding friction shows up.

Compatibility: `dashboard: "none"` + `fees_collector: "application"` + `losses_collector: "application"` + destination charges is **allowed**.

### B. Charge pattern: destination charges

The customer pays through Easner-provided checkout (hosted Payment Link or embed). Easner is merchant of record. Stripe charges the platform, then automatically transfers to the connected account, which already payouts daily to the Grid VA and credits Easner Balance. Direct charges would make the business merchant of record and treat the connected-account Stripe ledger as the primary balance – that breaks the invoice settlement path you asked to reuse.

Do not set `on_behalf_of` in v1. That would put the connected account on the card statement and as settlement merchant, with extra merchant KYC. Invoice Pay online already stays Easner merchant of record with a statement descriptor suffix. Match that for Checkout.

### C. Business onboarding flow

Onboarding method: embedded.

Embedded onboarding keeps verification inside Easner Business (already the invoice Pay online setup). Stripe-hosted redirect would leak Stripe chrome and fight dashboard none. API-only onboarding would force Easner to rebuild requirement remediation whenever Stripe adds fields.

Flow:

1. Business completes Easner Tier 1 KYB.
2. Platform creates or reuses the connected account (v2 going forward).
3. Business completes embedded `account_onboarding` in Settings.
4. Stripe verifies identity and bank/payout requirements.
5. Platform links the Grid virtual account as the external payout destination.
6. Before any Checkout Session, gate on recipient `stripe_transfers` (and payouts) active, details submitted, no outstanding requirements, and VA linked – same `resolveConnectReadyForCheckout` gate as invoices.
7. `notification_banner` stays mounted so new requirements surface in-product. Live charges only when capabilities are active.

### D. Payments dashboard access for businesses

Connected accounts do not log into Stripe Dashboard. Easner Business is the only operator UI: Payment Links, transactions, refunds, payouts to Easner Balance, and Connect status. Connect embedded components are the Stripe-facing pieces inside that UI.

**Warning:** dashboard none means Easner must own onboarding remediation, refund initiation, dispute response, and payout/earnings views. Invoice Pay online already accepted that cost. Online Checkout does not add a seller Stripe Dashboard; it adds merchant website UX and Easner Payment Links. Day-one Checkout still needs refund from the Easner transaction (already true for invoices). Dispute response should use the `payments` / `disputes_list` embedded components rather than a from-scratch flow.

### E. Embedded components

Recommended [Connect embedded components](https://docs.stripe.com/connect/supported-embedded-components):

- `account_onboarding`
- `notification_banner` (required; keeps connected accounts aware of new requirements so they stay enabled)
- `account_management`
- `payments` (reduced detail on destination charges)
- `payouts`
- `balance_report` / `payout_reconciliation_report` as reporting is needed

Destination-charge caveat: payment and dispute views show reduced detail compared with direct charges. That is acceptable because Easner already reconstructs settlement in its own ledger (`payment_received` → clearing → available).

### F. Webhook integration

Use webhooks for reliable payment confirmation, especially for async payment methods. Always verify incoming webhook signatures before processing event data ([webhook signature verification](https://stripe.com/docs/webhooks/signatures)). Specific events and implementation details are covered in the build skill.

### G. Onboarding status gating

Verify capability statuses with `stripe.v2.core.accounts.retrieve(id)` before enabling payouts and transfers:

- Destination: `configuration.recipient.capabilities.stripe_balance.stripe_transfers.status === 'active'`
- Also check `configuration.recipient.capabilities.stripe_balance.payouts.status`
- Do not use v1 `charges_enabled` / `payouts_enabled` as the source of truth for new gating (existing invoice code still reads those columns – migrate the gate when Accounts v2 lands)

Until v2 retrieve is wired, keep the current readiness check (details submitted, transfers enabled, payouts enabled, external account linked, Tier 1, Grid VA) so Checkout cannot start ahead of invoices.

### H. Fee structure

- **Locked: merchant net.** Customer pays the listed amount. Easner Balance is credited net after Stripe processing. Easner’s *product* take on the payment is **0% / $0 today** and can be raised later without changing the rail.
- **Always set `application_fee_amount` (do not send 0).** Formula:

  `application_fee_amount = stripe_processing_estimate + easner_platform_take_cents`

  Today `easner_platform_take_cents = 0`, so the application fee equals the Stripe estimate only (`applicationFeeIncludes: "stripe_fee_estimate"`). That recovers processing from the destination transfer so the platform does not subsidize cards. Tomorrow, increase `easner_platform_take_cents` or a percent – same Checkout Session fields.
- Recurring: `application_fee_percent = stripe_estimate_percent + easner_take_percent` with `easner_take_percent = 0` today. Billing add-ons: [stripe.com/billing/pricing](https://stripe.com/billing/pricing).
- Customer pays Easner (platform merchant of record). Stripe processing is billed to the platform on destination charges. The connected account receives gross minus application fee; Grid VA payout credits Easner Balance with that net. Show **gross / processing / net** on the transaction. Rates: [stripe.com/pricing](https://stripe.com/pricing). Monitor the [Connect margin report](https://docs.stripe.com/connect/margin-reports.md).
- Invoice Pay online currently omits `application_fee_amount` (full transfer; platform can eat Stripe). **Align invoices to the same helper** so Checkout, Payment Links, and invoices share economics.
- Do not use Platform Pricing Tool at the same time as explicit `application_fee_amount`.
- Do not default to buyer surcharge. Optional later: per-business “add processing at checkout.”

Funds flow (one-time, illustrative $100; actual Stripe rate is not this number):

```
Customer pays $100
        │
        ▼
┌───────────────────┐
│ Easner (platform) │  charge on platform
│                   │  application_fee = Stripe estimate + $0 Easner take
│                   │  platform net on the payment ≈ $0 today
└─────────┬─────────┘
          │ destination transfer (≈ $100 minus application_fee)
          ▼
┌───────────────────┐
│ Connected account │  Stripe balance (transient)
└─────────┬─────────┘
          │ daily payout to Grid VA
          ▼
┌───────────────────┐
│ Easner Balance    │  ~$96.80 available (illustrative)
└───────────────────┘
```

**Warning:** If `application_fee_amount` is omitted or 0, destination charges leave Stripe processing on the platform and plan-included Checkout loses money as volume grows. Wiring the field now with a 0% Easner take is what makes a future take-rate a config change. Check [stripe.com/pricing](https://stripe.com/pricing) and the margin report.

### I. SaaS monetization

Monetize Online Checkout as a **recurring Business plan feature**. `application_fee_amount` is wired on every charge: Stripe estimate + `easner_platform_take` (0 today). Raising the take later is a pricing-config change, not a new Connect pattern. Do not also configure Platform Pricing Tool.

Do **not** use `customer_account` / v2 customer configuration to bill connected accounts for the Easner plan unless you later move plan billing onto Stripe Billing. Today the plan is Easner’s own subscription, separate from Connect. Recurring **Payment Links** (end-customer → business) are marketplace-style destination subscriptions on the platform, not SaaS billing of the connected account.

Do not create a separate v1 Customer object in order to bill connected accounts.

### J. Implementation plan

1. **Account setup** – Reuse `business_stripe_connect_accounts`. Keep dashboard none / platform fees / platform losses. New accounts via `/v2/core/accounts` with `configuration.recipient` and `stripe_transfers`. Do not add a second connected account per business for Checkout.
2. **Onboarding** – Same Settings Connect panel, embedded `account_onboarding` + `notification_banner`. Checkout and card/bank Payment Links share `resolveConnectReadyForCheckout`. Stablecoin links keep the existing QR Pay / autopayout eligibility.
3. **Nav & domains** – Enable Collections + Spending. Deploy `invoice.easner.com` and `pay.easner.com`. Redirect legacy invoice and `/pay/charge` URLs. QR Pay UI at `/links` only.
4. **Payments and fund flow**
   - Generalize `createInvoiceCheckoutSession` into `createOnlineCheckoutSession({ source: invoice | payment_link | embed })` with `ui_mode: "elements"`, `payment_intent_data.transfer_data.destination`, no `on_behalf_of`.
   - Payment Links dashboard at `/links` (absorbs QR Pay placards): amount, description, rail = card/bank vs stablecoin, one-time vs interval, copy URL or download placard, archive.
   - One-time: Checkout Session `mode: "payment"` + `application_fee_amount = stripe_estimate + easner_take` (`easner_take = 0` today). Shared helper for invoices and Checkout – never omit the field.
   - Recurring: Checkout Session `mode: "subscription"` + `subscription_data.transfer_data.destination` + `application_fee_percent = stripe_estimate_percent + easner_take_percent` (`easner_take_percent = 0` today). Prices and Customers live on the **platform**.
   - Website embed: Easner publishable key + `client_secret`; merchant never sees `acct_`.
   - Persist sessions in a source-agnostic table (nullable `invoice_id`). Credit ledger `source: checkout_stripe` vs `invoice_stripe` with the same payment_received → clearing → available phases.
5. **Webhooks and gating** – Extend the existing checkout-completed and payout handlers; do not fork a second settlement machine. Verify signatures. Gate on v2 recipient transfer/payout capabilities when available.
6. **Go-live** – Confirm transfers + payouts active, VA linked, refund + dispute path in Easner UI, Radar on the platform account, statement descriptor suffix = business name, margin report after first live traffic. Recurring: cancel/pause in dashboard and failed-payment customer messaging before launch. Nav: Collections and Spending live; QR Pay reachable only via Payment Links.

### K. Risk and liability

- Negative balance liability owner: your platform. Destination-charge disputes debit the platform first. Platform-owned negative balance liability lets connected-account balances go negative when needed so you can reverse the transfer and recover. Refunds should reverse the transfer. Build that recovery; it is not automatic on disputes.
- Risk controls owner: your platform (Radar on the platform account). Destination charges use the platform’s payment method configuration unless `on_behalf_of` is set. Fraudulent charges hit the platform balance.

**Compatibility notes**

- Stripe’s generic guidance prefers direct charges for Billing and Payment Links. Stripe still documents destination charges for both. Stay on destination charges so settlement matches invoices. Accept extra platform-side Billing operations (Easner must create, update, and cancel subscriptions; connected accounts cannot manage them without a full Stripe Dashboard).
- Hosted/embedded Stripe Checkout uses **platform** branding on destination charges. That is why v1 uses Payment Element (`ui_mode: "elements"`), not Stripe-hosted Checkout or Stripe Payment Link URLs.
- `on_behalf_of` is deferred (out of the standard recommend path). Revisit only if card-statement branding must be the business legal name.

### L. Why this fits your business

- Easner sells banking and collections, not a seller Stripe account. Dashboard none and destination charges keep Easner as merchant of record and keep the Grid VA → Easner Balance hop intact.
- Collections vs Spending is the operator IA: money in (invoices, checkout, links, terminal) vs money out (send, cards, payroll). Payment Links absorb QR Pay so one-time, recurring, and stablecoin share one create-and-share surface.
- Plan-included pricing; merchant net on cards. `application_fee_amount` is always set (Stripe estimate + 0% Easner take today) so a future take-rate does not require a new funds flow.
- Recurring is still destination charges (Stripe Billing on the platform), so one-time and subscription payments share Connect accounts, payouts, and ledger phases.

### M. Open questions

- Statement descriptor suffix format for Payment Links (business name vs easetag vs product name).
- Stripe Tax: collect on Payment Links or leave tax to the business in v1.
- Recurring intervals in v1 (monthly only vs weekly/monthly/yearly).
- Optional later: buyer-surcharge toggle (“add processing at checkout”). Not v1.

---

## In your code vs Dashboard vs runtime

**In code:** destination Checkout Sessions and subscriptions, `application_fee_amount` / `application_fee_percent` math, transfer reversals on refunds and disputes, webhook handlers, Payment Links CRUD, embed snippet, Connect readiness gate.

**In the Stripe Dashboard (platform only):** Connect platform profile, Radar, payment method settings for the platform, Billing configuration, margin report. Connected accounts have no Dashboard.

**During onboarding and runtime:** capability activation, VA linked as payout destination, account-state transitions via `notification_banner`, live charges only when recipient transfers (and payouts) are active.
