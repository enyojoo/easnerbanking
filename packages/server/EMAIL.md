# Email entry points (Easner monorepo)

Consumer-facing HTML templates live under **`packages/server/lib/`** (`email-templates.ts`, `email-generator.ts`, `email-service.ts`, `email-theme.ts`, `email-audience.ts`). The **business** app adds invoice PDF delivery via `business/lib/invoice-email-service.ts` (SendGrid, not the shared template registry).

## Architecture (ledger-aligned)

Transaction and verification emails are **not** driven by legacy remittance status (`pending` / `processing` / `completed`). They fire from the same ledger events as mobile push:

1. **`deriveTransactionNotification`** (`packages/shared/src/transactions/derive-transaction-notification.ts`) – channel-agnostic descriptor from live `Transaction` rows (provider, direction, metadata, outcome).
2. **`dispatchTransactionNotification`** (`business/lib/notifications/dispatch.ts`) – resolves audience, checks `communication_preferences`, sends push + email.
3. **Chokepoints**: `business/lib/ledger/transactions.ts` (settled / failed / cancelled), `bank-deposit-settled-notify.ts`, `easetag-transfer-notify.ts`, `global-payout-notify.ts`, `sync-user.ts` (KYB/KYC transitions).

Audience (`business` | `personal`) is resolved in `business/lib/notifications/resolve-email-audience.ts` and threaded through `emailService.sendEmail`.

## Rollout flag (ledger transaction emails)

Ledger **transaction** emails (deposit, payout, wallet send, stablecoin receive – settled / failed) are **on by default**. Set `LEDGER_TRANSACTION_EMAIL_ENABLED=false` to disable platform-wide (e.g. rollback). User-level opt-out still uses **Settings → Communication → Email notifications**.

Welcome, KYB/KYC, team invite, security, and invoice emails are always subject to normal preference rules (not gated by this env flag).

## Environment variables

| Variable | Required | Purpose |
|----------|----------|---------|
| `SENDGRID_API_KEY` | Yes | SendGrid API authentication |
| `SENDGRID_FROM_EMAIL` | Recommended | Personal / default from address |
| `SENDGRID_FROM_NAME` | Recommended | Personal from display name |
| `SENDGRID_FROM_EMAIL_BUSINESS` | Recommended | Business from address (falls back to `SENDGRID_FROM_EMAIL`) |
| `SENDGRID_FROM_NAME_BUSINESS` | Recommended | Business from display name |
| `SENDGRID_FROM_EMAIL_INVOICES` | Optional | Invoice to-customer from address (default **`invoices@easner.com`**). Not required in env. |
| `SENDGRID_FROM_NAME_INVOICES` | Optional | Invoice from display name (defaults to `SENDGRID_FROM_NAME_BUSINESS`) |
| `SENDGRID_FROM_EMAIL_RECEIPTS` | Optional | Checkout / Payment Link receipt from (default **`receipt@easner.com`**). Not required in env; same pattern as invoices. |
| `EASNER_RECEIPT_TIMEZONE` | Optional | IANA zone for checkout/link receipt “When” (else Stripe Dashboard timezone, else UTC) |
| `SENDGRID_REPLY_TO` | Recommended | Reply-to / support routing |
| `EASNER_COMPLIANCE_OPS_EMAIL` | Optional | Internal KYB/KYC lifecycle alerts (default **`compliance@easner.com`**; `EASNER_KYB_OPS_EMAIL` still supported) |
| `LEDGER_TRANSACTION_EMAIL_ENABLED` | Optional | Default **on**. Set `false` to disable ledger transaction emails platform-wide |
| `NEXT_PUBLIC_MOBILE_APP_URL` | Optional | Personal email / universal-link origin (default `https://app.easner.com`) |
| `EASNER_APP_STORE_URL` | Optional | iOS App Store listing for download emails / marketing |
| `EASNER_PLAY_STORE_URL` | Optional | Google Play listing for download emails / marketing |
| `EASNER_DOWNLOAD_PAGE_URL` | Optional | QR + smart redirect page (default **`https://www.easner.com/app`**) |
| `MARKETING_APP_DOWNLOAD_EMAIL_ENABLED` | Optional | Default **on** when `SENDGRID_API_KEY` is set. Set `false` to disable easner.com popup sends |

Before deploy, run:

```bash
node packages/server/scripts/verify-sendgrid-env.mjs
```

### Preview all templates (SendGrid)

Send one real message per template to a test inbox (uses fixture data, not live ledger events):

```bash
# from repo root – loads business/.env.local for SENDGRID_API_KEY
npx tsx packages/server/scripts/send-all-email-previews.ts --to enyocreative@gmail.com

# optional: use first_name from public.users for that email
npx tsx packages/server/scripts/send-all-email-previews.ts --to enyocreative@gmail.com --from-db

# single template / dry run
npx tsx packages/server/scripts/send-all-email-previews.ts --template welcomePersonal --to you@example.com
npx tsx packages/server/scripts/send-all-email-previews.ts --dry-run
```

