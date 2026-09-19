# Good to go — create `api`, then Front Door, then the UIs

Code is already in this repo. Start by standing up the **api** Vercel project. Azure DNS for `api` / `js` does **not** change (they already CNAME to Front Door). You switch the **Front Door origin**. `platform` is the only new DNS record.

**Edge:** Azure DNS (`easner.com`) CNAME → Azure Front Door → Vercel. Do not CNAME production hosts to `cname.vercel-dns.com`.

**Crons:** every project that deploys `business/` inherits `vercel.json` crons. Only the project with `EASNER_CRONS_ENABLED=true` (or unset) actually runs them. New api starts at `false`. Today’s business stays unset/`true` until you flip traffic.

Write down once:

| Placeholder | Where |
|---|---|
| `<fd-endpoint>` | Front Door endpoint host, e.g. `easner-xxxx.z01.azurefd.net` |
| `<fd-profile>` | Front Door profile that already serves `business.easner.com` |
| `<business-origin>` | Current Front Door origin for business (`*.vercel.app`) |
| `<api-origin>` | New api project `*.vercel.app` |
| `<platform-origin>` | New platform project `*.vercel.app` |

---

## 1. Create Vercel project `api`

1. Vercel → Add Project → this repo.
2. **Root Directory:** `business/`. **Region:** `lhr1`. Install: `bash ./scripts/vercel-install.sh` (same as business).
3. Do **not** add `api.easner.com` / `js.easner.com` until step 2.
4. Env — copy **every server secret** from today’s business project, plus:

| Name | Value |
|---|---|
| `EASNER_CRONS_ENABLED` | `false` |
| `NEXT_PUBLIC_API_URL` | `https://api.easner.com` |
| `NEXT_PUBLIC_BUSINESS_APP_URL` | `https://business.easner.com` |
| `NEXT_PUBLIC_PAY_APP_URL` | `https://pay.easner.com` |
| `NEXT_PUBLIC_INVOICE_APP_URL` | `https://invoice.easner.com` |
| `NEXT_PUBLIC_SUPABASE_URL` | same as business |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | same |
| `SUPABASE_SERVICE_ROLE_KEY` | same |
| `BUSINESS_APP_SESSION_SECRET` | same |
| `CRON_SECRET` | same |
| `EASNER_INTERNAL_CRON_SECRET` | same |
| `EASNER_OFFICE_ORIGIN` | `https://bk.easner.com` |

Also copy: Noah / Grid / Bridge / YC / Relay / Turnkey / Stripe secrets + webhook secrets / payroll encryption / SES-SendGrid / Intercom messenger secret / any other `EASNER_*` already on business.

Do **not** set `NEXT_PUBLIC_APP_SURFACE` on api.

5. Deploy Production. Smoke on the `*.vercel.app` URL only:
   - `GET /api/health` → 200
   - `GET /v1/checkout/sessions` → 401 JSON, not HTML
   - Cron invocations may appear but the body should be `{ skipped: true }`

---

## 2. Attach `api.easner.com` + `js.easner.com` (Vercel + Azure DNS TXT)

Vercel → api → Settings → Domains → add both. **Do not** change the existing Azure DNS CNAMEs to `cname.vercel-dns.com`.

Azure DNS zone `easner.com` → add only the **TXT** Vercel shows (usually `_vercel.api` / `_vercel.js`). Wait until both domains are Valid.

Leave these as they are:

| Name | Type | Value |
|---|---|---|
| `api` | CNAME | `<fd-endpoint>` |
| `js` | CNAME | `<fd-endpoint>` |

---

## 3. Front Door — new origin, then cutover

### 3a. Origin (no traffic yet)

`<fd-profile>` → Origin groups → add `vercel-api`:

- Origin host: `<api-origin>`
- Origin host header: `api.easner.com` (and `js.easner.com` on the js route, matching how business is set up today)

### 3b. Cutover (one sitting)

1. Front Door route **`api.easner.com`** → `vercel-api`. Keep `Host: api.easner.com`.
2. Front Door route **`js.easner.com`** → same api origin. Keep `Host: js.easner.com`.
3. Leave `business` / `pay` / `invoice` on `<business-origin>`.
4. Vercel → **api** → `EASNER_CRONS_ENABLED=true` → Redeploy.
5. Vercel → **business** → `EASNER_CRONS_ENABLED=false` → Redeploy.
6. Vercel → business → Domains → remove `api.easner.com` and `js.easner.com`.

Smoke on the public hosts:

- `https://api.easner.com/api/health` → 200
- `https://api.easner.com/v1/checkout/sessions` → 401 JSON
- `https://js.easner.com/checkout.js` and `/v1/checkout.js` → JS
- One webhook + one cron log on the **api** project
- If a vendor webhook still posts to `business.easner.com/api/...`, point it at `https://api.easner.com/api/...`

**Rollback:** Front Door `api` + `js` routes back to `<business-origin>`. Business `EASNER_CRONS_ENABLED` unset/`true`. Api `false`. Re-add those domains on business if you removed them. Azure DNS unchanged.

---

## 4. Point the UIs at api (and strip secrets from business)

Vercel → **business** → Production + Preview:

| Name | Value |
|---|---|
| `NEXT_PUBLIC_API_URL` | `https://api.easner.com` |
| `NEXT_PUBLIC_APP_SURFACE` | `business` |
| `NEXT_PUBLIC_BUSINESS_APP_URL` | `https://business.easner.com` |
| `EASNER_OFFICE_ORIGIN` | `https://bk.easner.com` |

