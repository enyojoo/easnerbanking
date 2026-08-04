import type { SupabaseClient } from "@supabase/supabase-js"
import { getStripe } from "../client"
import { ensureConnectedAccount } from "./create-connected-account"

export type CreateAccountSessionResult =
  | { ok: true; clientSecret: string; stripeAccountId: string }
  | { ok: false; error: string; status: number }

/**
 * Create an Account Session for embedded Connect Account Onboarding.
 * External account collection is disabled — Easner links Grid VA via API.
 */
export async function createConnectAccountSession(
  admin: SupabaseClient,
  input: { businessId: string; email?: string | null },
): Promise<CreateAccountSessionResult> {
  try {
    const row = await ensureConnectedAccount(admin, input)
    const stripe = getStripe()
    const session = await stripe.accountSessions.create({
      account: row.stripe_account_id,
      components: {
        account_onboarding: {
          enabled: true,
          features: {
            // Easner links Grid VA as payout destination after onboarding.
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
