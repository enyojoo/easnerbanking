/**
 * Payment Element `fields` for Checkout.
 *
 * `fields.card.billingDetails` overrides the parent for cards. If it only sets
 * `name: "always"`, Stripe defaults card email to `auto` and can drop the
 * session email we pass on confirm. Mirror email on both so payment-link cards
 * still use the page Email field + `updateEmail` / `confirm({ email })`.
 */
export function paymentElementBillingFields(input: {
  collectEmail?: boolean
  knownEmail?: string | null
}): {
  billingDetails: { name: "always"; email?: "never" }
  card: { billingDetails: { name: "always"; email?: "never" } }
} {
  const hideStripeEmail = Boolean(input.collectEmail || String(input.knownEmail ?? "").trim())
  const billingDetails = hideStripeEmail
    ? ({ name: "always" as const, email: "never" as const })
    : ({ name: "always" as const })
  return {
    billingDetails,
    card: { billingDetails },
  }
}
