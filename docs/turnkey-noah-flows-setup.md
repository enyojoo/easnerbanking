# Noah + Turnkey flows — setup runbook

Operational steps to activate the flows implemented in this repo (Supabase schema, Noah rail, Turnkey vaults, business app, mobile). For product context see `docs/turnkey-noah-go-live-plan.md`.

---

## 1. Database

Apply to the Supabase project the business app uses (SQL editor, migration pipeline, or `supabase db push` when linked):

| File | Purpose |
|------|---------|
| `supabase/migrations/20260218000000_turnkey_wallet_tables.sql` | `wallet_owners`, `wallet_accounts`, `wallet_provisioning_jobs`, `payment_intents`, `event_inbox` |
| `supabase/migrations/20260218000001_payment_intent_idempotency.sql` | `payment_intents.idempotency_key` + partial unique index |

Server routes use the **Supabase service role** (`createSupabaseAdmin`); no extra RLS is required for these tables for the Next.js API to work.

---

## 2. Business app — environment variables

### Noah (minimum to unlock `/api/noah/*` and gated wallet routes)

| Variable | Role |
|----------|------|
| `NOAH_API_KEY` | Required — `isNoahConfigured()` |
| `NOAH_API_BASE_URL` | Optional — defaults to sandbox; production use `https://api.noah.com/v1` (or equivalent Noah documents) |
| `NOAH_SIGNING_PRIVATE_KEY` | Production signing (PEM ES384) when Noah expects `Api-Signature` |
| `NOAH_ONBOARDING_RETURN_URL` | Required when calling hosted onboarding — full `https://…` return URL |
| `NOAH_BUSINESS_ONBOARDING_RETURN_URL` | Optional — KYB return; falls back to consumer URL |

Webhook verification and behaviour: see `business/lib/noah/webhook-verify.ts` and `NOAH_WEBHOOK_NOAH_ENV` if you need to force production verification mode.

### Turnkey (vaults, balances, deposit addresses, intents)

| Variable | Role |
|----------|------|
| `TURNKEY_ORGANIZATION_ID` or `TURNKEY_ORG_ID` | Parent org |
| `TURNKEY_API_PUBLIC_KEY` | API key pair (server) |
| `TURNKEY_API_PRIVATE_KEY` | API key pair (server) |
| `TURNKEY_API_BASE_URL` | Optional — default `https://api.turnkey.com` |
| `TURNKEY_BALANCE_CAIP2` | Optional — default `solana:mainnet` for `getWalletAddressBalances` |
| `TURNKEY_ONCHAIN_BALANCE_QUERY` | Set to `false` only if you want to disable balance queries (UI shows zero) |
| `TURNKEY_WALLET_AUTOPROVISION_ENABLED` | Default on; set to `false` to disable provisioning worker processing |
| `TURNKEY_WEBHOOK_SECRET` | For HMAC verification on `POST /api/webhooks/turnkey` |
| `TURNKEY_FALLBACK_SUB_ORGAN_ID` | Dev-only convenience — see `business/lib/turnkey/config.ts` |

Turnkey documents **Get balances** / `get_wallet_address_balances` as **beta** — ensure your org is enabled before relying on `/api/wallets/on-chain-balances`.

### Internal workers

| Variable | Role |
|----------|------|
| `EASNER_INTERNAL_CRON_SECRET` | Required for `GET`/`POST` `/api/internal/wallet-provisioning/process` — send `x-easner-internal-secret: <value>` **or** `Authorization: Bearer <value>` (Vercel Cron: set `CRON_SECRET` to the **same** string) |

### Other (existing product flags)

| Variable | Role |
|----------|------|
| `EASNER_SAFE_MODE_PAUSE_NEW_INTENTS` | `"true"` blocks new payment intents |

Standard Supabase env vars for the business app (`NEXT_PUBLIC_SUPABASE_*`, service role) must remain set as today.

---

## 3. Noah — external configuration

1. **Customers** — Easner derives Noah `CustomerID` from user/business records (`noah_customer_id`, `ebiz_{id}` pattern); ensure sandbox/production Noah matches your Easner IDs.
2. **Webhooks** — Point Noah to your deployed `POST /api/noah/webhooks` URL; configure signing/verification per Noah dashboard and `business/lib/noah/webhook-verify.ts`.
3. **Workflows** — Onramp / offramp expect Solana **USDC** / **EURC** aligned with `business/lib/wallet/vault-spec.ts` (USDC + EURC vaults).

---

## 4. Turnkey — external configuration

