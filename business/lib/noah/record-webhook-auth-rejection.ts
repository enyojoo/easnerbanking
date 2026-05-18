import { createSupabaseAdmin } from "@/lib/supabase/admin"
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
    const dedupeKey = `auth-reject-${opts.code}-${Date.now()}`
    await admin.from("webhook_deliveries").insert({
      dedupe_key: dedupeKey,
      event_type: "AuthRejected",
      noah_customer_id: null,
      event_version: null,
      payload: {
        code: opts.code,
        bodyBytes: opts.bodyBytes,
        signatureBytes: opts.signatureBytes,
        headerNames: opts.headerNames,
      } as object,
      provider: "noah",
      processed: false,
      error: opts.code,
    })
  } catch (e) {
    console.error("[noah-webhook] failed to log auth rejection:", e)
  }
}
