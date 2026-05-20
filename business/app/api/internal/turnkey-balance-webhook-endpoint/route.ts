import { NextResponse } from "next/server"
import { assertInternalCronAuthorized } from "@/lib/api/internal-auth"
import { getTurnkeyApiClient } from "@/lib/turnkey/client"
import {
  getTurnkeyBalanceWebhookEndpointId,
  getTurnkeyOrganizationId,
  getTurnkeyWebhookFeatureUrl,
  isTurnkeyBalanceWebhooksIngestEnabled,
  validateTurnkeyEnvForProduction,
} from "@/lib/turnkey/config"

export const runtime = "nodejs"

type TurnkeyApiWithWebhooks = {
  createWebhookEndpoint?: (body: {
    url: string
    name: string
    subscriptions: Array<{ eventType: string; isActive: boolean; filter?: string }>
  }) => Promise<{ webhookEndpointId?: string; webhookEndpoint?: { webhookEndpointId?: string } }>
  listWebhookEndpoints?: () => Promise<{
    webhookEndpoints?: Array<{
      webhookEndpointId?: string
      url?: string
      subscriptions?: Array<{ eventType?: string; isActive?: boolean }>
    }>
  }>
  updateWebhookEndpoint?: (body: {
    webhookEndpointId: string
    url?: string
    isActive?: boolean
  }) => Promise<unknown>
}

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
 * Requires Turnkey org API support for `createWebhookEndpoint` (closed beta).
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
  const apiClient = getTurnkeyApiClient() as TurnkeyApiWithWebhooks | null

  let endpoints: unknown = null
  if (apiClient?.listWebhookEndpoints) {
    try {
      endpoints = await apiClient.listWebhookEndpoints()
    } catch (e) {
      endpoints = { error: e instanceof Error ? e.message : String(e) }
    }
  }

  return NextResponse.json({
    ok: turnkey.ok,
    balance_webhooks_ingest_enabled: isTurnkeyBalanceWebhooksIngestEnabled(),
    balance_webhook_endpoint_id: getTurnkeyBalanceWebhookEndpointId() || null,
    webhook_url: webhookUrl || null,
    list_webhook_endpoints_supported: Boolean(apiClient?.listWebhookEndpoints),
    create_webhook_endpoint_supported: Boolean(apiClient?.createWebhookEndpoint),
    endpoints,
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

  const apiClient = getTurnkeyApiClient() as TurnkeyApiWithWebhooks | null
  if (!apiClient?.createWebhookEndpoint) {
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

  const existingId = getTurnkeyBalanceWebhookEndpointId()

  try {
    if (existingId && apiClient.updateWebhookEndpoint) {
      await apiClient.updateWebhookEndpoint({
        webhookEndpointId: existingId,
        url: webhookUrl,
        isActive: true,
      })
      return NextResponse.json({
        ok: true,
        action: "updated",
        webhookEndpointId: existingId,
        url: webhookUrl,
        hint: "Set TURNKEY_BALANCE_WEBHOOKS_ENABLED=1 after verifying deliveries.",
      })
    }

    const response = await apiClient.createWebhookEndpoint({
      url: webhookUrl,
      name: "Easner balance confirmed",
      subscriptions: [{ eventType: "BALANCE_CONFIRMED_UPDATES", isActive: true }],
    })
    const endpointId =
      response.webhookEndpointId ?? response.webhookEndpoint?.webhookEndpointId ?? null

    return NextResponse.json({
      ok: true,
      action: "created",
      organizationId: getTurnkeyOrganizationId(),
      webhookEndpointId: endpointId,
      url: webhookUrl,
      response,
      hint: "Persist TURNKEY_BALANCE_WEBHOOK_ENDPOINT_ID and set TURNKEY_BALANCE_WEBHOOKS_ENABLED=1.",
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
