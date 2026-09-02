import type { SupabaseClient } from "@supabase/supabase-js"
import {
  dailyLimitUsdForTier,
  resolveWalletSendDailyTier,
  type WalletSendDailyTier,
} from "@easner/shared"
import { walletSendComplianceConfig } from "./config"
import { lastTriggerAt } from "./velocity-store"

export async function resolveBusinessDailyTier(
  admin: SupabaseClient,
  businessId: string,
  now = Date.now(),
): Promise<{ tier: WalletSendDailyTier; limitUsd: number; createdAt: string | null }> {
  const cfg = walletSendComplianceConfig()
  const { data: business } = await admin
    .from("businesses")
    .select("created_at")
    .eq("id", businessId)
    .maybeSingle()
  const createdAt = business?.created_at ? String(business.created_at) : null

  const [{ data: restriction }, lastVelocity] = await Promise.all([
    admin
      .from("account_restrictions")
      .select("restricted_at")
      .eq("business_id", businessId)
      .order("restricted_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    lastTriggerAt(admin, businessId),
  ])

  const tier = resolveWalletSendDailyTier({
    businessCreatedAt: createdAt,
    now,
    youngMaxAgeDays: cfg.youngMaxAgeDays,
    cleanDays: cfg.establishedCleanDays,
    lastVelocityTriggerAt: lastVelocity,
    lastRestrictionAt: restriction?.restricted_at ? String(restriction.restricted_at) : null,
  })
  const limitUsd =
    tier === "young"
      ? cfg.dailyYoungUsd
      : tier === "established"
        ? cfg.dailyEstablishedUsd
        : cfg.dailyStandardUsd
  return { tier, limitUsd: limitUsd || dailyLimitUsdForTier(tier), createdAt }
}
