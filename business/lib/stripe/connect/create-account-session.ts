import type { SupabaseClient } from "@supabase/supabase-js"
import { getStripe } from "../client"
import { acceptStripeConnectTermsOfService } from "./accept-platform-tos"
import { ensureConnectedAccount } from "./create-connected-account"
import { autoLinkGridVaPayoutIfEligible } from "./auto-link-grid-va-payout"

export type CreateAccountSessionResult =
  | { ok: true; clientSecret: string; stripeAccountId: string }
  | { ok: false; error: string; status: number }

/**
 * Create an Account Session for embedded Connect Account Onboarding.
 * External account collection is disabled – Easner links the Office-routed VA via API.
 */
export async function createConnectAccountSession(
  admin: SupabaseClient,
  input: { businessId: string; email?: string | null; clientIp?: string | null },
): Promise<CreateAccountSessionResult> {
  try {
    const row = await ensureConnectedAccount(admin, input)
    if (input.clientIp?.trim()) {
      try {
        await acceptStripeConnectTermsOfService(row.stripe_account_id, input.clientIp.trim())
      } catch (e) {
        console.warn("[stripe-connect] tos acceptance update failed:", e)
      }
    }
    const autoLink = await autoLinkGridVaPayoutIfEligible(admin, { businessId: input.businessId })
    if (!autoLink.skipped && !autoLink.ok) {
      console.warn("[stripe-connect] VA payout link before onboarding failed:", autoLink.error)
    }
    const stripe = getStripe()
    const session = await stripe.accountSessions.create({
      account: row.stripe_account_id,
      components: {
        account_onboarding: {
          enabled: true,
          features: {
            // Easner links the business VA as payout destination after onboarding.
            external_account_collection: false,
          },
        },
        account_management: {
          enabled: true,
          features: {
            external_account_collection: false,
          },
        },
      },
    })

    if (!session.client_secret) {
      return { ok: false, error: "Account Session missing client_secret", status: 500 }
    }

    return {
      ok: true,
      clientSecret: session.client_secret,
      stripeAccountId: row.stripe_account_id,
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to create Account Session"
    return { ok: false, error: msg, status: 500 }
  }
}
