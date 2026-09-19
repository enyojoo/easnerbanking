import { NextResponse } from "next/server"
import { assertInternalCronAuthorized } from "@/lib/api/internal-auth"
import { getTurnkeyApiClient } from "@/lib/turnkey/client"
import {
  getTurnkeyOrganizationId,
  getTurnkeyWebhookFeatureUrl,
  validateTurnkeyEnvForProduction,
} from "@/lib/turnkey/config"

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

/**
 * Internal utility endpoint:
 * - GET  => readiness check (env + computed webhook URL)
 * - POST => calls Turnkey `setOrganizationFeature(FEATURE_NAME_WEBHOOK, url)`
 */
export async function GET(request: Request) {
  try {
    assertInternalCronAuthorized(request)
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unauthorized"
    return NextResponse.json({ error: msg }, { status: 401 })
  }

  const turnkey = validateTurnkeyEnvForProduction()
  const webhookUrl = getTurnkeyWebhookFeatureUrl()
  const webhookUrlError = validateWebhookUrl(webhookUrl)

  return NextResponse.json({
    ok: turnkey.ok && !webhookUrlError,
    turnkey_env: turnkey,
    organization_id_configured: Boolean(getTurnkeyOrganizationId()),
    webhook_feature: {
      name: "FEATURE_NAME_WEBHOOK",
      value: webhookUrl || null,
      valid: !webhookUrlError,
      error: webhookUrlError,
    },
  })
}

export async function POST(request: Request) {
  try {
    assertInternalCronAuthorized(request)
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unauthorized"
    return NextResponse.json({ error: msg }, { status: 401 })
  }

  const turnkey = validateTurnkeyEnvForProduction()
  if (!turnkey.ok) {
    return NextResponse.json(
      {
        ok: false,
        error: "Turnkey env not configured",
        missing: turnkey.missing,
      },
      { status: 400 },
    )
  }

  const webhookUrl = getTurnkeyWebhookFeatureUrl()
  const webhookUrlError = validateWebhookUrl(webhookUrl)
  if (webhookUrlError) {
    return NextResponse.json(
      {
        ok: false,
        error: webhookUrlError,
      },
      { status: 400 },
    )
  }

  const apiClient = getTurnkeyApiClient()
  if (!apiClient || typeof apiClient.setOrganizationFeature !== "function") {
    return NextResponse.json(
      {
        ok: false,
        error: "Turnkey API client unavailable",
      },
      { status: 500 },
    )
  }

  try {
    const response = await apiClient.setOrganizationFeature({
      name: "FEATURE_NAME_WEBHOOK",
      value: webhookUrl,
    })

    return NextResponse.json({
      ok: true,
      organizationId: getTurnkeyOrganizationId(),
      webhook_feature: {
        name: "FEATURE_NAME_WEBHOOK",
        value: webhookUrl,
      },
      response,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json(
      {
        ok: false,
        error: msg,
      },
      { status: 500 },
    )
  }
}
