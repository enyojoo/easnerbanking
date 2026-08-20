import type { SupabaseClient } from "@supabase/supabase-js"
import { getTurnkeyRootApiClient } from "@/lib/turnkey/client"
import {
  getTurnkeyOrganizationId,
  getTurnkeyParentDaUserIdFromEnv,
  isTurnkeyParentDaReady,
} from "@/lib/turnkey/config"
import { CUSTODIAL_DA_POLICY_NAMES } from "@/lib/turnkey/policies/custodial-da-policies"
import { resolveParentOrgCustodialDaUserId } from "@/lib/turnkey/turnkey-org-users"

const subOrgReadyCache = new Map<string, boolean>()
let parentReadyCache: boolean | null = null
let parentReadyInflight: Promise<boolean> | null = null
let parentPoliciesReadyCache: boolean | null = null
let parentPoliciesReadyInflight: Promise<boolean> | null = null
let migrationCompleteCache: boolean | null = null

export type CustodialDaMigrationStatus = {
  complete: boolean
  subOrgsTotal: number
  subOrgsMigrated: number
  unmigratedSubOrgIds: string[]
  parentDaUserReady: boolean
  parentPoliciesReady: boolean
}

/** Clear readiness cache (tests). */
export function resetTurnkeyDaReadinessCacheForTests(): void {
  subOrgReadyCache.clear()
  parentReadyCache = null
  parentReadyInflight = null
  parentPoliciesReadyCache = null
  parentPoliciesReadyInflight = null
  migrationCompleteCache = null
}

export function markSubOrgDaReadyInCache(subOrganizationId: string): void {
  const id = String(subOrganizationId ?? "").trim()
  if (id) subOrgReadyCache.set(id, true)
}

export function markParentOrgDaReadyInCache(): void {
  parentReadyCache = true
  parentPoliciesReadyCache = true
}

export function markCustodialDaMigrationCompleteInCache(): void {
  migrationCompleteCache = true
  markParentOrgDaReadyInCache()
}

async function areParentCustodialDaPoliciesLive(): Promise<boolean> {
  if (parentPoliciesReadyCache === true) return true
  if (parentPoliciesReadyInflight) return parentPoliciesReadyInflight

  parentPoliciesReadyInflight = (async () => {
    const client = getTurnkeyRootApiClient()
    const orgId = getTurnkeyOrganizationId()
    if (!client || !orgId || typeof client.getPolicies !== "function") return false

    const res = await client.getPolicies({ organizationId: orgId })
    const policies = (res as { policies?: Array<{ policyName?: string }> }).policies ?? []
    const names = new Set(
      policies.map((p) => String(p.policyName ?? "").trim()).filter(Boolean),
    )
    const ready = Object.values(CUSTODIAL_DA_POLICY_NAMES).every((name) => names.has(name))
    if (ready) parentPoliciesReadyCache = true
    return ready
  })().finally(() => {
    parentPoliciesReadyInflight = null
  })

  return parentPoliciesReadyInflight
}

/**
 * Sub-org is DA-ready when `wallet_owners.turnkey_da_user_id` is set (bootstrap or migration).
 */
export async function isSubOrgCustodialDaReady(
  admin: SupabaseClient | null | undefined,
  subOrganizationId: string,
): Promise<boolean> {
  const subOrgId = String(subOrganizationId ?? "").trim()
  if (!subOrgId) return false

  const cached = subOrgReadyCache.get(subOrgId)
  if (cached === true) return true

  if (!admin) return false

  const { data } = await admin
    .from("wallet_owners")
    .select("turnkey_da_user_id")
    .eq("turnkey_sub_organization_id", subOrgId)
    .not("turnkey_da_user_id", "is", null)
    .limit(1)
    .maybeSingle()

  const ready = Boolean(String(data?.turnkey_da_user_id ?? "").trim())
  if (ready) subOrgReadyCache.set(subOrgId, true)
  return ready
}

/**
 * Parent org is DA-ready when easner-da exists and the custodial policy pack is live.
 */
export async function isParentOrgCustodialDaReady(): Promise<boolean> {
  if (parentReadyCache === true) return true
  if (process.env.TURNKEY_PARENT_DA_READY === "false") return false

  if (parentReadyInflight) return parentReadyInflight

  parentReadyInflight = (async () => {
    const userId =
      getTurnkeyParentDaUserIdFromEnv() || (await resolveParentOrgCustodialDaUserId())
    if (!userId) return false
    const policiesOk = await areParentCustodialDaPoliciesLive()
    const ready = policiesOk
    if (ready) {
      parentReadyCache = true
      parentPoliciesReadyCache = true
    }
    return ready
  })().finally(() => {
    parentReadyInflight = null
  })

  return parentReadyInflight
}

/** @deprecated Sync check – prefer `isParentOrgCustodialDaReady()`. */
export function isParentOrgCustodialDaReadySync(): boolean {
  return isTurnkeyParentDaReady() || parentReadyCache === true
}

/** Inventory linked sub-orgs vs DB migration markers + parent Turnkey state. */
export async function assessCustodialDaMigration(
  admin: SupabaseClient | null | undefined,
): Promise<CustodialDaMigrationStatus> {
  const parentDaUserReady = Boolean(
    getTurnkeyParentDaUserIdFromEnv() || (await resolveParentOrgCustodialDaUserId()),
  )
  const parentPoliciesReady = await areParentCustodialDaPoliciesLive()

  let subOrgsTotal = 0
  let subOrgsMigrated = 0
  const unmigratedSubOrgIds: string[] = []

  if (admin) {
    const { data } = await admin
      .from("wallet_owners")
      .select("turnkey_sub_organization_id, turnkey_da_user_id")
      .not("turnkey_sub_organization_id", "is", null)

    const bySub = new Map<string, boolean>()
    for (const row of data ?? []) {
      const sub = String(row.turnkey_sub_organization_id ?? "").trim()
      if (!sub) continue
      const hasDa = Boolean(String(row.turnkey_da_user_id ?? "").trim())
      bySub.set(sub, (bySub.get(sub) ?? false) || hasDa)
    }

    subOrgsTotal = bySub.size
    for (const [sub, ready] of bySub) {
      if (ready) subOrgsMigrated += 1
      else unmigratedSubOrgIds.push(sub)
    }
  }

  const complete =
    parentDaUserReady &&
    parentPoliciesReady &&
    (subOrgsTotal === 0 || subOrgsMigrated >= subOrgsTotal)

  if (complete) migrationCompleteCache = true

  return {
    complete,
    subOrgsTotal,
    subOrgsMigrated,
    unmigratedSubOrgIds,
    parentDaUserReady,
    parentPoliciesReady,
  }
}

/**
 * True when parent + every linked sub-org is migrated. Replaces manual
 * `TURNKEY_DA_SENDS_STRICT=true` for fail-closed behavior on stragglers.
 */
export async function isCustodialDaMigrationComplete(
  admin?: SupabaseClient | null,
): Promise<boolean> {
  if (migrationCompleteCache === true) return true
  if (!admin) return false
  const status = await assessCustodialDaMigration(admin)
  return status.complete
}
