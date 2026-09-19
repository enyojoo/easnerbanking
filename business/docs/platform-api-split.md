# Good to go — keep today’s env-rich project as `api`, create a slim new `business`

Do **not** copy every business secret onto a new api project. Today’s Vercel project already has them. That project becomes **api**. The new **business** project only needs the few vars that talk to the API and render the UI.

`api/` is the Next.js API app. `business/` is UI (plus leftover `/api/*` 308). Crons stay on the api project.

Azure DNS for `api` / `js` / `business` / `pay` / `invoice` already CNAMEs to Front Door. You switch **Front Door origins** for the UI hosts. `platform` is the only new DNS record. Do not CNAME production hosts to `cname.vercel-dns.com`.

Write down once:

| Placeholder | Where |
|---|---|
| `<fd-endpoint>` | Front Door endpoint host, e.g. `easner-xxxx.z01.azurefd.net` |
| `<fd-profile>` | Front Door profile that already serves `business.easner.com` |
| `<existing-origin>` | Today’s business project `*.vercel.app` (this becomes api) |
| `<new-business-origin>` | New business UI project `*.vercel.app` |
| `<platform-origin>` | New platform project `*.vercel.app` |

---

## 1. Today’s Vercel project → `api` (keep every env)

This is the project that already has Noah / Grid / Stripe / Turnkey / webhooks / service role / cron secrets.

1. Vercel → that project → Settings → General → **Root Directory:** `api/` (was `business/`). Region stays `lhr1`. Install stays `bash ./scripts/vercel-install.sh`.
2. Rename the project to `api` if you want the Vercel UI to match.
3. **Leave all existing env in place.** Add / confirm only:

| Name | Value |
|---|---|
| `NEXT_PUBLIC_API_URL` | `https://api.easner.com` |
| `NEXT_PUBLIC_BUSINESS_APP_URL` | `https://business.easner.com` |
| `NEXT_PUBLIC_PAY_APP_URL` | `https://pay.easner.com` |
| `NEXT_PUBLIC_INVOICE_APP_URL` | `https://invoice.easner.com` |
| `EASNER_OFFICE_ORIGIN` | `https://bk.easner.com` |

Unset `NEXT_PUBLIC_APP_SURFACE` if it is set.

4. Domains: keep `api.easner.com` and `js.easner.com` on this project. You will remove `business.easner.com` / `pay.easner.com` / `invoice.easner.com` in step 3.
5. Deploy Production. Smoke on **this same** `*.vercel.app` URL:
   - `GET /api/health` → 200
   - `GET /v1/checkout/sessions` → 401 JSON, not HTML

Until step 3, `business.easner.com` still hits this origin, so the dashboard may look empty. `api.easner.com` / `js.easner.com` are the ones that matter here.

---

## 2. New Vercel project `business` (few env only)

1. Vercel → Add Project → this repo. **Root Directory:** `business/`. **Region:** `lhr1`. Install: `bash ./scripts/vercel-install.sh`.
2. Env — Production + Preview. **Only these.** No service role, no webhooks, no provider keys, no cron secrets.

| Name | Value |
|---|---|
| `NEXT_PUBLIC_API_URL` | `https://api.easner.com` |
| `NEXT_PUBLIC_APP_SURFACE` | `business` |
| `NEXT_PUBLIC_BUSINESS_APP_URL` | `https://business.easner.com` |
| `NEXT_PUBLIC_PAY_APP_URL` | `https://pay.easner.com` |
| `NEXT_PUBLIC_INVOICE_APP_URL` | `https://invoice.easner.com` |
| `NEXT_PUBLIC_SUPABASE_URL` | same as today |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | same as today |
| `NEXT_PUBLIC_INTERCOM_APP_ID` / `NEXT_PUBLIC_INTERCOM_REGION` | same as today |
| `NEXT_PUBLIC_POSTHOG_KEY` / `NEXT_PUBLIC_POSTHOG_HOST` | same as today |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | same as today |
| `BUSINESS_APP_SESSION_SECRET` | **same value as api** (UI cookie + RSC Bearer) |
| `EASNER_OFFICE_ORIGIN` | `https://bk.easner.com` |

Do **not** set `NEXT_PUBLIC_PLATFORM_APP_URL` until step 5.

3. Deploy. Copy `<new-business-origin>`. Smoke the `*.vercel.app` URL (login, dashboard, Bearer to `api.easner.com`).

### 2b. Attach UI hosts on the new project

Vercel → new business → Domains → add `business.easner.com`, `pay.easner.com`, `invoice.easner.com`. Azure DNS **TXT** only (`_vercel.business` / `_vercel.pay` / `_vercel.invoice` as Vercel prints). Do not change those CNAMEs.

---

## 3. Front Door — point UI hosts at the new business origin

`api` / `js` already hit `<existing-origin>`. That origin is now the api app. **Do not move api/js.**

`<fd-profile>` → Origin groups → add `vercel-business`:

- Origin host: `<new-business-origin>`
- Origin host header: `business.easner.com` (`pay` / `invoice` on those routes)

Then in one sitting:

1. Route **`business.easner.com`** → `vercel-business`. Keep `Host: business.easner.com`.
2. Route **`pay.easner.com`** → same new origin. Keep `Host: pay.easner.com`.
3. Route **`invoice.easner.com`** → same new origin. Keep `Host: invoice.easner.com`.
4. Vercel → **api** (old project) → Domains → remove `business.easner.com`, `pay.easner.com`, `invoice.easner.com`.

