import { NextResponse } from "next/server"
import { isNoahConfigured, isNoahSigningConfigured } from "@/lib/noah/config"
import { isGridConfigured } from "@/lib/grid/config"
import { isYellowcardConfigured } from "@/lib/yellowcard/config"

export type PayoutEnvProviderId = "noah" | "yellowcard" | "grid"

function providerUnavailable(message: string): NextResponse {
  return NextResponse.json({ error: message, code: "PROVIDER_ENV_UNAVAILABLE" }, { status: 503 })
}

/** True when Yellowcard API credentials are present. */
export function isYellowcardEnvReady(): boolean {
  return isYellowcardConfigured()
}

/** True when Grid API credentials are present. */
export function isGridEnvReady(): boolean {
  return isGridConfigured()
}

/** True when Noah API + signing are present. */
export function isNoahEnvReady(): boolean {
  return isNoahConfigured() && isNoahSigningConfigured()
}

/**
 * Provider-scoped env gate for balance payout quote/confirm/execute.
 * Manual Office routing must not require Noah credentials when primary is YC/Grid.
 */
export function requirePayoutProviderEnv(provider: PayoutEnvProviderId): NextResponse | null {
  if (provider === "yellowcard") {
    if (!isYellowcardEnvReady()) {
      return providerUnavailable(
        "Yellowcard payouts are not available in this environment. Configure Yellowcard API credentials.",
      )
    }
    return null
  }
  if (provider === "grid") {
    if (!isGridEnvReady()) {
      return providerUnavailable(
        "Grid payouts are not available in this environment. Configure Grid API credentials.",
      )
    }
    return null
  }
  if (!isNoahConfigured()) {
    return providerUnavailable(
      "Easner payments are not available in this environment. If you administer this deployment, configure the payment provider credentials.",
    )
  }
  if (!isNoahSigningConfigured()) {
    return providerUnavailable(
      "Noah production signing is not configured. Set NOAH_SIGNING_PRIVATE_KEY on the business API deployment.",
    )
  }
  return null
}
