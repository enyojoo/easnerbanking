import { NextResponse } from "next/server"
import { requirePricingAuth } from "../_helpers"
import { createQuote } from "@/lib/pricing/evaluator"
import type { ProviderCostsBreakdown } from "@/lib/pricing/provider-costs"
import { noahImpliedProviderRate } from "@/lib/noah/fx-prices"
import { requireNoahEnv } from "@/app/api/noah/_helpers"

export async function POST(request: Request) {
  const auth = await requirePricingAuth(request)
  if ("error" in auth) return auth.error
  const { user } = auth

  const body = (await request.json().catch(() => null)) as
    | {
        sourceCurrency?: string
        destinationCurrency?: string
        sourceAmount?: number | string
        rail?: string
        countryCode?: string
        payoutCountry?: string
        payoutMethod?: string
        fundingRail?: string
        fundingDirection?: "inbound" | "outbound"
        fundingRailOutbound?: string
        fundingDirectionOutbound?: "inbound" | "outbound"
        providerRate?: number | string
        strategyMode?: "maximize_margin" | "maximize_conversion" | "maximize_volume" | "strategic_account_pricing"
        routeType?: "stablecoin" | "fiat" | "mixed"
        routeCandidates?: Array<{
          id: string
          providerCostAmount?: number
          totalProviderCostReporting?: number
          providerCosts?: Record<string, unknown> | null
          speedScore?: number
          successScore?: number
          routeType?: "stablecoin" | "fiat" | "mixed"
        }>
        providerFeeVersion?: string
        providerFeePercent?: number | string
        providerFixedFee?: number | string
        localRailFee?: number | string
        provider?: string
        corridor?: string
      }
    | null

  const sourceCurrency = String(body?.sourceCurrency || "")
    .trim()
    .toUpperCase()
  const destinationCurrency = String(body?.destinationCurrency || "")
    .trim()
    .toUpperCase()
  const sourceAmount = Number(body?.sourceAmount)
  let providerRate = body?.providerRate != null ? Number(body.providerRate) : undefined
  if (!sourceCurrency || !destinationCurrency || !Number.isFinite(sourceAmount) || sourceAmount <= 0) {
    return NextResponse.json(
      { error: "Missing required fields: sourceCurrency, destinationCurrency, sourceAmount > 0" },
      { status: 400 }
    )
  }

  if (
    (!providerRate || providerRate <= 0) &&
    sourceCurrency !== destinationCurrency &&
    !requireNoahEnv()
  ) {
    try {
      providerRate = await noahImpliedProviderRate({
        sourceCurrency,
        destinationCurrency,
        sourceAmount,
        country: body?.payoutCountry ?? body?.countryCode,
      })
    } catch {
      // createQuote falls back to 1:1 when Noah pair unavailable
    }
  }

  try {
    const quote = await createQuote({
      userId: user.id,
      sourceCurrency,
      destinationCurrency,
      sourceAmount,
      rail: body?.rail,
      countryCode: body?.countryCode,
      payoutCountry: body?.payoutCountry ? String(body.payoutCountry).trim() : undefined,
      payoutMethod: body?.payoutMethod ? String(body.payoutMethod).trim() : undefined,
      fundingRail: body?.fundingRail ? String(body.fundingRail).trim() : undefined,
      fundingDirection: body?.fundingDirection,
      fundingRailOutbound: body?.fundingRailOutbound ? String(body.fundingRailOutbound).trim() : undefined,
      fundingDirectionOutbound: body?.fundingDirectionOutbound,
      providerRate,
      strategyMode: body?.strategyMode,
      routeType: body?.routeType,
      routeCandidates: body?.routeCandidates?.map((c) => ({
        ...c,
        providerCosts: c.providerCosts as ProviderCostsBreakdown | null | undefined,
      })),
      providerFeeVersion: body?.providerFeeVersion,
      providerFeePercent: body?.providerFeePercent != null ? Number(body.providerFeePercent) : undefined,
      providerFixedFee: body?.providerFixedFee != null ? Number(body.providerFixedFee) : undefined,
      localRailFee: body?.localRailFee != null ? Number(body.localRailFee) : undefined,
      provider: body?.provider ? String(body.provider) : undefined,
      corridor: body?.corridor ? String(body.corridor) : undefined,
    })
    return NextResponse.json({ ok: true, quote })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ ok: false, error: msg }, { status: 400 })
  }
}
