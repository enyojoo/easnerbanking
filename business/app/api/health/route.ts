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
import { assertNoahEs384SigningPrivateKeyPem } from "@/lib/noah/normalize-signing-key"
import { getNoahWebhookVerifyPublicKeys } from "@/lib/noah/webhook-verify"
import {
  isTurnkeyDaConfigured,
  isTurnkeyRootProvisioningConfigured,
  isTurnkeySendRuntimeConfigured,
  validateTurnkeyEnvForProduction,
} from "@/lib/turnkey/config"
import { getTurnkeyApiClient, getTurnkeyDaApiClient } from "@/lib/turnkey/client"
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
      assertNoahEs384SigningPrivateKeyPem(getNoahSigningPrivateKey())
      checks.noah_signing = "ok (ES384, secp384r1)"
    } catch (e) {
      checks.noah_signing = e instanceof Error ? e.message : "invalid NOAH_SIGNING_PRIVATE_KEY PEM"
    }
  }
  checks.noah_settlement_crypto = getNoahSettlementCryptoCurrency()
  const noahIssues = getNoahProductionConfigIssues()
  checks.noah_production = noahIssues.length === 0 ? "ok" : noahIssues.join("; ")
  const webhookEnv = process.env.NOAH_WEBHOOK_NOAH_ENV?.trim() || "production (default)"
  checks.noah_webhook_keys = `${getNoahWebhookVerifyPublicKeys().length} key(s); NOAH_WEBHOOK_NOAH_ENV=${webhookEnv}`
  if (process.env.NOAH_WEBHOOK_PUBLIC_KEY?.trim()) {
    checks.noah_webhook_note =
      "NOAH_WEBHOOK_PUBLIC_KEY is set — remove it unless Noah gave a custom key (wrong value causes 401)"
  }

  const tk = validateTurnkeyEnvForProduction()
  checks.turnkey = tk.ok
    ? "configured"
    : `missing: ${tk.missing.join(", ")}`
  checks.turnkey_send_runtime = isTurnkeySendRuntimeConfigured() ? "ok" : "missing_da_keys"
  checks.turnkey_root_provisioning = isTurnkeyRootProvisioningConfigured() ? "ok" : "optional_missing"

  if (isTurnkeyDaConfigured()) {
    try {
      const daClient = getTurnkeyDaApiClient()
      if (daClient) {
        await daClient.getWhoami({})
        checks.turnkey_da_api = "ok"
      } else {
        checks.turnkey_da_api = "no_client"
      }
    } catch (e) {
      checks.turnkey_da_api = e instanceof Error ? e.message : "error"
    }
  } else {
    checks.turnkey_da_api = "skipped"
  }

  if (isTurnkeyRootProvisioningConfigured()) {
    try {
      const client = getTurnkeyApiClient()
      if (client) {
        await client.getWhoami({})
        checks.turnkey_root_api = "ok"
      } else {
        checks.turnkey_root_api = "no_client"
      }
    } catch (e) {
      checks.turnkey_root_api = e instanceof Error ? e.message : "error"
    }
  } else {
    checks.turnkey_root_api = "skipped"
  }

  checks.safe_mode_new_intents = isNewPaymentIntentsPaused() ? "paused" : "off"

  const ok = checks.supabase === "ok"
  return NextResponse.json({ ok, checks }, { status: ok ? 200 : 503 })
}
