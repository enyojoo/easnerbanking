# Next: Office Enable Dev Platform (same business origin)

**No new directory. No second Vercel project.** Banking and Dev Platform are one Next app (`business/`) on the existing business project (`business.easner.com` / `easnerbank.vercel.app`). Operators stay on one login and one origin.

**Banking is the product. Dev is a tool mode.** Default is always Banking. Do not store Banking / Dev on the user or business in Supabase — it is not an account preference. Office **Enable Dev Platform** only gates who may enter Dev. On this browser, Switch writes a host-only cookie (`easner_app_surface`). Same browser keeps that mode until they switch back. A new browser, device, or incognito session starts in Banking.

A public `platform.easner.com` host can come later. Resolution already reserves it: env, then `platform.*` hostname, then cookie. Set `NEXT_PUBLIC_PLATFORM_APP_URL` only when that host exists; `isProductHostSplit()` stays false until then. Do not create a Platform Vercel project now. Leave `business/deploy/env.platform.example` unused.

---

## Done

| Surface | How it is deployed | Env |
|---|---|---|
| **api** | Vercel Root `api/`, region `lhr1`. Hosts `api.easner.com`, `js.easner.com` | Secrets, treasury, webhooks, crons. No host URLs. |
| **business** | Vercel Root `business/` (`easnerbank.vercel.app`). Front Door: `business` / `pay` / `invoice` | Slim public only. Surface defaults to business. Mode cookie is host-only on this origin. |
| **Expo web** | Existing Vercel mobile project (`app.easner.com`) | Supabase, Intercom app id, PostHog, `APPLE_TEAM_ID`, `ANDROID_SHA256_CERT_FINGERPRINTS`. No API URL (defaults to `https://api.easner.com`). |
| **EAS iOS / Android** | Existing EAS envs | Supabase, Intercom app id + iOS key + Android key, PostHog. No API URL / Easetag flag / Intercom region. |
| **Office** | Existing Office Vercel. Calls `https://api.easner.com` | No API URL required. |

Bare browser visits: `api.easner.com` / `js.easner.com` → `https://www.easner.com/developers`. `pay.easner.com` / `invoice.easner.com` `/` → `https://www.easner.com/business`. Payer paths and `/api` / `checkout.js` stay.

Azure DNS already CNAMEs `business`, `pay`, `invoice`, `api`, `js`, `app`, `bk` to Front Door. Do not CNAME production hosts to `cname.vercel-dns.com`. Do not add a `platform` CNAME or Front Door route yet.

---

## 1. Office gate column (if not applied)

Apply `business/supabase/migrations/20260919133000_dev_platform_enabled.sql` if `businesses.dev_platform_enabled` is not in prod yet (`boolean not null default false`). That column is the Office gate only. Do not add an `app_surface` (or similar) column on `users` or `businesses`.

---

## 2. Office Enable Dev Platform

Office → the merchant → **Enable Dev Platform**. That is the only gate. Do not set `NEXT_PUBLIC_APP_SURFACE` or `NEXT_PUBLIC_PLATFORM_APP_URL` on this project.

- Flag **on**: profile dropdown shows Switch to Dev Platform / Switch to Banking Account. Click writes `easner_app_surface`, flips nav in the same paint, `router.push` `/checkout` or `/dashboard`. No full reload. Cookie is this browser only.
- Flag **off**: dropdown shows **Need API Account?** / **Contact us for developer access.** Both the empty state and the row open Intercom (`openBusinessSupport()`). If a leftover cookie is `platform`, chrome is treated as banking and the cookie is cleared.
- `/checkout`, `/developers`, `/customers` with the flag off: gated empty state on this host. No bounce to another origin.

Settings and Transactions stay in both modes. Bookmarks do not change mode (persist stays the dropdown).

Redeploy **business** after this cookie/switch code ships.

---

## Env cheat sheet

| Name | api | business | Expo web | EAS |
|---|---|---|---|---|
| Provider / webhook / cron / service role | **set** | never | never | never |
| Host URLs / API URL | omit | omit | omit | omit |
| `NEXT_PUBLIC_APP_SURFACE` | unset | omit (defaults to business) | — | — |
| `NEXT_PUBLIC_PLATFORM_APP_URL` | omit | omit until a second host | — | — |
| Publishable Supabase / Intercom / PostHog | subset | **set** | **set** | **set** |
| Stripe pk | live pk | live pk | — | — |
| Intercom iOS + Android API keys | — | — | no | **set** |
| `APPLE_TEAM_ID` / Android SHA256 | — | — | **set** | no |

---

## Check

| Surface | Expect |
|---|---|
| api / js | health, `/v1` JSON, `checkout.js` |
| Business (flag off) | Banking nav. Need API Account? + Intercom. `/checkout` gated empty state. |
| Business (flag on) | Switch flips nav instantly; same browser keeps mode; new browser is Banking. Bearer to `api.easner.com` |
| Pay / invoice | Payer pages on the business origin. No `easner_app_surface` (host-only cookie). |
| Office / Expo web / native | `api.easner.com` |

---

## Later: public Platform host (optional)

Not now. If you ever hand developers a standalone `platform.easner.com`:

1. New Vercel project, Root `business/`, `NEXT_PUBLIC_APP_SURFACE=platform`, `NEXT_PUBLIC_PLATFORM_APP_URL=https://platform.easner.com`.
2. Azure DNS CNAME `platform` → Front Door (never `cname.vercel-dns.com`).
3. Set `NEXT_PUBLIC_PLATFORM_APP_URL` on the **business** project so `isProductHostSplit()` turns on.

Until then, `business/deploy/env.platform.example` is unused.

---

## Azure DNS (zone `easner.com`)

| Name | Type | Value | You change? |
|---|---|---|---|
| `business`, `pay`, `invoice`, `api`, `js`, `app`, `bk` | CNAME | Front Door endpoint | No |
| `platform` | — | — | **Do not add** |

Do not edit mail / DKIM / DMARC / BIMI for this split.
