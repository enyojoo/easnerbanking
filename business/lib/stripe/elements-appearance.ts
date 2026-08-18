import type { Appearance, StripeElementLocale } from "@stripe/stripe-js"

/** Stripe Appearance Builder “Shapes → pill” (fully rounded inputs and buttons). */
const PILL_RADIUS = "100px"

/** Stripe Elements appearance aligned with Easner business invoice UI (light). */
export function easnerStripeElementsAppearance(): Appearance {
  return {
    theme: "stripe",
    variables: {
      colorPrimary: "#0080cc",
      colorBackground: "#faf9f6",
      colorText: "#121518",
      colorDanger: "#7a2e2e",
      fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
      fontSizeBase: "15px",
      borderRadius: PILL_RADIUS,
      buttonBorderRadius: PILL_RADIUS,
      buttonExpressCheckoutBorderRadius: PILL_RADIUS,
      spacingUnit: "4px",
    },
    rules: {
      ".AccordionItem": {
        borderColor: "hsl(40 27% 82%)",
        boxShadow: "none",
      },
      ".Label": {
        fontWeight: "500",
      },
    },
  }
}

/** Browser locale for Stripe.js / Elements labels. */
export function browserStripeLocale(): StripeElementLocale {
  if (typeof navigator === "undefined") return "auto"
  const raw = navigator.language?.trim()
  if (!raw) return "auto"
  return raw as StripeElementLocale
}
