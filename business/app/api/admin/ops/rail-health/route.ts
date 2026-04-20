import { NextResponse } from "next/server"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { requireOfficeAdmin } from "@/lib/api/admin-auth"
import { isNewPaymentIntentsPaused } from "@/lib/ops/safe-mode"
import { getTurnkeyWebhookFeatureUrl, validateTurnkeyEnvForProduction } from "@/lib/turnkey/config"
import { isNoahConfigured } from "@/lib/noah/config"

export const runtime = "nodejs"

function validateWebhookUrl(url: string): string | null {
  if (!url) return "TURNKEY_WEBHOOK_URL is not configured"
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== "https:") return "TURNKEY_WEBHOOK_URL must use https"
    return null
  } catch {
    return "TURNKEY_WEBHOOK_URL is not a valid URL"
  }
}

/** Provisioning + intent queue snapshot for Office / ops dashboards. */
export async function GET(request: Request) {
  const auth = await requireOfficeAdmin(request)
  if (!auth.ok) return auth.response

  const admin = createSupabaseAdmin()
  const countWhere = async (table: string, col: string, val: string) => {
    const { count, error } = await admin.from(table).select("*", { count: "exact", head: true }).eq(col, val)
    if (error) return null
    return count ?? 0
  }

  const [
    jobsPending,
    jobsRetry,
    jobsDead,
    jobsAwaitingSubOrg,
    intentsAwaitingFiat,
    intentsAwaitingCrypto,
    inboxFailed,
    turnkeyInboxFailed,
    turnkeyInboxProcessed24h,
  ] = await Promise.all([
    countWhere("wallet_provisioning_jobs", "state", "pending"),
    countWhere("wallet_provisioning_jobs", "state", "retry"),
    countWhere("wallet_provisioning_jobs", "state", "dead_letter"),
    countWhere("wallet_provisioning_jobs", "state", "awaiting_sub_org"),
    countWhere("payment_intents", "status", "awaiting_fiat"),
    countWhere("payment_intents", "status", "awaiting_crypto_deposit"),
    admin.from("event_inbox").select("id", { count: "exact", head: true }).eq("status", "failed"),
    admin
      .from("event_inbox")
      .select("id", { count: "exact", head: true })
      .eq("provider", "turnkey")
      .eq("status", "failed"),
    admin
      .from("event_inbox")
      .select("id", { count: "exact", head: true })
      .eq("provider", "turnkey")
      .eq("status", "processed")
      .gte("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()),
  ])

  const turnkeyWebhookUrl = getTurnkeyWebhookFeatureUrl()
  const turnkeyWebhookUrlError = validateWebhookUrl(turnkeyWebhookUrl)

  return NextResponse.json({
    ok: true,
    safe_mode_new_intents: isNewPaymentIntentsPaused(),
    noah_configured: isNoahConfigured(),
    turnkey: validateTurnkeyEnvForProduction(),
    turnkey_webhook_feature: {
      name: "FEATURE_NAME_WEBHOOK",
      value: turnkeyWebhookUrl || null,
      valid: !turnkeyWebhookUrlError,
      error: turnkeyWebhookUrlError,
    },
    turnkey_event_inbox: {
      failed: turnkeyInboxFailed.count ?? null,
      processed_24h: turnkeyInboxProcessed24h.count ?? null,
    },
    wallet_provisioning_jobs: {
      pending: jobsPending,
      retry: jobsRetry,
      dead_letter: jobsDead,
      awaiting_sub_org: jobsAwaitingSubOrg,
    },
    payment_intents: {
      awaiting_fiat: intentsAwaitingFiat,
      awaiting_crypto_deposit: intentsAwaitingCrypto,
    },
    event_inbox_failed: inboxFailed.count ?? null,
  })
}
