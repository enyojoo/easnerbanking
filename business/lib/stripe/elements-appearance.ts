import type { Appearance, StripeElementLocale } from "@stripe/stripe-js"

/** Fully rounded ends — Stripe Appearance Builder “Shapes → pill”. */
const PILL_RADIUS = "9999px"
const BOX_BORDER = "hsl(40 27% 82%)"

/**
 * Stripe Elements appearance aligned with Easner business invoice UI (light).
 * `inputs: spaced` so card number / expiry / CVC are individual pill boxes
 * instead of Stripe’s condensed grouped card (which ignores a large radius).
 */
export function easnerStripeElementsAppearance(): Appearance {
  return {
    theme: "stripe",
    inputs: "spaced",
    labels: "above",
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
        borderRadius: PILL_RADIUS,
        borderColor: BOX_BORDER,
        boxShadow: "none",
        padding: "12px 20px",
      },
      ".AccordionItem--selected": {
        borderRadius: PILL_RADIUS,
        padding: "14px 22px 22px",
      },
      ".Input": {
        borderRadius: PILL_RADIUS,
        borderColor: BOX_BORDER,
        padding: "12px 16px",
      },
      ".Block": {
        borderRadius: PILL_RADIUS,
        borderColor: BOX_BORDER,
      },
      ".Tab": {
        borderRadius: PILL_RADIUS,
      },
      ".PickerItem": {
        borderRadius: PILL_RADIUS,
      },
      ".Dropdown": {
        borderRadius: PILL_RADIUS,
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
