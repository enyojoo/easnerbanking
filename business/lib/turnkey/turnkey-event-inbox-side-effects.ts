import type { SupabaseClient } from "@supabase/supabase-js"
import { applyTurnkeyBalanceWebhookSideEffects } from "@/lib/turnkey/balance-webhook-sync"
import { applyTurnkeyWebhookSideEffects } from "@/lib/turnkey/chain-sync"
import { isTurnkeyBalanceConfirmedPayload } from "@/lib/turnkey/turnkey-webhook-classify"
import { parseTurnkeyBalanceWebhookPayload } from "@/lib/turnkey/turnkey-balance-webhook-payload"

/** Shared Turnkey inbox replay path (balance deposits + activity chain sync). */
export async function applyTurnkeyEventInboxSideEffects(
  admin: SupabaseClient,
  payload: unknown,
  eventId: string,
): Promise<void> {
  const p = payload as Record<string, unknown>
  const balanceParsed = parseTurnkeyBalanceWebhookPayload(payload)
  if (balanceParsed.kind === "deposit") {
    await applyTurnkeyBalanceWebhookSideEffects(admin, balanceParsed.data, eventId)
    return
  }
  if (balanceParsed.kind === "withdraw") {
    return
  }
  if (isTurnkeyBalanceConfirmedPayload(p)) {
    console.warn("turnkey_webhook: balance-shaped payload could not be parsed for ingest", {
      eventId,
      eventType: p.eventType ?? p.type,
    })
    return
  }
  await applyTurnkeyWebhookSideEffects(admin, p, eventId)
}
