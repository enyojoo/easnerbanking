import type { SupabaseClient } from "@supabase/supabase-js"
import {
  getTurnkeyApiClient,
  getTurnkeyApiClientForSubOrganization,
  getTurnkeyDaApiClient,
  getTurnkeyDaApiClientForSubOrganization,
} from "@/lib/turnkey/client"
import {
  getTurnkeyOrganizationId,
  isTurnkeyDaConfigured,
  isTurnkeyDaSendsEnabled,
  isTurnkeyDaSendsStrict,
} from "@/lib/turnkey/config"
import {
  isParentOrgCustodialDaReady,
  isSubOrgCustodialDaReady,
} from "@/lib/turnkey/da-readiness"

export type TurnkeyClientLike = Record<string, (...args: unknown[]) => Promise<unknown>>

export type TurnkeySendClientScope =
  | { kind: "sub_org"; subOrganizationId: string }
  | { kind: "parent" }

export type ResolvedTurnkeySendClient =
  | {
      ok: true
      client: TurnkeyClientLike
      organizationId: string
      stampingMode: "root" | "da"
    }
  | { ok: false; error: string }

function rootClientForScope(scope: TurnkeySendClientScope): ResolvedTurnkeySendClient | null {
  if (scope.kind === "parent") {
    const orgId = getTurnkeyOrganizationId()
    const client = getTurnkeyApiClient() as TurnkeyClientLike | null
    if (!orgId || !client) return null
    return { ok: true, client, organizationId: orgId, stampingMode: "root" }
  }
  const subOrgId = scope.subOrganizationId.trim()
  const client = getTurnkeyApiClientForSubOrganization(subOrgId) as TurnkeyClientLike | null
  if (!client) return null
  return { ok: true, client, organizationId: subOrgId, stampingMode: "root" }
}

function daClientForScope(scope: TurnkeySendClientScope): ResolvedTurnkeySendClient | null {
  if (scope.kind === "parent") {
    const orgId = getTurnkeyOrganizationId()
    const client = getTurnkeyDaApiClient() as TurnkeyClientLike | null
    if (!orgId || !client) return null
    return { ok: true, client, organizationId: orgId, stampingMode: "da" }
  }
  const subOrgId = scope.subOrganizationId.trim()
  const client = getTurnkeyDaApiClientForSubOrganization(subOrgId) as TurnkeyClientLike | null
  if (!client) return null
  return { ok: true, client, organizationId: subOrgId, stampingMode: "da" }
}

/**
 * Auto-wires DA when keys are configured and org/sub-org is migrated.
 * Unmigrated orgs fall back to root during migration; set TURNKEY_DA_SENDS_STRICT=true
 * after cutover to fail closed instead.
 *
 * Explicit TURNKEY_DA_SENDS_ENABLED=false disables auto DA even if keys exist.
 */
export async function resolveTurnkeySendClient(input: {
  scope: TurnkeySendClientScope
  admin?: SupabaseClient | null
}): Promise<ResolvedTurnkeySendClient> {
  const useDaLayer = isTurnkeyDaSendsEnabled()

  if (!useDaLayer) {
    const root = rootClientForScope(input.scope)
    return root ?? { ok: false, error: "turnkey_not_configured" }
  }

  if (!isTurnkeyDaConfigured()) {
    return { ok: false, error: "turnkey_da_not_configured" }
  }

  const ready =
    input.scope.kind === "parent"
      ? await isParentOrgCustodialDaReady()
      : await isSubOrgCustodialDaReady(input.admin ?? null, input.scope.subOrganizationId)

  if (ready) {
    const da = daClientForScope(input.scope)
    return da ?? { ok: false, error: "turnkey_da_not_configured" }
  }

  if (isTurnkeyDaSendsStrict()) {
    return {
      ok: false,
      error:
        input.scope.kind === "parent"
          ? "turnkey_parent_da_not_migrated"
          : "turnkey_da_not_migrated",
    }
  }

  const root = rootClientForScope(input.scope)
  return root ?? { ok: false, error: "turnkey_not_configured" }
}

/** Status / poll helpers may use root or DA depending on who submitted the send. */
export async function resolveTurnkeySendStatusClient(input: {
  subOrganizationId?: string
  stampingMode?: "root" | "da"
  admin?: SupabaseClient | null
}): Promise<ResolvedTurnkeySendClient> {
  const subOrgId = String(input.subOrganizationId ?? "").trim()
  if (!subOrgId) {
    return resolveTurnkeySendClient({ scope: { kind: "parent" }, admin: input.admin })
  }

  if (input.stampingMode === "da") {
    const client = getTurnkeyDaApiClientForSubOrganization(subOrgId) as TurnkeyClientLike | null
    if (!client) return { ok: false, error: "turnkey_da_not_configured" }
    return { ok: true, client, organizationId: subOrgId, stampingMode: "da" }
  }

  if (input.stampingMode === "root") {
    const client = getTurnkeyApiClientForSubOrganization(subOrgId) as TurnkeyClientLike | null
    if (!client) return { ok: false, error: "turnkey_not_configured" }
    return { ok: true, client, organizationId: subOrgId, stampingMode: "root" }
  }

  return resolveTurnkeySendClient({
    scope: { kind: "sub_org", subOrganizationId: subOrgId },
    admin: input.admin,
  })
}
