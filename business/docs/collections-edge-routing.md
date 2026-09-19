# Collections edge routing

Checkout snippets in the integration hub point at dedicated hosts. This app serves those paths.

## `js.easner.com`

| URL | Serves |
| --- | --- |
| `https://js.easner.com/checkout.js` | Latest embed (`/checkout.js`) |
| `https://js.easner.com/v1/checkout.js` | Latest v1 (same asset) |
| `https://js.easner.com/v1.0.0/checkout.js` | Pinned semver path (same asset until the SDK is versioned independently) |
| Any other path | 307 to `business.easner.com` |

Implemented in `proxy.ts` (`maybeRewriteJsCheckoutScript`, `maybeRedirectJsHostToBusiness`) and `next.config.mjs` `beforeFiles` rewrites.

Hosts: `js.easner.com` plus `EASNER_JS_HOST` / `NEXT_PUBLIC_EASNER_JS_HOST` / `EASNER_JS_HOSTS`.

## `api.easner.com`

| URL | Serves |
| --- | --- |
| `https://api.easner.com/v1/checkout/sessions` | `/api/v1/checkout/sessions` |
| `https://api.easner.com/api/*` | Existing API routes (unchanged) |
| Any other path | 307 to `business.easner.com` |

Implemented in `proxy.ts` (`maybeRewriteApiV1ToAppApi`) so `/v1/*` is **not** redirected away.

Hosts: `api.easner.com` plus `EASNER_API_HOST` / `NEXT_PUBLIC_EASNER_API_HOST` / `EASNER_API_HOSTS`.

After the Vercel api project cutover (see `docs/platform-api-split.md`), `api.easner.com` and `js.easner.com` attach to the **api** project. Crons run only there.

## Webhook signatures

Checkout events are POSTed to the merchant URL with:

- `content-type: application/json`
- `easner-event: checkout.completed` (or another catalog event)
- `easner-signature: t=<unix>,v1=<hex>`

`v1` is HMAC-SHA256 of `${timestamp}.${rawBody}` using the signing secret shown once in Checkout setup. Reject timestamps older than 5 minutes.

See `verifyMerchantWebhookPayload` in `lib/checkout/secrets.ts`.
