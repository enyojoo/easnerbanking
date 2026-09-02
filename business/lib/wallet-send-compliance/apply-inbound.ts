import type { SupabaseClient } from "@supabase/supabase-js"
import type { WalletSendInboundSource } from "@easner/shared"
import { recordInboundEvent } from "./inbound-events"
import {
  appendTriggerLog,
  evaluateBusinessVelocityTrigger,
  upsertVelocityControl,
} from "./velocity-store"
import { maybeNotifyRepeatEscalation, notifyVelocityTrigger } from "./notify-velocity"

export async function maybeApplyVelocityControl(
  admin: SupabaseClient,
  input: {
    businessId: string | null | undefined
    amountUsd: number
    source: WalletSendInboundSource
    transactionId?: string | null
    creditKey?: string | null
    metadata?: Record<string, unknown>
  },
): Promise<void> {
  const businessId = String(input.businessId || "").trim()
  if (!businessId || !(input.amountUsd > 0)) return

  const recorded = await recordInboundEvent(admin, {
    businessId,
    amountUsd: input.amountUsd,
    source: input.source,
    transactionId: input.transactionId,
    creditKey: input.creditKey,
    metadata: input.metadata,
  })
  if (!recorded.recorded && !recorded.id) {
    // Duplicate credit key is still worth re-evaluating in case prior insert raced.
  }

  try {
    const trigger = await evaluateBusinessVelocityTrigger(admin, businessId)
    if (!trigger.triggered || !trigger.reason) return
    const { control, created } = await upsertVelocityControl(admin, { businessId, trigger })
    if (created) {
      await appendTriggerLog(admin, {
        businessId,
        controlId: control.id,
        reason: trigger.reason,
        inboundTotalUsd: trigger.inboundTotalUsd,
      })
      await notifyVelocityTrigger(admin, control)
      await maybeNotifyRepeatEscalation(admin, control)
    }
  } catch (err) {
    console.error("[wallet-send-compliance] maybeApplyVelocityControl failed:", err)
  }
}
