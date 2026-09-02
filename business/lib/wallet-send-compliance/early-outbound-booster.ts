import type { SupabaseClient } from "@supabase/supabase-js"
import { walletSendComplianceConfig } from "./config"
import { recentInboundTotalUsd } from "./inbound-events"
import { applyBoostedCap, loadActiveVelocityControl } from "./velocity-store"
import { notifyVelocityBooster } from "./notify-velocity"

/** On stablecoin quote: tighten cap to 10% if outbound follows a large inbound within 6h. */
export async function maybeApplyEarlyOutboundBooster(
  admin: SupabaseClient,
  businessId: string | null | undefined,
): Promise<void> {
  const id = String(businessId || "").trim()
  if (!id) return
  const cfg = walletSendComplianceConfig()
  const since = new Date(Date.now() - cfg.earlyOutboundHours * 60 * 60 * 1000).toISOString()
  const recentLarge = await recentInboundTotalUsd(admin, id, since)
  if (!(recentLarge >= cfg.earlyOutboundMinInboundUsd)) return

  const control = await loadActiveVelocityControl(admin, id)
  if (!control) return
  if (control.cap_pct <= cfg.capPctBoosted && control.metadata.booster === "early_outbound_attempt") {
    return
  }
  const updated = await applyBoostedCap(admin, control, cfg.capPctBoosted)
  await notifyVelocityBooster(admin, updated)
}
