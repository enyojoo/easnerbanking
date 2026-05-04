import { Turnkey } from "@turnkey/sdk-server"
import {
  getTurnkeyApiBaseUrl,
  getTurnkeyApiPrivateKey,
  getTurnkeyApiPublicKey,
  getTurnkeyOrganizationId,
  isTurnkeyConfigured,
} from "@/lib/turnkey/config"

let cached: Turnkey | null = null

export function getTurnkeyServer(): Turnkey | null {
  if (!isTurnkeyConfigured()) return null
  if (!cached) {
    cached = new Turnkey({
      apiBaseUrl: getTurnkeyApiBaseUrl(),
      apiPrivateKey: getTurnkeyApiPrivateKey(),
      apiPublicKey: getTurnkeyApiPublicKey(),
      defaultOrganizationId: getTurnkeyOrganizationId(),
      /** Default SDK poller (3×1s) can return before `solSendTransaction` result is merged; then we mis-parse `id` as status id. */
      activityPoller: { intervalMs: 1_000, numRetries: 60 },
    })
  }
  return cached
}

export function getTurnkeyApiClient() {
  const t = getTurnkeyServer()
  if (!t) return null
  return t.apiClient()
}

/**
 * Client scoped to a sub-organization, using the same API keypair registered on a root user in that sub-org.
 * Required for `createWallet` / balance queries: parent-org stamps cannot target a sub-org (ORGANIZATION_MISMATCH).
 */
export function getTurnkeyApiClientForSubOrganization(subOrganizationId: string) {
  if (!isTurnkeyConfigured()) return null
  const orgId = String(subOrganizationId ?? "").trim()
  if (!orgId) return null
  const turnkey = new Turnkey({
    apiBaseUrl: getTurnkeyApiBaseUrl(),
    apiPrivateKey: getTurnkeyApiPrivateKey(),
    apiPublicKey: getTurnkeyApiPublicKey(),
    defaultOrganizationId: orgId,
    activityPoller: { intervalMs: 1_000, numRetries: 60 },
  })
  return turnkey.apiClient()
}