Smoke:

- `https://api.easner.com/api/health` → 200
- `https://api.easner.com/v1/checkout/sessions` → 401 JSON
- `https://js.easner.com/checkout.js` and `/v1/checkout.js` → JS
- `https://business.easner.com` dashboard, Send, Invoices. Network: Bearer to `api.easner.com`
- Pay / invoice payer pages
- One webhook + one cron log on the **api** project
- Point any vendor webhook still hitting `business.easner.com/api/...` at `https://api.easner.com/api/...`

**Rollback:** Front Door `business` / `pay` / `invoice` back to `<existing-origin>`. Re-add those domains on the old project. Api/js unchanged. Azure DNS unchanged.

---

## 4. Office / Expo

| Project | Name | Value |
|---|---|---|
| office | `NEXT_PUBLIC_API_URL` | `https://api.easner.com` |
| office | `OFFICE_BACKEND_API_URL` | `https://api.easner.com` |
| EAS + Expo web | `EXPO_PUBLIC_API_URL` | `https://api.easner.com` |

No EAS rebuild if the string is already `https://api.easner.com`.

Local: `npm run dev:api` (**3002**) + `npm run dev:business` (**3000**). `NEXT_PUBLIC_API_URL=http://localhost:3002`.

Apply `business/supabase/migrations/20260919133000_dev_platform_enabled.sql`. Office → **Enable Dev Platform** for any merchant already on Checkout.

---

## 5. Create Vercel project `platform`

Same slim env shape as the new business project.

1. Add Project → this repo. Root `business/`. Region `lhr1`.
2. Env (public only — **no** service role, webhooks, cron secrets):

| Name | Value |
|---|---|
| `NEXT_PUBLIC_APP_SURFACE` | `platform` |
| `NEXT_PUBLIC_API_URL` | `https://api.easner.com` |
| `NEXT_PUBLIC_BUSINESS_APP_URL` | `https://business.easner.com` |
| `NEXT_PUBLIC_PLATFORM_APP_URL` | `https://platform.easner.com` |
| `NEXT_PUBLIC_SUPABASE_URL` | same |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | same |
| `NEXT_PUBLIC_INTERCOM_APP_ID` / `NEXT_PUBLIC_INTERCOM_REGION` | same |
| `NEXT_PUBLIC_POSTHOG_KEY` / `NEXT_PUBLIC_POSTHOG_HOST` | same |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | same |
| `BUSINESS_APP_SESSION_SECRET` | same as api |

3. Deploy. Copy `<platform-origin>`.
4. Vercel domain `platform.easner.com`. Azure DNS **TXT** only (`_vercel.platform`).
5. Front Door origin `vercel-platform`, `_dnsauth.platform` TXT, then route + CNAME `platform` → `<fd-endpoint>`.

---

## 6. Supabase + Business switcher

Supabase → Authentication → URL Configuration. Keep existing URLs. Add:

- `https://platform.easner.com/auth/callback`
- `https://platform.easner.com/**` if you already use wildcards
- the new business `*.vercel.app` preview origin if you use previews

Do not change Site URL.

On the **new business** project (and **api** if emails need it):

| Name | Value |
|---|---|
| `NEXT_PUBLIC_PLATFORM_APP_URL` | `https://platform.easner.com` |

Redeploy business. First switch may show login (per-host Supabase localStorage).

**Rollback:** remove the `platform` CNAME; disable the Front Door route; unset `NEXT_PUBLIC_PLATFORM_APP_URL` on business.

---

## Env cheat sheet

| Name | api (today’s project) | new business | platform |
|---|---|---|---|
| All current server secrets | **keep** | never | never |
| `NEXT_PUBLIC_API_URL` | `https://api.easner.com` | same | same |
| `NEXT_PUBLIC_APP_SURFACE` | unset | `business` | `platform` |
| Publishable Supabase / Intercom / PostHog / Stripe pk | yes | yes | yes |
| `BUSINESS_APP_SESSION_SECRET` | yes | same value | same value |
| `NEXT_PUBLIC_PLATFORM_APP_URL` | after step 6 | after step 6 | yes |

---

## Check

| Surface | Expect |
|---|---|
| api / js | health, `/v1` JSON, `checkout.js`, crons + webhooks on **today’s project** (now api) |
| Business | Accounts, Send, Invoices on the **new** project. Bearer to `api.easner.com` |
| Platform | Checkout, Developers, switcher |
| Pay / invoice | Payer pages on the new business origin |
| Office / native / Expo web | Still `api.easner.com` |

---

## Azure DNS after everything (zone `easner.com`)

| Name | Type | Value | You change? |
|---|---|---|---|
| `business`, `pay`, `invoice`, `api`, `js`, `app`, `bk` | CNAME | `<fd-endpoint>` | No |
| `platform` | CNAME | `<fd-endpoint>` | **Add in step 5** |
| `_vercel.business`, `_vercel.pay`, `_vercel.invoice` | TXT | Vercel verify (new UI project) | Add in step 2b |
| `_vercel.api`, `_vercel.js` | TXT | already on today’s project | Only if Vercel asks again |
| `_vercel.platform` | TXT | Vercel verify | Add in step 5 |
| `_dnsauth.platform` | TXT | Front Door cert | Add in step 5 |

Do not edit mail / DKIM / DMARC / BIMI for this split.
