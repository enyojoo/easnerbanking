import { NextResponse } from "next/server"
import { noahFetch } from "@/lib/noah/http"
import { requireAuth, requireNoahEnv } from "../_helpers"
import { requireNoahVerificationApproved } from "@/lib/noah/noah-tier-guards"
import { resolveNoahAccountContext } from "@/lib/noah/resolve-account-context"
import { uiFiatToNoahPriceTicker } from "@/lib/noah/fx-tickers"

type PricesResponse = Record<string, unknown>

export async function GET(request: Request) {
  const mis = requireNoahEnv()
  if (mis) return mis
  const auth = await requireAuth(request)
  if ("error" in auth) return auth.error
  const { user } = auth

  const acc = await resolveNoahAccountContext(request, user.id)
  if (!acc.ok) return acc.response

  const guard = await requireNoahVerificationApproved(acc.ctx.subjectUserId, acc.ctx.scope)
  if (guard) return guard

  const url = new URL(request.url)
  const sourceCurrency = (url.searchParams.get("sourceCurrency") || "").toUpperCase()
  const destinationCurrency = (url.searchParams.get("destinationCurrency") || "").toUpperCase()
  const sourceAmount = url.searchParams.get("sourceAmount")?.trim()

  if (sourceCurrency !== "USD" && sourceCurrency !== "EUR") {
    return NextResponse.json({ error: "sourceCurrency must be USD or EUR" }, { status: 400 })
  }
  if (destinationCurrency !== "USD" && destinationCurrency !== "EUR") {
    return NextResponse.json({ error: "destinationCurrency must be USD or EUR" }, { status: 400 })
  }
  if (sourceCurrency === destinationCurrency) {
    return NextResponse.json({ error: "Source and destination must differ" }, { status: 400 })
  }
  if (!sourceAmount || Number.parseFloat(sourceAmount) <= 0) {
    return NextResponse.json({ error: "sourceAmount is required and must be positive" }, { status: 400 })
  }

  try {
    const SourceCurrency = uiFiatToNoahPriceTicker(sourceCurrency)
    const DestinationCurrency = uiFiatToNoahPriceTicker(destinationCurrency)

    const data = await noahFetch<PricesResponse>({
      method: "GET",
      path: "/prices",
      query: {
        SourceCurrency,
        DestinationCurrency,
        SourceAmount: sourceAmount,
      },
    })

    const destAmt = data.DestinationAmount != null ? String(data.DestinationAmount) : ""
    const srcAmt = data.SourceAmount != null ? String(data.SourceAmount) : sourceAmount
    let impliedRate: number | undefined
    const d = Number.parseFloat(destAmt)
    const s = Number.parseFloat(srcAmt)
    if (Number.isFinite(d) && Number.isFinite(s) && s > 0) {
      impliedRate = d / s
    }

    return NextResponse.json({
      sourceCurrency,
      destinationCurrency,
      sourceAmount: srcAmt,
      destinationAmount: destAmt,
      impliedRate,
      noah: data,
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 400 })
  }
}
