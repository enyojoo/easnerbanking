import { NextResponse } from "next/server"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { requireOfficeAdmin } from "@/lib/api/admin-auth"

function daysAgoIso(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
}

export async function GET(request: Request) {
  const auth = await requireOfficeAdmin(request)
  if (!auth.ok) return auth.response
  const admin = createSupabaseAdmin()
  const since = daysAgoIso(7)

  const [feesRes, quotesRes, txRes, webhookRes] = await Promise.all([
    admin
      .from("applied_fees")
      .select("total_fee_amount, source_amount, created_at, total_provider_cost, pricing_totals, provider_costs"),
    admin
      .from("fee_quotes")
      .select(
        "id, status, created_at, pricing_strategy_mode, repricing_reason_code, margin_snapshot, quote_payload, total_provider_cost, pricing_totals, provider_costs"
      ),
    admin.from("transactions").select("id, status, created_at, metadata"),
    admin.from("webhook_deliveries").select("id, processed, error, created_at"),
  ])

  if (feesRes.error || quotesRes.error || txRes.error || webhookRes.error) {
    const error =
      feesRes.error?.message || quotesRes.error?.message || txRes.error?.message || webhookRes.error?.message
    return NextResponse.json({ error }, { status: 500 })
  }

  const fees = (feesRes.data || []).filter((f) => String(f.created_at) >= since)
  const quotes = (quotesRes.data || []).filter((q) => String(q.created_at) >= since)
  const txs = (txRes.data || []).filter((t) => String(t.created_at) >= since)
  const webhooks = (webhookRes.data || []).filter((w) => String(w.created_at) >= since)

  const grossRevenue = fees.reduce((sum, row) => sum + Number(row.total_fee_amount || 0), 0)
  const volume = fees.reduce((sum, row) => sum + Number(row.source_amount || 0), 0)
  const takeRateBps = volume > 0 ? (grossRevenue / volume) * 10000 : 0

  const requotedOrExpired =
    quotes.filter((q) => q.status === "expired").length +
    txs.filter((t) => String(t.metadata || "").includes("requote")).length
  const failedTransfers = txs.filter((t) => String(t.status).toLowerCase() === "failed").length
  const webhookFailures = webhooks.filter((w) => !w.processed && !!w.error).length
  const webhookFailureRate = webhooks.length > 0 ? webhookFailures / webhooks.length : 0
  const strategyModeCounts = quotes.reduce<Record<string, number>>((acc, q) => {
    const key = String(q.pricing_strategy_mode || "unknown")
    acc[key] = (acc[key] || 0) + 1
    return acc
  }, {})
  const repricingReasonCounts = quotes.reduce<Record<string, number>>((acc, q) => {
    const key = String(q.repricing_reason_code || "none")
    acc[key] = (acc[key] || 0) + 1
    return acc
  }, {})
  const marginByAmountBand = quotes.reduce<Record<string, { count: number; netRevenue: number }>>((acc, q) => {
    const band = String((q.quote_payload as { amountBand?: string } | null)?.amountBand || "unknown")
    const netRevenue = Number((q.margin_snapshot as { netRevenueAmount?: number } | null)?.netRevenueAmount || 0)
    if (!acc[band]) acc[band] = { count: 0, netRevenue: 0 }
    acc[band]!.count += 1
    acc[band]!.netRevenue += netRevenue
    return acc
  }, {})
  const marginByCorridor = quotes.reduce<Record<string, { count: number; netRevenue: number }>>((acc, q) => {
    const payload = (q.quote_payload as { sourceCurrency?: string; destinationCurrency?: string; countryCode?: string } | null) || {}
    const corridor = payload.countryCode
      ? `${payload.countryCode}:${payload.sourceCurrency || "?"}-${payload.destinationCurrency || "?"}`
      : `${payload.sourceCurrency || "?"}-${payload.destinationCurrency || "?"}`
    const netRevenue = Number((q.margin_snapshot as { netRevenueAmount?: number } | null)?.netRevenueAmount || 0)
    if (!acc[corridor]) acc[corridor] = { count: 0, netRevenue: 0 }
    acc[corridor]!.count += 1
    acc[corridor]!.netRevenue += netRevenue
    return acc
  }, {})
  const conversionByStrategyMode = Object.fromEntries(
    Object.entries(strategyModeCounts).map(([mode, count]) => {
      const used = quotes.filter((q) => q.pricing_strategy_mode === mode && q.status === "used").length
      return [mode, count > 0 ? used / count : 0]
    })
  )

  let quotesWithTotalProviderCost = 0
  let sumTotalProviderCostOnQuotes = 0
  let quotesWithPricingTotals = 0
  let sumTotalUserFeeOnQuotes = 0
  for (const q of quotes) {
    const tpc = q.total_provider_cost
    if (tpc != null && tpc !== "" && Number.isFinite(Number(tpc))) {
      quotesWithTotalProviderCost += 1
      sumTotalProviderCostOnQuotes += Number(tpc)
    }
    const pt = q.pricing_totals as { total_user_fee?: number } | null | undefined
    if (pt && typeof pt.total_user_fee === "number" && Number.isFinite(pt.total_user_fee)) {
      quotesWithPricingTotals += 1
      sumTotalUserFeeOnQuotes += pt.total_user_fee
    }
  }

  let appliedWithTotalProviderCost = 0
  let sumTotalProviderCostOnApplied = 0
  for (const f of fees) {
    const tpc = f.total_provider_cost
    if (tpc != null && tpc !== "" && Number.isFinite(Number(tpc))) {
      appliedWithTotalProviderCost += 1
      sumTotalProviderCostOnApplied += Number(tpc)
    }
  }

  const alerts = {
    webhookRetryExhaustionRisk: webhookFailureRate > 0.05,
    marginCompressionRisk: takeRateBps < 30,
    requoteSpikeRisk: quotes.length > 0 ? requotedOrExpired / quotes.length > 0.15 : false,
  }

  return NextResponse.json({
    window: "7d",
    metrics: {
      grossRevenue,
      takeRateBps,
      contributionMarginProxy: grossRevenue,
      failedTransferRate: txs.length > 0 ? failedTransfers / txs.length : 0,
      requoteOrExpiredRate: quotes.length > 0 ? requotedOrExpired / quotes.length : 0,
      webhookFailureRate,
    },
    totals: {
      feesApplied: fees.length,
      quotes: quotes.length,
      transactions: txs.length,
      webhookDeliveries: webhooks.length,
    },
    strategy: {
      strategyModeCounts,
      repricingReasonCounts,
      marginByAmountBand,
      marginByCorridor,
      conversionByStrategyMode,
    },
    providerPricing: {
      quotesWithTotalProviderCost,
      sumTotalProviderCostOnQuotes,
      appliedWithTotalProviderCost,
      sumTotalProviderCostOnApplied,
      quotesWithPricingTotals,
      sumTotalUserFeeOnQuotes,
    },
    alerts,
  })
}
