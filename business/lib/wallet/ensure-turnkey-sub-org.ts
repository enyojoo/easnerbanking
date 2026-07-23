import type { SupabaseClient } from "@supabase/supabase-js"
import {
  isTurnkeyConfigured,
  isTurnkeyServerSubOrgCreationEnabled,
} from "@/lib/turnkey/config"
import { getWalletOwnerId } from "@/lib/wallet/resolve-wallet-owner"
import { createEasnerTurnkeySubOrganization } from "@/lib/wallet/turnkey-create-sub-org"
import { linkTurnkeySubOrganizationAndEnqueueVaults } from "@/lib/wallet/turnkey-wallet-db"

function sanitizeSubOrgNamePart(s: string): string {
  return s.replace(/[^a-zA-Z0-9-_.]/g, "-").slice(0, 64)
}

type EnsureResult =
  | { ok: true; subOrganizationId: string; created: boolean }
  | { ok: false; reason: string }

const ensureInflight = new Map<string, Promise<EnsureResult>>()

function ownerKey(scope: "individual" | "business", subjectUserId: string, subjectBusinessId: string | null): string {
  if (scope === "business" && subjectBusinessId) return `business:${subjectBusinessId}`
  return `individual:${subjectUserId}`
}

/**
 * Idempotent: if `wallet_owners` already has `turnkey_sub_organization_id`, no-op.
 * Otherwise creates a Turnkey sub-org with the parent API key and links it.
 * Concurrent callers for the same owner share one in-flight create+link (process singleflight).
 * Errors are swallowed by callers that must not fail bootstrap (log only).
 */
export async function ensureTurnkeySubOrgForEasnerOwner(input: {
  admin: SupabaseClient
  scope: "individual" | "business"
  subjectUserId: string
  subjectBusinessId: string | null
  noahCustomerId: string
  userEmail: string | null | undefined
  displayName: string | null | undefined
}): Promise<EnsureResult> {
  const key = ownerKey(input.scope, input.subjectUserId, input.subjectBusinessId)
  const existing = ensureInflight.get(key)
  if (existing) return existing

  const promise = ensureTurnkeySubOrgForEasnerOwnerInner(input).finally(() => {
    if (ensureInflight.get(key) === promise) ensureInflight.delete(key)
  })
  ensureInflight.set(key, promise)
  return promise
}

async function ensureTurnkeySubOrgForEasnerOwnerInner(input: {
  admin: SupabaseClient
  scope: "individual" | "business"
  subjectUserId: string
  subjectBusinessId: string | null
  noahCustomerId: string
  userEmail: string | null | undefined
  displayName: string | null | undefined
}): Promise<EnsureResult> {
  if (!isTurnkeyConfigured() || !isTurnkeyServerSubOrgCreationEnabled()) {
    return { ok: false, reason: "turnkey_disabled" }
  }

  const email = String(input.userEmail ?? "").trim().toLowerCase()
  if (!email || !email.includes("@")) {
    return { ok: false, reason: "email_required" }
  }

  const ownerType: "individual" | "business" = input.scope === "business" ? "business" : "individual"
  const ownerRef =
    input.scope === "business" && input.subjectBusinessId
      ? input.subjectBusinessId
      : input.subjectUserId

  const existingOwnerId = await getWalletOwnerId(input.admin, ownerType, ownerRef)
  if (existingOwnerId) {
    const { data: row } = await input.admin
      .from("wallet_owners")
      .select("turnkey_sub_organization_id")
      .eq("id", existingOwnerId)
      .maybeSingle()
    const existingSub = String(row?.turnkey_sub_organization_id ?? "").trim()
    if (existingSub) {
      return { ok: true, subOrganizationId: existingSub, created: false }
    }
  }

  const label =
    (typeof input.displayName === "string" && input.displayName.trim()) ||
    email.split("@")[0] ||
    "user"
  const subOrganizationName = `easner-${sanitizeSubOrgNamePart(ownerType)}-${sanitizeSubOrgNamePart(ownerRef)}`

  let subOrganizationId: string
  try {
    subOrganizationId = await createEasnerTurnkeySubOrganization({
      subOrganizationName,
      userName: label.slice(0, 200),
      userEmail: email,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error("[ensureTurnkeySubOrgForEasnerOwner] createSubOrganization:", msg)
    return { ok: false, reason: msg || "turnkey_create_failed" }
  }

  try {
    await linkTurnkeySubOrganizationAndEnqueueVaults(input.admin, {
      ownerType,
      ownerRef,
      turnkeySubOrganizationId: subOrganizationId,
      noahCustomerId: input.noahCustomerId,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error("[ensureTurnkeySubOrgForEasnerOwner] link:", msg)
    return { ok: false, reason: msg || "link_failed" }
  }

  return { ok: true, subOrganizationId, created: true }
}
