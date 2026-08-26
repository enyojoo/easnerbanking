import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { getStripePublishableKey } from "@/lib/stripe/config"

const PLATFORM_KEY_PLACEHOLDER = "__EASNER_STRIPE_PK__"
const VALIDATE_URL_PLACEHOLDER = "__EASNER_VALIDATE_URL__"

function checkoutApiOrigin(): string {
  const raw =
    process.env.NEXT_PUBLIC_EASNER_API_HOST?.trim() ||
    process.env.EASNER_API_HOST?.trim() ||
    "api.easner.com"
  const host = raw.replace(/^https?:\/\//, "").split("/")[0]
  return `https://${host}`
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
export async function GET() {
  const platformKey = getStripePublishableKey()
  const validateUrl = `${checkoutApiOrigin()}/v1/checkout/publishable-keys/validate`
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
