# Next: slim env on the new business Vercel project

**Api is done.** The existing env-rich project is `api` (Root `api/`, region `lhr1`). Secrets, treasury, webhooks, and crons stay there. Host URLs default in code. Do not add them back.

`business/` is UI only (leftover `/api/*` 308s to api). Next you set **only the public UI env** on the new business project, deploy, then switch Front Door for `business` / `pay` / `invoice`. Leave `api` / `js` on the api origin.

Azure DNS already CNAMEs those hosts to Front Door. Do not CNAME production hosts to `cname.vercel-dns.com`.

Write down once:

| Placeholder | Where |
|---|---|
| `<fd-endpoint>` | Front Door endpoint host, e.g. `easner-xxxx.z01.azurefd.net` |
| `<fd-profile>` | Front Door profile that already serves `business.easner.com` |
| `<api-origin>` | Api project `*.vercel.app` (already live) |
| `<new-business-origin>` | `easnerbank.vercel.app` (new business UI project) |
| `<platform-origin>` | New platform project `*.vercel.app` |

---

## Done — api

- Root Directory `api/`, region `lhr1`, install `bash ./scripts/vercel-install.sh`
- Env cleaned: keys + treasury kept; host / store / Intercom-public / Easetag flags omitted (code defaults)
- Domains: keep `api.easner.com` and `js.easner.com` **only** on this project (never on the business UI project)
- Those hosts do not redirect to `business.easner.com`. `/api/*` and `checkout.js` stay on api; opening them in a browser goes to `https://www.easner.com/developers`
- Smoke when you want: `GET https://api.easner.com/api/health` → 200; `GET https://api.easner.com/v1/checkout/sessions` → 401 JSON

Until Front Door switches UI hosts, `business.easner.com` may still hit the api origin (empty dashboard). That is expected.

---

## 1. New business project — env, then deploy

Vercel → Add Project → this repo (or the project you already created).

- **Root Directory:** `business/`
- **Region:** `lhr1`
- **Install:** `bash ./scripts/vercel-install.sh`

### Env (Production + Preview). Only these.

Copy the **same values** that are already on api for the public keys. No service role, no webhooks, no provider secrets, no cron secrets.

| Name | Value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | same as api |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | same as api |
| `NEXT_PUBLIC_INTERCOM_APP_ID` | same workspace app id as today |
| `NEXT_PUBLIC_INTERCOM_REGION` | omit if `us`; set only for `eu` / `ap` |
| `NEXT_PUBLIC_POSTHOG_KEY` | same as api |
| `NEXT_PUBLIC_POSTHOG_HOST` | same as api (keep if it is not `https://us.i.posthog.com`) |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | same as api (live pk) |

Do **not** set:

- `NEXT_PUBLIC_API_URL` — defaults to `https://api.easner.com`
- `NEXT_PUBLIC_APP_SURFACE` — defaults to `business`
- `NEXT_PUBLIC_BUSINESS_APP_URL` / `NEXT_PUBLIC_PAY_APP_URL` / `NEXT_PUBLIC_INVOICE_APP_URL`
- `EASNER_OFFICE_ORIGIN` — CORS already has `https://bk.easner.com`
- `BUSINESS_APP_SESSION_SECRET` / `SUPABASE_SERVICE_ROLE_KEY` / any webhook or cron secret
- `NEXT_PUBLIC_PLATFORM_APP_URL` — wait until platform is live (step 4)

Redeploy after saving env. Production alias is `https://easnerbank.vercel.app`.

Smoke **`https://easnerbank.vercel.app`** (not `business.easner.com` yet):

- Login
- Dashboard
- Network: Bearer to `https://api.easner.com`

**Active on Domains does not mean a deploy is bound.** `easnerbank.vercel.app` 404 `NOT_FOUND` means Vercel never reached Next — `/`, `/dashboard`, and `/api/health` all fail the same way. Assign a **Production** deployment (Deployments → newest Ready on the production branch → Promote, or Redeploy to Production). Preview URLs like `easner-business-*-easner.vercel.app` can SSO even while the alias 404s. If `easnerbank.vercel.app` still lives on the old/api project, remove it there first so only this UI project owns it.

### 1b. Attach UI hosts on the new project

Vercel → new business → Domains → add `business.easner.com`, `pay.easner.com`, `invoice.easner.com`. Azure DNS **TXT** only (`_vercel.business` / `_vercel.pay` / `_vercel.invoice` as Vercel prints). Do not change those CNAMEs.

---

## 2. Front Door — point UI hosts at the new business origin

`api` / `js` already hit `<api-origin>`. **Do not move api/js.**

`<fd-profile>` → Origin groups → add `vercel-business`:

- Origin host: `<new-business-origin>`
- Origin host header: `business.easner.com` (`pay` / `invoice` on those routes)

Then in one sitting:

1. Route **`business.easner.com`** → `vercel-business`. Keep `Host: business.easner.com`.
2. Route **`pay.easner.com`** → same new origin. Keep `Host: pay.easner.com`.
3. Route **`invoice.easner.com`** → same new origin. Keep `Host: invoice.easner.com`.
4. Vercel → **api** → Domains → remove `business.easner.com`, `pay.easner.com`, `invoice.easner.com`.

