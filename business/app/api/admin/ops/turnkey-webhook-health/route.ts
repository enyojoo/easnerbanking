import { NextResponse } from "next/server"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { requireOfficeAdmin } from "@/lib/api/admin-auth"
import {
  getTurnkeyBalanceWebhookEndpointId,
  isTurnkeyBalanceWebhooksIngestEnabled,
  validateTurnkeyEnvForProduction,
} from "@/lib/turnkey/config"

export const runtime = "nodejs"

function routeReachableStatus(code: number | null): "reachable" | "unreachable" | "unknown" {
  if (code == null) return "unknown"
  // 404 means route missing. Any other status means the route exists and is reachable.
  if (code === 404) return "unreachable"
  return "reachable"
}

/**
 * Office ops snapshot for Turnkey activity-webhook readiness.
 *
 * Includes:
 * - env prerequisite status (secret + turnkey keys)
 * - webhook route reachability
 * - recent `event_inbox` activity for provider=turnkey
 */
export async function GET(request: Request) {
  const auth = await requireOfficeAdmin(request)
  if (!auth.ok) return auth.response

  const admin = createSupabaseAdmin()
  const sinceIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

  const countWhere = async (status: "received" | "processed" | "failed") => {
    const { count, error } = await admin
      .from("event_inbox")
      .select("id", { count: "exact", head: true })
      .eq("provider", "turnkey")
      .eq("status", status)
      .gte("created_at", sinceIso)
    if (error) return null
    return count ?? 0
  }

  const countByEventTypePrefix = async (prefix: string) => {
    const { count, error } = await admin
      .from("event_inbox")
      .select("id", { count: "exact", head: true })
      .eq("provider", "turnkey")
      .eq("status", "processed")
      .gte("created_at", sinceIso)
      .ilike("event_type", `${prefix}%`)
    if (error) return null
    return count ?? 0
  }

  const [{ data: latestEvent, error: latestEventError }, received24h, processed24h, failed24h, balanceEvents24h] =
    await Promise.all([
    admin
      .from("event_inbox")
      .select("event_id, event_type, status, error, created_at, processed_at")
      .eq("provider", "turnkey")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    countWhere("received"),
    countWhere("processed"),
    countWhere("failed"),
    countByEventTypePrefix("BALANCE"),
  ])

  let routeProbeStatus: number | null = null
  let routeProbeError: string | null = null
  try {
    const probeUrl = new URL("/api/webhooks/turnkey", request.url)
    const probe = await fetch(probeUrl, {
      method: "OPTIONS",
      cache: "no-store",
    })
    routeProbeStatus = probe.status
  } catch (e) {
    routeProbeError = e instanceof Error ? e.message : String(e)
  }

  return NextResponse.json({
    ok: true,
    turnkey: validateTurnkeyEnvForProduction(),
    balance_webhooks: {
      ingest_enabled: isTurnkeyBalanceWebhooksIngestEnabled(),
      endpoint_id_configured: Boolean(getTurnkeyBalanceWebhookEndpointId()),
      balance_confirmed_processed_24h: balanceEvents24h,
      setup_route: "/api/internal/turnkey-balance-webhook-endpoint",
    },
    webhook_secret_configured: Boolean(process.env.TURNKEY_WEBHOOK_SECRET?.trim()),
    webhook_route: {
      url: "/api/webhooks/turnkey",
      status: routeReachableStatus(routeProbeStatus),
      http_status: routeProbeStatus,
      error: routeProbeError,
    },
    event_inbox: {
      provider: "turnkey",
      recent_window_hours: 24,
      received_24h: received24h,
      processed_24h: processed24h,
      failed_24h: failed24h,
      latest:
        latestEventError ?
          { error: latestEventError.message }
        : latestEvent,
    },
  })
}
