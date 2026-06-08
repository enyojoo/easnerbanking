# app.easner.com — consumer app web + mobile deep links

`app.easner.com` is the Easner **consumer** surface:

- **Expo web** build of the mobile app (browser fallback when the native app is not installed)
- **Universal Links (iOS)** and **App Links (Android)** for `https://app.easner.com/user/*`

Marketing stays on `www.easner.com` (separate repo: `easner/website`).

## Why Android opened links in the browser

Android App Links were registered for `easner.com`, but:

1. Apex `easner.com` is fronted by Azure Front Door and often **301-redirects to `www`** before `/.well-known/assetlinks.json` is served — App Link verification fails.
2. `DeepLinkService.createDeepLink()` used `getApiBaseUrl()` (`api.easner.com`), not a verified app-link host.
3. There is no `/user/dashboard` page on the marketing site, so failed verification opens Chrome on a dead URL.

Moving verification + web fallback to `app.easner.com` avoids the apex redirect problem.

## Mobile native config (rebuild required)

After changing `mobile/app.json`, run a new EAS build:

- iOS Associated Domains: `applinks:app.easner.com`
- Android intent filter: `https` + `app.easner.com` + `pathPrefix: /user`

Update the App ID in Apple Developer Portal to match.

## Vercel — Expo web on app.easner.com

1. Create a Vercel project with **Root Directory** = `mobile`.
2. Add domain `app.easner.com`.
3. Set environment variables (Production):

| Variable | Purpose |
|----------|---------|
| `EXPO_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase anon key |
| `EXPO_PUBLIC_API_URL` | Business API origin (e.g. `https://api.easner.com`) |
| `APPLE_TEAM_ID` | Apple Developer Team ID (10 chars) for AASA |
| `ANDROID_SHA256_CERT_FINGERPRINTS` | Comma-separated SHA-256 cert fingerprints for App Links |

4. Deploy — `mobile/vercel.json` runs `npm run build:web` (`expo export --platform web`) and serves `dist/` with SPA fallback.

### Verify after deploy

```bash
curl -sS -D - "https://app.easner.com/.well-known/apple-app-site-association" | head -20
curl -sS "https://app.easner.com/.well-known/assetlinks.json" | jq .
curl -sS -o /dev/null -w "%{http_code}\n" "https://app.easner.com/"
```

Android App Link status (on device): Settings → Apps → Easner → Open by default.

## Legacy easner.com links

The mobile app still **accepts** `https://easner.com/user/*` in JS during migration.

Add a redirect on the marketing site (`easner/website`) so old links land on `app.easner.com`:

- `/user` and `/user/*` → `https://app.easner.com{path}`

## Deep link paths

| Path | Native screen |
|------|----------------|
| `/user/dashboard` | Dashboard |
| `/user/transactions` | Transactions |
| `/user/transactions/:id` | TransactionDetails |
| `/user/recipients` | Recipients |
| `/user/send` | SendAmount |
| `/user/support` | Support |
| `/user/profile` | Profile |

Custom scheme (always works): `easner://user/dashboard`
