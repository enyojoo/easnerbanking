# Email entry points (Easner monorepo)

Consumer-facing HTML templates live under **`packages/server/lib/`** (`email-templates.ts`, `email-generator.ts`, `email-service.ts`, `email-theme.ts`, `email-audience.ts`). The **business** app adds invoice PDF delivery via `business/lib/invoice-email-service.ts` (SendGrid, not the shared template registry).

## Architecture (ledger-aligned)

Transaction and verification emails are **not** driven by legacy remittance status (`pending` / `processing` / `completed`). They fire from the same ledger events as mobile push:

1. **`deriveTransactionNotification`** (`packages/shared/src/transactions/derive-transaction-notification.ts`) — channel-agnostic descriptor from live `Transaction` rows (provider, direction, metadata, outcome).
2. **`dispatchTransactionNotification`** (`business/lib/notifications/dispatch.ts`) — resolves audience, checks `communication_preferences`, sends push + email.
3. **Chokepoints**: `business/lib/ledger/transactions.ts` (settled / failed / cancelled), `bank-deposit-settled-notify.ts`, `easetag-transfer-notify.ts`, `global-payout-ledger.ts` (reversal), `sync-user.ts` (KYB/KYC transitions).

Audience (`business` | `personal`) is resolved in `business/lib/notifications/resolve-email-audience.ts` and threaded through `emailService.sendEmail`.

## Rollout flag (ledger transaction emails)

Ledger **transaction** emails (deposit, payout, wallet send, stablecoin receive — settled / failed / reversed) require:

```bash
LEDGER_TRANSACTION_EMAIL_ENABLED=true
```

When unset or any value other than `true`, transaction emails are **skipped**; push is unchanged. Welcome, KYB/KYC, team invite, and security emails are **not** gated by this flag.

## Environment variables

| Variable | Required | Purpose |
|----------|----------|---------|
| `SENDGRID_API_KEY` | Yes | SendGrid API authentication |
| `SENDGRID_FROM_EMAIL` | Recommended | Personal / default from address |
| `SENDGRID_FROM_NAME` | Recommended | Personal from display name |
| `SENDGRID_FROM_EMAIL_BUSINESS` | Recommended | Business from address (falls back to `SENDGRID_FROM_EMAIL`) |
| `SENDGRID_FROM_NAME_BUSINESS` | Recommended | Business from display name |
| `SENDGRID_REPLY_TO` | Recommended | Reply-to / support routing |
| `LEDGER_TRANSACTION_EMAIL_ENABLED` | For tx email | Set `true` to enable ledger transaction emails |

Before deploy, run:

```bash
node packages/server/scripts/verify-sendgrid-env.mjs
```

## HTTP routes

| Route | App | Purpose |
|-------|-----|---------|
| `POST /api/send-email-notification` | **business** | Admin transaction notices only (`type: admin-transaction`). User `type: transaction` returns **410 deprecated**. |
| `POST /api/notifications/security-alert` | **business** | Security alert emails (password changed, MFA enabled/disabled). |
| `POST /api/invoices/send-email` | **business** | Invoice PDF to **customer** — not gated by marketing toggles (operational). |
| `GET` / `PATCH /api/settings/communication` | **business** | Read/update `users.communication_preferences` (shared with mobile). |
| `POST /api/settings/push-token` | **business** | Register Expo push tokens; sends new-device security email on first device. |
| `POST /api/auth/bootstrap` | **business** | Welcome email for new business/personal accounts (via mobile + web bootstrap). |
| `POST /api/settings/team` | **business** | Team invitation emails on invite POST. |

Mobile sets `EXPO_PUBLIC_API_URL` to the business app origin and must send `Authorization: Bearer` for user-triggered notification calls.

## Push (Expo) vs email

- **Push** and **email** share derivation via `deriveTransactionNotification` + `dispatchTransactionNotification`.
- **Email channel scope**: bank deposit, payout, wallet send, stablecoin receive (settled + failure/reversal). Easetag P2P + card are push-only except Easetag reversal notice.
- **Email** delivery is enforced in **`communication-email-guard.ts`** together with `channels.email` and product/security/marketing toggles. Transactional templates are not suppressed by marketing toggles.
- **Push** checks **`parseCommunicationPreferences(...).channels.push`** and reads tokens from **`public.user_push_devices`**.

## Preference enforcement

- Parsed with `@easner/shared` **`parseCommunicationPreferences`**.
- Template → bucket: **`communication-email-guard.ts`** (`shouldSendTemplatedEmail`).
- Transaction lifecycle templates are **never** blocked by product/marketing toggles (`channels.email` still gates delivery).

## Tests

```bash
npm run test --workspace=@easner/server   # template render + guardrail scan
npm run test --workspace=easner-business # push content derivation
```

## Legacy paths (removed / deprecated)

- `EmailNotificationService.sendTransactionStatusEmail` — no-op; legacy remittance model.
- `EmailNotificationService.sendCryptoReceiveTransactionEmail` — no-op; stablecoin receive uses ledger dispatch.
- `POST /api/send-email-notification` with `type: transaction` — **410 Gone**.
- Legacy remittance email helpers removed from `email-service.ts`.
- `packages/server/lib/transaction-status-service.ts` — status email hook retired.
- `fetch('/api/send-email-notification')` removed from `database.ts`, `admin-data-store.ts`, mobile `transactionService.ts`.