1. **Parent organization** — Create org; create **server** API key pair; set env vars above.
2. **Per-user / per-business sub-organization** — Your embedded-wallet or signup flow must obtain `subOrganizationId` for each owner.
3. **Link to Easner** — By default **`POST /api/auth/bootstrap`** (mobile + business signup) calls Turnkey **`createSubOrganization`** server-side when parent org API keys are set, then links `wallet_owners` and enqueues vault jobs. For retries or non-bootstrap clients: **`POST /api/wallets/ensure-sub-org`** (auth + `requireNoahEnv`). Manual / embedded flows can still call **`POST /api/wallets/provision`** with `{ "turnkeySubOrganizationId": "<id>" }`. Disable auto-create with **`TURNKEY_SERVER_SUB_ORG_CREATION_ENABLED=false`**.
4. **Drain provisioning queue** — **`business/vercel.json`** registers **Vercel Cron** once daily (00:00 UTC) on **`GET /api/internal/wallet-provisioning/process`**. *Hobby* plans only allow cron at daily cadence; use **Pro** if you need a higher frequency. Set **`EASNER_INTERNAL_CRON_SECRET`** and **`CRON_SECRET`** to the **same** value so Vercel sends `Authorization: Bearer …`. For faster drains (e.g. after signup bursts), call **`GET` or `POST`** on that path with **`x-easner-internal-secret`** until `wallet_accounts` rows are `active`.
5. **Turnkey webhooks** (optional) — `POST /api/webhooks/turnkey` with `TURNKEY_WEBHOOK_SECRET` if you use Turnkey’s webhook product.

---

## 5. Mobile app

- **`getApiBaseUrl()`** must resolve to the **same** deployed business app that serves `/api/wallets/*`, `/api/noah/*`, etc.
- Auth: Bearer Supabase session token on API calls (unchanged).
- Receive / balances use **`/api/wallets/deposit-addresses`** and **`/api/wallets/on-chain-balances`** (individual Noah scope unless you add business headers).

---

## 6. Flow → API / data (what “working” means)

| User-visible flow | Backend | Data dependency |
|-------------------|---------|------------------|
| Bank / VA deposit instructions | Noah virtual accounts | `payment_methods` / persisted VA rows; `GET /api/noah/virtual-accounts` |
| Stablecoin deposit (business `/accounts`, invoice pay-in, mobile Receive) | Turnkey addresses | Active `wallet_accounts` for USDC + EURC; `GET /api/wallets/deposit-addresses` |
| USD/EUR on-chain balance cards | Turnkey `getWalletAddressBalances` | Same `wallet_accounts`; `GET /api/wallets/on-chain-balances` |
| Onramp / offramp intents | Noah workflows + Turnkey source/dest | `payment_intents`; addresses from `wallet_accounts` via `resolveTurnkeyAddressForNoahPair` |

If Turnkey is not configured or vaults are not **active**, stablecoin deposit UI and intents show empty or error until provisioning completes.

---

## 7. Smoke checks (after deploy)

1. **Migrations** — Tables exist; no 500s from routes that insert/select `payment_intents` / `wallet_owners`.
2. **Noah** — `NOAH_API_KEY` set; `GET /api/health` or a simple authenticated Noah route returns 200 (not 503 “payments not available”).
3. **Turnkey** — After `POST /api/wallets/provision` + worker runs: `wallet_accounts` has two **active** Solana rows (USDC, EURC).
4. **Deposit addresses** — Authenticated `GET /api/wallets/deposit-addresses` returns non-empty `USD.address` / `EUR.address` when vaults exist.
5. **Balances** — `GET /api/wallets/on-chain-balances` returns numeric strings (requires Turnkey balance API enabled for your org).
6. **Worker** — `GET` or `POST` `/api/internal/wallet-provisioning/process` with correct secret returns JSON with `results` (not 401).

---

## 8. File index (implementation)

| Area | Primary paths |
|------|----------------|
| Turnkey config | `business/lib/turnkey/config.ts`, `business/lib/turnkey/client.ts` |
| Deposit addresses | `business/lib/wallet/turnkey-deposit-addresses.ts`, `business/app/api/wallets/deposit-addresses/route.ts` |
| On-chain balances | `business/lib/wallet/turnkey-chain-balances.ts`, `business/app/api/wallets/on-chain-balances/route.ts` |
| Provision + jobs | `business/app/api/wallets/provision/route.ts`, `business/lib/wallet/turnkey-wallet-db.ts`, `business/lib/wallet/turnkey-provisioning.ts`, `business/app/api/internal/wallet-provisioning/process/route.ts` |
| Intents | `business/lib/payment-intents/service.ts`, `business/app/api/onramp/intents/route.ts`, `business/app/api/offramp/intents/route.ts` |
| Invoice pay-in | `business/lib/invoices/resolve-pay-in-for-business.ts` |
| Business accounts UI | `business/hooks/use-business-account-rows.ts` |
| Mobile | `mobile/src/lib/noahService.ts`, `mobile/src/screens/receive/ReceiveMoneyScreen.tsx` |