Smoke:

- `https://api.easner.com/api/health` → 200
- `https://api.easner.com/v1/checkout/sessions` → 401 JSON
- `https://js.easner.com/checkout.js` and `/v1/checkout.js` → JS
- `https://business.easner.com` dashboard, Send, Invoices. Network: Bearer to `api.easner.com`
- Pay / invoice payer pages. Bare `pay.easner.com` / `invoice.easner.com` → `https://www.easner.com/business`
- One webhook + one cron log on the **api** project
- Point any vendor webhook still hitting `business.easner.com/api/...` at `https://api.easner.com/api/...`

**Rollback:** Front Door `business` / `pay` / `invoice` back to `<api-origin>`. Re-add those domains on the api project. Api/js unchanged. Azure DNS unchanged.

---

## 3. Office / Expo

Production defaults to `https://api.easner.com` if unset. Leave existing `EXPO_PUBLIC_API_URL` / `NEXT_PUBLIC_API_URL` as-is if they already say that.

Local: `npm run dev:api` (**3002**) + `npm run dev:business` (**3000**). No env needed — API origin defaults to port 3002.

Apply `business/supabase/migrations/20260919133000_dev_platform_enabled.sql`. Office → **Enable Dev Platform** for any merchant already on Checkout.

---

## 4. Create Vercel project `platform` (after business cutover)

Same slim env shape as business, plus surface.

1. Add Project → this repo. Root `business/`. Region `lhr1`.
2. Env (public only — **no** service role, webhooks, cron secrets):

| Name | Value |
|---|---|
| `NEXT_PUBLIC_APP_SURFACE` | `platform` (needed for SSR; hostname alone is too late) |
| `NEXT_PUBLIC_PLATFORM_APP_URL` | `https://platform.easner.com` |
| `NEXT_PUBLIC_SUPABASE_URL` | same as business |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | same as business |
| `NEXT_PUBLIC_INTERCOM_APP_ID` / `NEXT_PUBLIC_INTERCOM_REGION` | same as business |
| `NEXT_PUBLIC_POSTHOG_KEY` / `NEXT_PUBLIC_POSTHOG_HOST` | same as business |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | same as business |

3. Deploy. Copy `<platform-origin>`.
4. Vercel domain `platform.easner.com`. Azure DNS **TXT** only (`_vercel.platform`).
5. Front Door origin `vercel-platform`, `_dnsauth.platform` TXT, then route + CNAME `platform` → `<fd-endpoint>`.

---

## 5. Supabase + Business switcher (with platform)

Supabase → Authentication → URL Configuration. Keep existing URLs. Add:

- `https://platform.easner.com/auth/callback`
- `https://platform.easner.com/**` if you already use wildcards
- the new business `*.vercel.app` preview origin if you use previews

Do not change Site URL.

On the **new business** project:

| Name | Value |
|---|---|
| `NEXT_PUBLIC_PLATFORM_APP_URL` | `https://platform.easner.com` |

Redeploy business. First switch may show login (per-host Supabase localStorage).

**Rollback:** remove the `platform` CNAME; disable the Front Door route; unset `NEXT_PUBLIC_PLATFORM_APP_URL` on business.

---

## Env cheat sheet

| Name | api (done) | new business (now) | platform (later) |
|---|---|---|---|
| Provider keys / webhooks / cron / service role | **set** | never | never |
| Host URLs / office origin | omit | omit | omit |
| `NEXT_PUBLIC_APP_SURFACE` | unset | omit (defaults to business) | `platform` |
| Publishable Supabase / Intercom / PostHog / Stripe pk | PostHog + Stripe pk + Supabase; Intercom public omit | **set** | **set** |
| `NEXT_PUBLIC_PLATFORM_APP_URL` | omit | after step 5 | yes |

---

## Check

| Surface | Expect |
|---|---|
| api / js | health, `/v1` JSON, `checkout.js`, crons + webhooks on **api** |
| Business | Accounts, Send, Invoices on the **new** project. Bearer to `api.easner.com` |
| Platform | Checkout, Developers, switcher |
| Pay / invoice | Payer pages on the new business origin |
| Office / native / Expo web | Still `api.easner.com` |

---

## Azure DNS after everything (zone `easner.com`)

| Name | Type | Value | You change? |
|---|---|---|---|
| `business`, `pay`, `invoice`, `api`, `js`, `app`, `bk` | CNAME | `<fd-endpoint>` | No |
| `platform` | CNAME | `<fd-endpoint>` | **Add in step 4** |
| `_vercel.business`, `_vercel.pay`, `_vercel.invoice` | TXT | Vercel verify (new UI project) | Add in step 1b |
| `_vercel.api`, `_vercel.js` | TXT | already on api | Only if Vercel asks again |
| `_vercel.platform` | TXT | Vercel verify | Add in step 4 |
| `_dnsauth.platform` | TXT | Front Door cert | Add in step 4 |

Do not edit mail / DKIM / DMARC / BIMI for this split.