Do **not** set `NEXT_PUBLIC_PLATFORM_APP_URL` until step 6.

Redeploy business. Network tab: Bearer to `https://api.easner.com/api/...`. Dashboard / Send / Invoices work.

After it is stable, delete **server secrets** from business (service role, webhook secrets, provider keys, cron secrets). Keep publishable / `NEXT_PUBLIC_*` only.

Office + Expo (already should be this; confirm):

| Project | Name | Value |
|---|---|---|
| office | `NEXT_PUBLIC_API_URL` | `https://api.easner.com` |
| office | `OFFICE_BACKEND_API_URL` | `https://api.easner.com` |
| EAS + Expo web | `EXPO_PUBLIC_API_URL` | `https://api.easner.com` |

No EAS rebuild if the string is already `https://api.easner.com`.

Local: `business/.env.local` and `mobile/.env` stay `http://localhost:3000` until a separate api process exists.

Apply `business/supabase/migrations/20260919133000_dev_platform_enabled.sql`. Office → **Enable Dev Platform** for any merchant already on Checkout.

---

## 5. Create Vercel project `platform`

1. Add Project → same repo. Root `business/`. Region `lhr1`.
2. Env (public only — **no** service role, webhooks, cron secrets):

| Name | Value |
|---|---|
| `EASNER_CRONS_ENABLED` | `false` |
| `NEXT_PUBLIC_APP_SURFACE` | `platform` |
| `NEXT_PUBLIC_API_URL` | `https://api.easner.com` |
| `NEXT_PUBLIC_BUSINESS_APP_URL` | `https://business.easner.com` |
| `NEXT_PUBLIC_PLATFORM_APP_URL` | `https://platform.easner.com` |
| `NEXT_PUBLIC_SUPABASE_URL` | same |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | same |
| `NEXT_PUBLIC_INTERCOM_APP_ID` / `NEXT_PUBLIC_INTERCOM_REGION` | same as business |
| `NEXT_PUBLIC_POSTHOG_KEY` / `NEXT_PUBLIC_POSTHOG_HOST` | same |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | same |

3. Deploy. Copy `<platform-origin>`.
4. Vercel domain `platform.easner.com`. Azure DNS **TXT** only (`_vercel.platform`). Do not CNAME `platform` to Vercel.
5. Front Door origin group `vercel-platform`: origin `<platform-origin>`, host header `platform.easner.com`.
6. Front Door custom domain → add `_dnsauth.platform` **TXT** in Azure DNS. Wait for the cert.
7. Route: `platform.easner.com` → `vercel-platform`, `Host: platform.easner.com`.
8. Then Azure DNS:

| Name | Type | Value |
|---|---|---|
| `platform` | CNAME | `<fd-endpoint>` |

TTL 300 at first, then 3600.

---

## 6. Supabase + Business switcher

Supabase → Authentication → URL Configuration. Keep existing URLs. Add:

- `https://platform.easner.com/auth/callback`
- `https://platform.easner.com/**` if you already use wildcards

Do not change Site URL.

Vercel → **business** (and **api** if emails need it):

| Name | Value |
|---|---|
| `NEXT_PUBLIC_PLATFORM_APP_URL` | `https://platform.easner.com` |

Redeploy business. Switcher and `/checkout` go to Platform. Each host has its own Supabase localStorage; first switch may show login.

**Rollback:** remove the `platform` CNAME; disable the Front Door route; unset `NEXT_PUBLIC_PLATFORM_APP_URL` on business.

---

## Env cheat sheet

| Name | api (before cutover) | api (after) | business | platform |
|---|---|---|---|---|
| `NEXT_PUBLIC_API_URL` | `https://api.easner.com` | same | same | same |
| `NEXT_PUBLIC_APP_SURFACE` | — | — | `business` | `platform` |
| `NEXT_PUBLIC_BUSINESS_APP_URL` | yes | yes | yes | yes |
| `NEXT_PUBLIC_PLATFORM_APP_URL` | after step 6 | after step 6 | after step 6 | yes |
| `EASNER_CRONS_ENABLED` | `false` | `true` | unset/`true`, then `false` at 3b | `false` |
| Publishable keys | yes | yes | yes | yes |
| Service role / webhooks / provider / cron secrets | yes | yes | delete after step 4 | **never** |

---

## Check

| Surface | Expect |
|---|---|
| api / js | health, `/v1` JSON, `checkout.js`, crons + webhooks on **api** only |
| Business | Accounts, Send, Invoices. Bearer to `api.easner.com` |
| Platform | Checkout, Developers, switcher |
| Pay / invoice | Payer pages |
| Office / native / Expo web | Still `api.easner.com` |

---

## Azure DNS after everything (zone `easner.com`)

| Name | Type | Value | You change? |
|---|---|---|---|
| `business`, `pay`, `invoice`, `api`, `js`, `app`, `bk` | CNAME | `<fd-endpoint>` | No |
| `platform` | CNAME | `<fd-endpoint>` | **Add in step 5** |
| `_vercel.api`, `_vercel.js`, `_vercel.platform` | TXT | Vercel verify | Add when attaching domains |
| `_dnsauth.platform` | TXT | Front Door cert | Add in step 5 |

Do not edit mail / DKIM / DMARC / BIMI for this split.
