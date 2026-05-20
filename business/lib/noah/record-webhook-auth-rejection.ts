import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { recordEventInbox, markEventInboxProcessed } from "@/lib/webhooks/event-inbox"
import type { NoahWebhookVerifyFailureCode } from "./webhook-verify"

/**
 * Optional audit row when signature verification fails (no payload stored).
 * Enable with NOAH_WEBHOOK_LOG_REJECTED=true on the business API deployment.
 */
export async function recordNoahWebhookAuthRejection(opts: {
  code: NoahWebhookVerifyFailureCode
  bodyBytes: number
  signatureBytes: number | null
  headerNames: string[]
}): Promise<void> {
  if (process.env.NOAH_WEBHOOK_LOG_REJECTED !== "true" && process.env.NOAH_WEBHOOK_LOG_REJECTED !== "1") {
    return
  }

  try {
    const admin = createSupabaseAdmin()
    const eventId = `noah:auth-reject:${opts.code}:${Date.now()}`
    await recordEventInbox(admin, {
      provider: "noah",
      eventId,
      eventType: "AuthRejected",
      payload: {
        code: opts.code,
        bodyBytes: opts.bodyBytes,
        signatureBytes: opts.signatureBytes,
        headerNames: opts.headerNames,
      },
    })
    await markEventInboxProcessed(admin, "noah", eventId, opts.code)
  } catch (e) {
    console.error("[noah-webhook] failed to log auth rejection:", e)
  }
}
