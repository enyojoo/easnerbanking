# Email entry points (Easner monorepo)

Consumer-facing HTML templates live under **`packages/server/lib/`** (`email-templates.ts`, `email-generator.ts`, `email-service.ts`). The **business** app adds invoice PDF delivery via `business/lib/invoice-email-service.ts` (SendGrid, not the shared template registry).

## HTTP routes

| Route | App | Purpose |
|-------|-----|---------|
| `POST /api/send-email-notification` | **business** | Transaction status emails (`EmailNotificationService`) when the caller is the transaction owner (Bearer / session) or office staff; admin transaction notices. |
| `POST /api/invoices/send-email` | **business** | Invoice PDF to **customer** — not gated by marketing toggles (operational). |
| `GET` / `PATCH /api/settings/communication` | **business** | Read/update `users.communication_preferences` (shared with mobile). |
| `POST /api/settings/push-token` | **business** | Body `{ expoPushToken: string \| null, platform?: "ios" \| "android" \| "web" }` — upsert or remove rows in `public.user_push_devices` (mobile multi-device). Authenticated user only; never log the token. |

Mobile sets `EXPO_PUBLIC_API_URL` to the business app origin and must send `Authorization: Bearer` for user-triggered notification calls.

## Push (Expo) vs email

- **Email** delivery is enforced in **`communication-email-guard.ts`** together with `channels.email` and the product/security/marketing toggles. Transactional templates are not suppressed by marketing toggles (see guard), but **`channels.email`** still gates templated mail when implemented that way—confirm product intent if operational mail must bypass the email channel.
- **Push** is not sent from `packages/server` today. A future sender (e.g. Expo Push API) must check **`parseCommunicationPreferences(...).channels.push`**, read device tokens from **`public.user_push_devices`**, and must not send marketing content if product policy requires opt-in (align with mobile preference toggles). **Security-critical** push may still be sent per product/legal policy—document any exception next to the sender.

## Preference enforcement

- Parsed with `@easner/shared` **`parseCommunicationPreferences`**.
- Template → bucket: **`communication-email-guard.ts`** (`shouldSendTemplatedEmail`).
- Transaction lifecycle templates are **never** blocked by product/marketing toggles (channels still apply: if `channels.email` is false, email is skipped for all templated mail including transactional — override if product requires always-on operational mail).

## Legacy paths

Older docs sometimes referenced `web/lib/email-*`; in this repo the stack is **`packages/server/lib/`**.
