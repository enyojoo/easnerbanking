import type { Appearance, StripeElementLocale } from "@stripe/stripe-js"

/**
 * ~24px is Stripe’s workable “pill” for boxed frames: collapsed method rows
 * (~50px tall) read as pills; expanded Card / bank / Cash App stay rectangles.
 * 9999px is only safe on short controls (inputs, Pay, wallets).
 */
const FRAME_RADIUS = "24px"
const PILL_RADIUS = "9999px"
const BOX_BORDER = "hsl(40 27% 82%)"

/** Stripe Elements appearance aligned with Easner business invoice UI (light). */
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
      borderRadius: FRAME_RADIUS,
      buttonBorderRadius: PILL_RADIUS,
      buttonExpressCheckoutBorderRadius: PILL_RADIUS,
      spacingUnit: "4px",
    },
    rules: {
      ".AccordionItem": {
        borderRadius: FRAME_RADIUS,
        borderColor: BOX_BORDER,
        boxShadow: "none",
      },
      ".Block": {
        borderRadius: FRAME_RADIUS,
        borderColor: BOX_BORDER,
      },
      ".PickerItem": {
        borderRadius: FRAME_RADIUS,
      },
      ".Dropdown": {
        borderRadius: FRAME_RADIUS,
      },
      ".Input": {
        borderRadius: PILL_RADIUS,
        borderColor: BOX_BORDER,
      },
      ".Tab": {
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
