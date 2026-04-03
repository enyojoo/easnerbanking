import { NextResponse } from "next/server"
import { requireAuth, requireNoahEnv, resolveNoahContext } from "@/app/api/noah/_helpers"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { noahFetch } from "@/lib/noah/http"

type ProviderKey = string

function parseProviderKeyFromInstructions(instructions: unknown): ProviderKey | null {
  if (!instructions) return null
  try {
    const j = JSON.parse(String(instructions))
    if (j && typeof j === "object" && typeof (j as any).provider_key === "string") {
      return String((j as any).provider_key)
    }
  } catch {
    // ignore
  }
  return null
}

export async function POST(request: Request) {
  const auth = await requireAuth(request)
  if ("error" in auth) return auth.error
  const { user } = auth

  const body = (await request.json().catch(() => null)) as
    | {
        paymentMethodId?: string
        amount?: string | number
        currency?: string
        sourceWalletId?: string
        destinationExternalAccountId?: string
      }
    | null

  const paymentMethodId = String(body?.paymentMethodId || "").trim()
  const sourceWalletId = String(body?.sourceWalletId || "").trim()
  const destinationExternalAccountId = String(body?.destinationExternalAccountId || "").trim()
  const amountRaw = String(body?.amount ?? "").trim()
  const currencyRaw = String(body?.currency || "").trim().toUpperCase()
  const amount = Number.parseFloat(amountRaw)

  if (!paymentMethodId || !sourceWalletId || !destinationExternalAccountId || !currencyRaw || !Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json(
      {
        error:
          "Missing or invalid fields. Required: paymentMethodId, sourceWalletId, destinationExternalAccountId, amount > 0, currency.",
      },
      { status: 400 }
    )
  }

  const admin = createSupabaseAdmin()
  const { data: pm, error: pmErr } = await admin.from("payment_methods").select("*").eq("id", paymentMethodId).single()
  if (pmErr || !pm) {
    return NextResponse.json({ error: "Payment method not found" }, { status: 404 })
  }

  const type = String((pm as any).type || "")
  if (type !== "provider") {
    return NextResponse.json({ error: "Payment method is not provider-backed" }, { status: 400 })
  }

  const providerKey = parseProviderKeyFromInstructions((pm as any).instructions)
  if (!providerKey) {
    return NextResponse.json({ error: "Provider payment method missing provider_key in instructions JSON" }, { status: 400 })
  }

  // Provider dispatch. We support providers via adapters; implementations can be added without changing API shape.
  if (providerKey === "noah") {
    const mis = requireNoahEnv()
    if (mis) return mis
    const noahCtx = resolveNoahContext(user.id, request)

    // Noah "payout" uses sell endpoint today (fiat out from wallet).
    // We keep the shape aligned with existing `/api/noah/transfers` behavior.
    const sellPayloadPascal = {
      CustomerID: noahCtx.noahCustomerId,
      SourceWalletID: sourceWalletId,
      DestinationExternalAccountID: destinationExternalAccountId,
      FiatCurrency: currencyRaw,
      Amount: amount.toFixed(2),
    }

    try {
      const tx = await noahFetch<Record<string, unknown>>({
        method: "POST",
        path: "/transactions/sell",
        json: sellPayloadPascal,
      })
      return NextResponse.json({ provider: "noah", transaction: tx })
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      return NextResponse.json({ error: msg }, { status: 400 })
    }
  }

  return NextResponse.json(
    {
      error: `Provider not implemented: ${providerKey}. Add an adapter for this provider_key and configure credentials.`,
    },
    { status: 501 }
  )
}

