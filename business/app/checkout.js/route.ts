import { buildCheckoutSdkScript } from "@/lib/checkout-sdk/build-sdk-script"
import { getBusinessAppPublicOrigin } from "@/lib/business-app-public-url"
import { onlinePaymentTabHint } from "@/lib/invoices/invoice-payment-copy"
import { easnerStripeElementsAppearance } from "@/lib/stripe/elements-appearance"
import { getStripePublishableKey } from "@/lib/stripe/config"

/**
 * Easner Checkout SDK, served at /checkout.js (js.easner.com maps here, and
 * /v1/checkout.js on that host is an alias). The body lives in
 * lib/checkout-sdk/build-sdk-script.ts; this route injects per-environment
 * values (platform key fallback, config endpoint) at serve time.
 */
export async function GET() {
  const script = buildCheckoutSdkScript({
    fallbackStripeKey: getStripePublishableKey(),
    configUrl: `${getBusinessAppPublicOrigin()}/api/v1/checkout/embed-config`,
    defaultAppearance: easnerStripeElementsAppearance(),
    methodsHint: onlinePaymentTabHint(),
  })

  return new Response(script, {
    headers: {
      "content-type": "application/javascript; charset=utf-8",
      "cache-control": "public, max-age=300, stale-while-revalidate=86400",
      "access-control-allow-origin": "*",
    },
  })
}
