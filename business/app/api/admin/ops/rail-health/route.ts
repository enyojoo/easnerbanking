import { NextResponse } from "next/server"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { requireOfficeAdmin } from "@/lib/api/admin-auth"
import { isNewPaymentIntentsPaused } from "@/lib/ops/safe-mode"
import { validateTurnkeyEnvForProduction } from "@/lib/turnkey/config"
import { isNoahConfigured } from "@/lib/noah/config"

export const runtime = "nodejs"

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
  ] = await Promise.all([
    countWhere("wallet_provisioning_jobs", "state", "pending"),
    countWhere("wallet_provisioning_jobs", "state", "retry"),
    countWhere("wallet_provisioning_jobs", "state", "dead_letter"),
    countWhere("wallet_provisioning_jobs", "state", "awaiting_sub_org"),
    countWhere("payment_intents", "status", "awaiting_fiat"),
    countWhere("payment_intents", "status", "awaiting_crypto_deposit"),
    admin.from("event_inbox").select("id", { count: "exact", head: true }).eq("status", "failed"),
  ])

  return NextResponse.json({
    ok: true,
    safe_mode_new_intents: isNewPaymentIntentsPaused(),
    noah_configured: isNoahConfigured(),
    turnkey: validateTurnkeyEnvForProduction(),
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
