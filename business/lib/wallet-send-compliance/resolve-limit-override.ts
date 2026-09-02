import type { SupabaseClient } from "@supabase/supabase-js"
import type { WalletSendComplianceRail } from "@easner/shared"

export type LimitOverrideRow = {
  id: string
  businessId: string
  rail: WalletSendComplianceRail
  dailyMaxUsd: number
  expiresAt: string | null
  reason: string | null
}

export async function loadActiveLimitOverride(
  admin: SupabaseClient,
  businessId: string,
  rail: WalletSendComplianceRail,
  now = Date.now(),
): Promise<LimitOverrideRow | null> {
  const { data } = await admin
    .from("wallet_send_limit_overrides")
    .select("id,business_id,rail,daily_max_usd,expires_at,reason,lifted_at")
    .eq("business_id", businessId)
    .eq("rail", rail)
    .is("lifted_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()
  if (!data) return null
  if (data.expires_at && Date.parse(String(data.expires_at)) <= now) return null
  return {
    id: String(data.id),
    businessId: String(data.business_id),
    rail,
    dailyMaxUsd: Number(data.daily_max_usd ?? 0),
    expiresAt: data.expires_at ? String(data.expires_at) : null,
    reason: data.reason ? String(data.reason) : null,
  }
}

export async function upsertLimitOverride(
  admin: SupabaseClient,
  input: {
    businessId: string
    rail: WalletSendComplianceRail
    dailyMaxUsd: number
    expiresAt?: string | null
    reason?: string | null
    adminId?: string | null
  },
): Promise<LimitOverrideRow> {
  await admin
    .from("wallet_send_limit_overrides")
    .update({ lifted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("business_id", input.businessId)
    .eq("rail", input.rail)
    .is("lifted_at", null)

  const { data, error } = await admin
    .from("wallet_send_limit_overrides")
    .insert({
      business_id: input.businessId,
      rail: input.rail,
      daily_max_usd: input.dailyMaxUsd,
      expires_at: input.expiresAt ?? null,
      reason: input.reason ?? null,
      created_by_admin_id: input.adminId ?? null,
    })
    .select("id,business_id,rail,daily_max_usd,expires_at,reason")
    .maybeSingle()
  if (error || !data) throw new Error(error?.message || "Failed to save limit override")
  return {
    id: String(data.id),
    businessId: String(data.business_id),
    rail: input.rail,
    dailyMaxUsd: Number(data.daily_max_usd),
    expiresAt: data.expires_at ? String(data.expires_at) : null,
    reason: data.reason ? String(data.reason) : null,
  }
}

export async function liftLimitOverride(
  admin: SupabaseClient,
  businessId: string,
  rail: WalletSendComplianceRail,
): Promise<{ lifted: boolean }> {
  const { data } = await admin
    .from("wallet_send_limit_overrides")
    .update({ lifted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("business_id", businessId)
    .eq("rail", rail)
    .is("lifted_at", null)
    .select("id")
  return { lifted: Boolean(data?.length) }
}