Ledger **transaction** emails in production are **on by default**; set `LEDGER_TRANSACTION_EMAIL_ENABLED=false` to turn them off. This script sends template previews directly and bypasses that flag.

## Supabase Auth emails (OTP / password reset)

Supabase sends signup verification and password-reset OTP mail from **Auth → Email Templates** (not SendGrid). HTML is generated from the same frame as transactional mail:

```bash
npm run email:render-supabase-auth
```

Output: [`packages/server/supabase-auth-templates/`](supabase-auth-templates/) – paste into Supabase Dashboard. See that folder’s README for which file maps to which template. Both use `{{ .Token }}` for the 6-digit code.

**Supabase “Invite user”** (magic link via `inviteUserByEmail`) is **not used** for business team invites. Leave that dashboard template unchanged.

## Business team invites

Flow: owner invites via **Settings → Team** → `POST /api/settings/team` upserts `business_memberships` (`status: invited`) → SendGrid **`teamInvitation`** email → invitee opens **`/auth/join/{membershipId}`** → signup or login → **`POST /api/auth/bootstrap`** with `membershipId` claims the invite (links `users.easner_business_id`, activates membership) → SendGrid **`teamMemberJoined`** email to org owner and admins. New invitees still receive Supabase **Confirm signup** OTP mail; that is separate from the team invite email. Legacy query links (`/auth/join?membership=…`) redirect to the path form.

| Route | Purpose |
|-------|---------|
| `GET /api/auth/invite-preview` | Public org name + role for join landing |
| `POST /api/auth/bootstrap` | Claim invite when `membershipId` is sent (skips new org + owner welcome) |

## HTTP routes

| Route | App | Purpose |
|-------|-----|---------|
| `POST /api/send-email-notification` | **business** | Admin transaction notices only (`type: admin-transaction`). User `type: transaction` returns **410 deprecated**. |
| `POST /api/notifications/security-alert` | **business** (mobile + web) | Security alert emails (password changed, MFA enabled/disabled). |
| `POST /api/invoices/send-email` | **business** | Invoice PDF to **customer** – not gated by marketing toggles (operational). |
| `GET` / `PATCH /api/settings/communication` | **business** | Read/update `users.communication_preferences` (shared with mobile). |
| `POST /api/settings/push-token` | **business** | Register Expo push tokens; sends new-device security email on first device. |
| `POST /api/auth/bootstrap` | **business** | Welcome email for new org owners; **team invite claim** when `membershipId` is sent. |
| `GET /api/auth/invite-preview` | **business** | Pending invite preview for `/auth/join`. |
| `POST /api/settings/team` | **business** | Team invitation emails on invite POST (`/auth/join/{membershipId}` link). |
| `POST /api/marketing/app-download-link` | **business** | easner.com “Get the app” popup – sends **`appDownloadLink`** to visitor email (public, CORS for `easner.com`). |

Mobile sets `EXPO_PUBLIC_API_URL` to the business app origin and must send `Authorization: Bearer` for user-triggered notification calls.

## Personal (Easner Mobile) email links

Personal SendGrid templates use **`https://app.easner.com/user/*`** universal links (see `packages/shared/src/mobile-personal-links.ts`):

| Email CTA | URL |
|-----------|-----|
| Welcome / KYC approved | `https://app.easner.com/user/dashboard` |
| Transaction detail | `https://app.easner.com/user/transactions/{id}` |
| Email preferences footer | `https://app.easner.com/user/notifications` |

Override origin with `NEXT_PUBLIC_MOBILE_APP_URL` in the business app env. Mobile handles these paths in `pendingDeepLinkNavigation.ts` (native) and `linking.ts` (web).

## Marketing app download email (easner.com)

Template key: **`appDownloadLink`** (`packages/server/lib/email-templates.ts`).

| Field | Value |
|-------|--------|
| **Trigger** | `POST /api/marketing/app-download-link` with `{ "email": "visitor@example.com" }` |
| **From** | `SENDGRID_FROM_EMAIL` / **Easner** (`noreply@easner.com`) |
| **Subject** | Your Easner app download link |
| **CTAs** | Single **Get the app** button → `EASNER_DOWNLOAD_PAGE_URL` (`www.easner.com/app`; smart redirect on the website) |
| **Rate limit** | 10 requests/hour per IP, 3/hour per email |
| **CORS** | `https://www.easner.com`, `https://easner.com` (via `business/lib/cors.ts`) |

Website integration example:

```ts
await fetch("https://api.easner.com/api/marketing/app-download-link", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email }),
})
```

Preview: `npx tsx packages/server/scripts/send-all-email-previews.ts --template appDownloadLink --to you@example.com`

## Business email branding

