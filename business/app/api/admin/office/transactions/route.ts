import { NextResponse } from "next/server"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { requireOfficeAdmin } from "@/lib/api/admin-auth"
import { loadOfficeLedgerTransactions } from "@/lib/admin/office-load-transactions"
import { computeProviderLedgerDashboardExtras, parseOverviewWindow } from "@/lib/admin/office-overview-compute"
import { loadAllTimeUserVisibleTransactions, loadTransactionsForOverview } from "@/lib/admin/office-overview-load-transactions"
import { prepareOfficeUserVisibleTransactions } from "@/lib/admin/office-user-visible-transactions"

/**
 * Office ledger: list provider transactions (service role). Optional filters.
 */
export async function GET(request: Request) {
  const auth = await requireOfficeAdmin(request)
  if (!auth.ok) return auth.response

  const url = new URL(request.url)
  const userId = url.searchParams.get("userId")?.trim() || undefined
  const provider = url.searchParams.get("provider")?.trim() || undefined
  const ycMode = url.searchParams.get("ycMode")?.trim() || undefined
  const rail = url.searchParams.get("rail")?.trim() || undefined
  const status = url.searchParams.get("status")?.trim() || undefined
  const cursor = url.searchParams.get("cursor")?.trim() || undefined
  const limitRaw = Number(url.searchParams.get("limit") || "50")
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 100) : 50

  const admin = createSupabaseAdmin()

  const summaryParams = new URLSearchParams(url.searchParams)
  const presetParam = summaryParams.get("preset")?.toLowerCase()
  const hasCustomWindow = Boolean(summaryParams.get("since") || (presetParam && presetParam !== "all"))

  let volumeLoad
  let summaryWindow: { preset: string; since: string | null; until: string | null }

  if (hasCustomWindow) {
    const { preset, since, until } = parseOverviewWindow(summaryParams)
    const sinceIso = since.toISOString()
    const untilIso = until.toISOString()
    volumeLoad = await loadTransactionsForOverview(admin, sinceIso, untilIso, 500)
    summaryWindow = { preset, since: sinceIso, until: untilIso }
  } else {
    volumeLoad = await loadAllTimeUserVisibleTransactions(admin, 500)
    summaryWindow = { preset: "all", since: null, until: null }
  }

  const listLoad = await loadOfficeLedgerTransactions(admin, {
    userId,
    provider,
    ycMode,
    rail,
    status,
    cursor,
    limit,
  })

  if (listLoad.error) {
    return NextResponse.json({ error: listLoad.error.message }, { status: 500 })
  }
  if (volumeLoad.error) {
    return NextResponse.json({ error: volumeLoad.error.message }, { status: 500 })
  }

  const transactions = await prepareOfficeUserVisibleTransactions(admin, listLoad.data)
  const { volumeBalance, ycVolumeBreakdown } = computeProviderLedgerDashboardExtras(volumeLoad.data)

  return NextResponse.json({
    transactions,
    nextCursor: listLoad.nextCursor,
    summary: {
      volumeBalance,
      ycVolumeBreakdown,
      transactionCount: volumeLoad.data.length,
      window: summaryWindow,
    },
  })
}

/**
 * Manual status override from office (legacy ops flow).
 */
export async function PATCH(request: Request) {
  const auth = await requireOfficeAdmin(request)
  if (!auth.ok) return auth.response

  let body: { transactionId?: string; status?: string }
  try {
    body = (await request.json()) as { transactionId?: string; status?: string }
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const transactionId = String(body.transactionId || "").trim()
  const status = String(body.status || "").trim()
  if (!transactionId || !status) {
    return NextResponse.json({ error: "transactionId and status are required" }, { status: 400 })
  }

  const admin = createSupabaseAdmin()
  const { error } = await admin
    .from("transactions")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", transactionId)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
