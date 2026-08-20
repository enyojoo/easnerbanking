import { Turnkey } from "@turnkey/sdk-server"
import {
  getTurnkeyApiBaseUrl,
  getTurnkeyApiPrivateKey,
  getTurnkeyApiPublicKey,
  getTurnkeyDaApiPrivateKey,
  getTurnkeyDaApiPublicKey,
  getTurnkeyOrganizationId,
  isTurnkeyConfigured,
  isTurnkeyDaConfigured,
} from "@/lib/turnkey/config"

let cachedRoot: Turnkey | null = null
let cachedDaParent: Turnkey | null = null
const cachedDaSubOrgs = new Map<string, Turnkey>()

const activityPoller = { intervalMs: 1_000, numRetries: 60 }

function buildTurnkey(apiPublicKey: string, apiPrivateKey: string, organizationId: string): Turnkey {
  return new Turnkey({
    apiBaseUrl: getTurnkeyApiBaseUrl(),
    apiPrivateKey,
    apiPublicKey,
    defaultOrganizationId: organizationId,
    activityPoller,
  })
}

export function getTurnkeyServer(): Turnkey | null {
  if (!isTurnkeyConfigured()) return null
  if (!cachedRoot) {
    cachedRoot = buildTurnkey(
      getTurnkeyApiPublicKey(),
      getTurnkeyApiPrivateKey(),
      getTurnkeyOrganizationId(),
    )
  }
  return cachedRoot
}

/** Root (admin) client for the parent organization. */
export function getTurnkeyRootApiClient() {
  const t = getTurnkeyServer()
  if (!t) return null
  return t.apiClient()
}

/** @deprecated Prefer `getTurnkeyRootApiClient` for clarity. */
export function getTurnkeyApiClient() {
  return getTurnkeyRootApiClient()
}

/**
 * Root client scoped to a sub-organization (provisioner key registered as sub-org root).
 * Used for createWallet, createPolicy, createUsers – not for day-to-day sends once DA is enabled.
 */
export function getTurnkeyRootApiClientForSubOrganization(subOrganizationId: string) {
  if (!isTurnkeyConfigured()) return null
  const orgId = String(subOrganizationId ?? "").trim()
  if (!orgId) return null
  return buildTurnkey(getTurnkeyApiPublicKey(), getTurnkeyApiPrivateKey(), orgId).apiClient()
}

/** @deprecated Prefer `getTurnkeyRootApiClientForSubOrganization`. */
export function getTurnkeyApiClientForSubOrganization(subOrganizationId: string) {
  return getTurnkeyRootApiClientForSubOrganization(subOrganizationId)
}

function getTurnkeyDaServerForOrganization(organizationId: string): Turnkey | null {
  if (!isTurnkeyDaConfigured()) return null
  const orgId = String(organizationId ?? "").trim()
  if (!orgId) return null

  const parentId = getTurnkeyOrganizationId()
  if (orgId === parentId) {
    if (!cachedDaParent) {
      cachedDaParent = buildTurnkey(
        getTurnkeyDaApiPublicKey(),
        getTurnkeyDaApiPrivateKey(),
        parentId,
      )
    }
    return cachedDaParent
  }

  let cached = cachedDaSubOrgs.get(orgId)
  if (!cached) {
    cached = buildTurnkey(getTurnkeyDaApiPublicKey(), getTurnkeyDaApiPrivateKey(), orgId)
    cachedDaSubOrgs.set(orgId, cached)
  }
  return cached
}

/** DA (non-root) client for parent org omnibus signing. */
export function getTurnkeyDaApiClient() {
  const t = getTurnkeyDaServerForOrganization(getTurnkeyOrganizationId())
  if (!t) return null
  return t.apiClient()
}

/** DA client scoped to a user sub-organization. */
export function getTurnkeyDaApiClientForSubOrganization(subOrganizationId: string) {
  const t = getTurnkeyDaServerForOrganization(subOrganizationId)
  if (!t) return null
  return t.apiClient()
}

/** Clear DA client caches (tests). */
export function resetTurnkeyClientCachesForTests(): void {
  cachedRoot = null
  cachedDaParent = null
  cachedDaSubOrgs.clear()
}
