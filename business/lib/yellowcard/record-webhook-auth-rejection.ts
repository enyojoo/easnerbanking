import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { recordEventInbox, markEventInboxProcessed } from "@/lib/webhooks/event-inbox"
import type { YellowcardWebhookVerifyDiagnostic } from "./webhook-verify"

/**
 * Optional audit row when signature verification fails (no payload stored).
 * Enable with YELLOWCARD_WEBHOOK_LOG_REJECTED=true on the business API deployment.
 */
export async function recordYellowcardWebhookAuthRejection(opts: {
  code: NonNullable<YellowcardWebhookVerifyDiagnostic["code"]>
  bodyBytes: number
  signatureBytes: number | null
}): Promise<void> {
  if (
    process.env.YELLOWCARD_WEBHOOK_LOG_REJECTED !== "true" &&
    process.env.YELLOWCARD_WEBHOOK_LOG_REJECTED !== "1"
  ) {
    return
  }

  try {
    const admin = createSupabaseAdmin()
    const eventId = `yellowcard:auth-reject:${opts.code}:${Date.now()}`
    await recordEventInbox(admin, {
      provider: "yellowcard",
      eventId,
      eventType: "AuthRejected",
      payload: {
        code: opts.code,
        bodyBytes: opts.bodyBytes,
        signatureBytes: opts.signatureBytes,
      },
    })
    await markEventInboxProcessed(admin, "yellowcard", eventId, opts.code)
  } catch (e) {
    console.error("[yellowcard-webhook] failed to log auth rejection:", e)
  }
}
