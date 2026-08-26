import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { getStripePublishableKey } from "@/lib/stripe/config"

const PLATFORM_KEY_PLACEHOLDER = "__EASNER_STRIPE_PK__"
const VALIDATE_URL_PLACEHOLDER = "__EASNER_VALIDATE_URL__"

/** Same host that served this script — `/api/v1` works; `api.easner.com/v1` currently does not. */
function checkoutValidateUrl(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim()
  const hostHeader = request.headers.get("host")
  const url = new URL(request.url)
  const host = (forwarded || hostHeader || url.host).replace(/:\d+$/, "")
  const proto = request.headers.get("x-forwarded-proto") || url.protocol.replace(":", "") || "https"
  return `${proto}://${host}/api/v1/checkout/publishable-keys/validate`
}

function loadSdkBundle(): string {
  const candidates = [
    join(process.cwd(), "node_modules/@easner/checkout/dist/checkout.js"),
    join(process.cwd(), "../packages/checkout/dist/checkout.js"),
  ]
  for (const path of candidates) {
    if (existsSync(path)) return readFileSync(path, "utf8")
  }
  throw new Error("Easner Checkout SDK bundle is missing. Run npm run build --workspace=@easner/checkout")
}

/**
 * Embed script served at /checkout.js and js.easner.com/v1/checkout.js.
 * The browser SDK is bundled from `@easner/checkout`; this route only injects
 * the platform Stripe publishable key and the key-validation URL.
 */
export async function GET(request: Request) {
  const platformKey = getStripePublishableKey()
  const validateUrl = checkoutValidateUrl(request)
  const bundle = loadSdkBundle()
    .replaceAll(PLATFORM_KEY_PLACEHOLDER, platformKey)
    .replaceAll(VALIDATE_URL_PLACEHOLDER, validateUrl)

  const script = `${bundle}
window.EasnerCheckout = window.EasnerCheckout && window.EasnerCheckout.default
  ? window.EasnerCheckout.default
  : window.EasnerCheckout;
`

  return new Response(script, {
    headers: {
      "content-type": "application/javascript; charset=utf-8",
      "cache-control": "public, max-age=300",
      "access-control-allow-origin": "*",
    },
  })
}
