import { NextResponse } from "next/server"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import {
  getNoahBaseUrl,
  getNoahProductionConfigIssues,
  getNoahSettlementCryptoCurrency,
  getNoahSigningPrivateKey,
  isNoahConfigured,
  isNoahSigningConfigured,
} from "@/lib/noah/config"
import { loadNoahSigningKeyMaterial } from "@/lib/noah/normalize-signing-key"
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
  if (!isNoahSigningConfigured()) {
    checks.noah_signing = "missing NOAH_SIGNING_PRIVATE_KEY (required for production Api-Signature)"
  } else {
    try {
      const material = loadNoahSigningKeyMaterial(getNoahSigningPrivateKey())
      checks.noah_signing = `ok (${material.algorithm}, curve ${material.key.asymmetricKeyDetails?.namedCurve ?? "unknown"})`
    } catch (e) {
      checks.noah_signing = e instanceof Error ? e.message : "invalid NOAH_SIGNING_PRIVATE_KEY PEM"
    }
  }
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
