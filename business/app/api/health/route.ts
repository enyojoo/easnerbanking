import { NextResponse } from "next/server"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import {
  getNoahBaseUrl,
  getNoahProductionConfigIssues,
  getNoahSettlementCryptoCurrency,
  isNoahConfigured,
  isNoahSigningConfigured,
} from "@/lib/noah/config"
import {
  isTurnkeyConfigured,
  validateTurnkeyEnvForProduction,
} from "@/lib/turnkey/config"
import { getTurnkeyApiClient } from "@/lib/turnkey/client"
import { isNewPaymentIntentsPaused } from "@/lib/ops/safe-mode"

/**
 * Liveness + dependency checks (Phase A smoke).
 */
export async function GET() {
  const checks: Record<string, string> = {}

  try {
    const admin = createSupabaseAdmin()
    const { error } = await admin.from("users").select("id").limit(1)
    checks.supabase = error ? `error: ${error.message}` : "ok"
  } catch (e) {
    checks.supabase = e instanceof Error ? e.message : "error"
  }

  checks.noah = isNoahConfigured() ? "configured" : "missing NOAH_API_KEY"
  checks.noah_environment = "production"
  checks.noah_base_url = getNoahBaseUrl()
  checks.noah_signing = isNoahSigningConfigured()
    ? "ok"
    : "missing NOAH_SIGNING_PRIVATE_KEY (required for production Api-Signature)"
  checks.noah_settlement_crypto = getNoahSettlementCryptoCurrency()
  const noahIssues = getNoahProductionConfigIssues()
  checks.noah_production = noahIssues.length === 0 ? "ok" : noahIssues.join("; ")

  const tk = validateTurnkeyEnvForProduction()
  checks.turnkey = tk.ok
    ? "configured"
    : `missing: ${tk.missing.join(", ")}`
  if (tk.ok) {
    try {
      const client = getTurnkeyApiClient()
      if (client) {
        await client.getWhoami({})
        checks.turnkey_api = "ok"
      } else {
        checks.turnkey_api = "no_client"
      }
    } catch (e) {
      checks.turnkey_api = e instanceof Error ? e.message : "error"
    }
  } else {
    checks.turnkey_api = "skipped"
  }

  checks.safe_mode_new_intents = isNewPaymentIntentsPaused() ? "paused" : "off"

  const ok = checks.supabase === "ok"
  return NextResponse.json({ ok, checks }, { status: ok ? 200 : 503 })
}
