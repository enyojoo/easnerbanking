import { NextResponse } from "next/server"
import { assertInternalCronAuthorized } from "@/lib/api/internal-auth"
import {
  getTurnkeyBalanceWebhookEndpointId,
  getTurnkeyWebhookFeatureUrl,
  isTurnkeyBalanceWebhooksIngestEnabled,
  validateTurnkeyEnvForProduction,
} from "@/lib/turnkey/config"
import {
  ensureTurnkeyBalanceConfirmedWebhookEndpoint,
  listTurnkeyWebhookEndpoints,
  turnkeyOrganizationIdForWebhookOps,
} from "@/lib/turnkey/turnkey-webhook-endpoints"
import { getTurnkeyApiClient } from "@/lib/turnkey/client"

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
 * Internal: register Turnkey `BALANCE_CONFIRMED_UPDATES` on the same HTTPS URL as activity webhooks.
 * Separate from `FEATURE_NAME_WEBHOOK` (activity only). Closed beta — requires `createWebhookEndpoint` on SDK.
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
  const apiClient = getTurnkeyApiClient()

  let endpoints: unknown = null
  try {
    endpoints = await listTurnkeyWebhookEndpoints()
  } catch (e) {
    endpoints = { error: e instanceof Error ? e.message : String(e) }
  }

  return NextResponse.json({
    ok: turnkey.ok,
    organization_id: turnkeyOrganizationIdForWebhookOps(),
    balance_webhooks_ingest_enabled: isTurnkeyBalanceWebhooksIngestEnabled(),
    balance_webhook_endpoint_id: getTurnkeyBalanceWebhookEndpointId() || null,
    webhook_url: webhookUrl || null,
    api_client_configured: Boolean(apiClient),
    create_webhook_endpoint_supported: Boolean(
      apiClient && typeof (apiClient as { createWebhookEndpoint?: unknown }).createWebhookEndpoint === "function",
    ),
    endpoints,
    docs: "https://docs.turnkey.com/concepts/balances#webhooks",
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
    return NextResponse.json({ ok: false, error: "Turnkey env not configured", missing: turnkey.missing }, { status: 400 })
  }

  const webhookUrl = getTurnkeyWebhookFeatureUrl()
  const webhookUrlError = validateWebhookUrl(webhookUrl)
  if (webhookUrlError) {
    return NextResponse.json({ ok: false, error: webhookUrlError }, { status: 400 })
  }

  const existingId = getTurnkeyBalanceWebhookEndpointId()

  try {
    const result = await ensureTurnkeyBalanceConfirmedWebhookEndpoint({
      webhookUrl,
      existingEndpointId: existingId || undefined,
    })

    if (result.action === "unsupported") {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Turnkey SDK does not expose createWebhookEndpoint; register BALANCE_CONFIRMED_UPDATES in Turnkey dashboard or upgrade @turnkey/sdk-server.",
          webhook_url: webhookUrl,
          subscription: "BALANCE_CONFIRMED_UPDATES",
        },
        { status: 501 },
      )
    }

    return NextResponse.json({
      ok: true,
      action: result.action,
      organizationId: turnkeyOrganizationIdForWebhookOps(),
      webhookEndpointId: result.endpointId,
      url: webhookUrl,
      hint: "Persist TURNKEY_BALANCE_WEBHOOK_ENDPOINT_ID and set TURNKEY_BALANCE_WEBHOOKS_ENABLED=1 after a test deposit.",
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
