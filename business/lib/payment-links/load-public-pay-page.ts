import { buildPublicPaymentLinkPayload, type PublicPaymentLinkPayload } from "@/lib/payment-links/public-payload"
import { resolvePublicPayPath } from "@/lib/payment-links/resolve-public-path"
import { startPaymentLinkCheckout } from "@/lib/payment-links/start-payment-link-checkout"
import { createSupabaseAdmin } from "@/lib/supabase/admin"

export type PublicPayStripeCheckout = {
  clientSecret: string
  publishableKey: string
}

export type PublicPayPageResult =
  | { kind: "not_found" }
  | { kind: "stablecoin_session"; sessionId: string }
  | {
      kind: "payment_link"
      payload: PublicPaymentLinkPayload
      stripeCheckout: PublicPayStripeCheckout | null
    }

/** Server load for the public pay HTML document — includes checkout when card/bank is on. */
export async function loadPublicPayPage(parts: string[]): Promise<PublicPayPageResult> {
  const admin = createSupabaseAdmin()
  const resolved = await resolvePublicPayPath(admin, parts)

  if (resolved.kind === "stablecoin_session") {
    return { kind: "stablecoin_session", sessionId: resolved.sessionId }
  }
  if (resolved.kind === "not_found") {
    return { kind: "not_found" }
  }

  const payload = await buildPublicPaymentLinkPayload(admin, resolved.row)
  let stripeCheckout: PublicPayStripeCheckout | null = null
  if (payload.link.rail === "card_bank" && payload.onlinePaymentsEnabled) {
    const started = await startPaymentLinkCheckout(admin, resolved.row)
    if (started.ok) {
      stripeCheckout = {
        clientSecret: started.clientSecret,
        publishableKey: started.publishableKey,
      }
    }
  }

  return { kind: "payment_link", payload, stripeCheckout }
}