- Product name in profile: **Easner Business Banking** (`email-audience.ts`).
- SendGrid from name: **Easner Business** (`SENDGRID_FROM_NAME_BUSINESS`).
- Subjects use **Easner Business** for security and welcome; **KYB** uses org name when available (**{businessName} KYB verification …**).
- **KYB lifecycle** emails go to active org **Owner + Admin**, plus internal **`compliance@easner.com`** (override with `EASNER_COMPLIANCE_OPS_EMAIL` or legacy `EASNER_KYB_OPS_EMAIL`). Merchant recipients share org-centric copy; compliance receives a separate Office-linked ops template (`kybOpsNotification`).
- **Personal KYC lifecycle** emails go to the mobile user, plus the same compliance inbox with `kycOpsNotification` (Office user link).
- Email header: **no product subtitle** under the H1 (logo + title only), same as personal.
- Transaction CTAs: `https://business.easner.com/transactions/{id}`; preferences: `/settings/communication`.

## Invoice emails (to customers)

Separate from the shared template registry (`business/lib/invoice-email-service.ts`).

| Field | Value |
|-------|--------|
| **From** | **Easner Business** – `SENDGRID_FROM_EMAIL_INVOICES` (default **`invoices@easner.com`**). Does **not** use `SENDGRID_FROM_EMAIL_BUSINESS` (`business@easner.com`). |
| **Reply-To** | Org **Settings → Business → Support Email**; else org owner email; else sender’s account email |
| **Subject** | `{Invoice from \| Reminder…} {businessName} – {invoiceNumber}` |
| **Attachment** | Invoice PDF (contact block uses same Reply-To email) |
| **Footer** | “Contact **{businessName}** at **{reply email}**” |
| **Trigger** | `POST /api/invoices/send-email`, reminder cron |
| **Blocked when** | Business profile incomplete or no reply email can be resolved (400 with settings hint) |

**Customer viewed invoice** (to merchant): styled template in `invoice-email-template.ts` – same Easner Business shell; CTA links to `/invoices/{id}` in the business app.

**Payment receipt** (to customer on mark paid): styled template with merchant header block, payment confirmation, PDF attachment.

### Collection receipts (Payment Links + website checkout)

Separate from invoice mail (`business/lib/checkout/send-checkout-payer-receipt-email.ts`). Live charges only; Stripe test-mode events do not send.

| Field | Value |
|-------|--------|
| **From** | **Easner Business** – **`receipt@easner.com`** (hardcoded default, same as invoices@; no env required) |
| **Reply-To** | Same merchant support resolution as invoices |
| **Subject** | `Receipt from {businessName}` |
| **When** | Stripe `charge.created`, formatted in `EASNER_RECEIPT_TIMEZONE` or the platform Dashboard timezone |
| **Trigger** | `checkout.session.completed` only (not also `payment_intent.succeeded`) |

Platform mail to business users still uses **`SENDGRID_REPLY_TO`** (Easner support). Invoice Reply-To is per org, not env-based.

Mobile security emails: **Change password** and **MFA enable/disable** call `POST /api/notifications/security-alert` after Supabase auth succeeds (`ChangePasswordScreen`, `MfaSetupScreen`).

## Push (Expo) vs email

- **Push** and **email** share derivation via `deriveTransactionNotification` + `dispatchTransactionNotification`.
- **Business** users receive **email only** (no Expo push), even when ledger events fire for org accounts.
- **Personal (mobile)** receives push + email when preferences allow.
- **Email channel scope**: settled ledger activities including Easetag P2P and card, plus failed outbound transfers (funds restored – no separate reversal notices). Gated by user `channels.email` (default on); platform kill-switch: `LEDGER_TRANSACTION_EMAIL_ENABLED=false`.
- **Email** delivery is enforced in **`communication-email-guard.ts`** together with `channels.email` and product/security/marketing toggles. Transactional templates are not suppressed by marketing toggles.
- **Push** checks **`parseCommunicationPreferences(...).channels.push`** and reads tokens from **`public.user_push_devices`**.

## Preference enforcement

- Parsed with `@easner/shared` **`parseCommunicationPreferences`** – all channels and categories default **on**.
- New accounts seed defaults on bootstrap and first visit to **Settings → Communication**.
- Template → bucket: **`communication-email-guard.ts`** (`shouldSendTemplatedEmail`).
- Transaction lifecycle templates are **never** blocked by product/marketing toggles (`channels.email` still gates delivery).

## Tests

```bash
npm run test --workspace=@easner/server   # template render + guardrail scan
npm run test --workspace=easner-business # claim-team-invite + push content derivation
```

## Legacy paths (removed / deprecated)

- `EmailNotificationService.sendTransactionStatusEmail` – no-op; legacy remittance model.
- `EmailNotificationService.sendCryptoReceiveTransactionEmail` – no-op; stablecoin receive uses ledger dispatch.
- `POST /api/send-email-notification` with `type: transaction` – **410 Gone**.
- Legacy remittance email helpers removed from `email-service.ts`.
- `packages/server/lib/transaction-status-service.ts` – status email hook retired.
- `fetch('/api/send-email-notification')` removed from `database.ts`, `admin-data-store.ts`, mobile `transactionService.ts`.
