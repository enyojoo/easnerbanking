import type { SupabaseClient } from "@supabase/supabase-js"
import {
  getTurnkeyParentDaUserIdFromEnv,
  isTurnkeyParentDaReady,
} from "@/lib/turnkey/config"
import { resolveParentOrgCustodialDaUserId } from "@/lib/turnkey/turnkey-org-users"

const subOrgReadyCache = new Map<string, boolean>()
let parentReadyCache: boolean | null = null
let parentReadyInflight: Promise<boolean> | null = null

/** Clear readiness cache (tests). */
export function resetTurnkeyDaReadinessCacheForTests(): void {
  subOrgReadyCache.clear()
  parentReadyCache = null
  parentReadyInflight = null
}

export function markSubOrgDaReadyInCache(subOrganizationId: string): void {
  const id = String(subOrganizationId ?? "").trim()
  if (id) subOrgReadyCache.set(id, true)
}

export function markParentOrgDaReadyInCache(): void {
  parentReadyCache = true
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
 * Parent org is DA-ready when easner-da exists (env id, legacy flag, or Turnkey listUsers).
 */
export async function isParentOrgCustodialDaReady(): Promise<boolean> {
  if (parentReadyCache === true) return true
  if (getTurnkeyParentDaUserIdFromEnv()) return true
  if (
    process.env.TURNKEY_PARENT_DA_READY === "1" ||
    process.env.TURNKEY_PARENT_DA_READY === "true"
  ) {
    return true
  }
  if (process.env.TURNKEY_PARENT_DA_READY === "false") return false

  if (parentReadyInflight) return parentReadyInflight

  parentReadyInflight = (async () => {
    const userId = await resolveParentOrgCustodialDaUserId()
    const ready = Boolean(userId)
    if (ready) parentReadyCache = true
    return ready
  })().finally(() => {
    parentReadyInflight = null
  })

  return parentReadyInflight
}

/** @deprecated Sync check — prefer `isParentOrgCustodialDaReady()`. */
export function isParentOrgCustodialDaReadySync(): boolean {
  return isTurnkeyParentDaReady() || parentReadyCache === true
}
