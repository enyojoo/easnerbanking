import { NextResponse } from "next/server"
import { requireAuth, requireNoahEnv } from "../_helpers"
import { noahFetch } from "@/lib/noah/http"
import { pickTxAmountAndCurrency } from "@/lib/noah/map-transactions"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { resolveNoahContext } from "../_helpers"

export async function POST(request: Request) {
  const mis = requireNoahEnv()
  if (mis) return mis
  const auth = await requireAuth(request)
  if ("error" in auth) return auth.error
  const { user } = auth
  const noahCtx = resolveNoahContext(user.id, request)

  const body = (await request.json().catch(() => null)) as
    | {
        amount?: string | number
        currency?: string
        sourceWalletId?: string
        destinationExternalAccountId?: string
      }
    | null

  const sourceWalletId = String(body?.sourceWalletId || "").trim()
  const destinationExternalAccountId = String(body?.destinationExternalAccountId || "").trim()
  const amountRaw = String(body?.amount ?? "").trim()
  const currencyRaw = String(body?.currency || "").trim().toUpperCase()
  const allowedCurrency = currencyRaw === "USD" || currencyRaw === "EUR" ? currencyRaw : ""
  const amount = Number.parseFloat(amountRaw)

  if (!sourceWalletId || !destinationExternalAccountId || !allowedCurrency || !Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json(
      {
        error:
          "Missing or invalid transfer fields. Required: sourceWalletId, destinationExternalAccountId, amount > 0, currency in [USD, EUR].",
      },
      { status: 400 }
    )
  }

  const sellPayloadPascal = {
    CustomerID: noahCtx.noahCustomerId,
    SourceWalletID: sourceWalletId,
    DestinationExternalAccountID: destinationExternalAccountId,
    FiatCurrency: allowedCurrency,
    Amount: amount.toFixed(2),
  }
  const sellPayloadCamel = {
    customerId: noahCtx.noahCustomerId,
    sourceWalletId,
    destinationExternalAccountId,
    fiatCurrency: allowedCurrency,
    amount: amount.toFixed(2),
  }

  try {
    let tx: Record<string, unknown>
    try {
      tx = await noahFetch<Record<string, unknown>>({
        method: "POST",
        path: "/transactions/sell",
        json: sellPayloadPascal,
      })
    } catch {
      tx = await noahFetch<Record<string, unknown>>({
        method: "POST",
        path: "/transactions/sell",
        json: sellPayloadCamel,
      })
    }

    const id = String(tx.ID ?? tx.id ?? "")
    const status = String(tx.Status ?? tx.status ?? "pending").toLowerCase()
    const { amount: txAmount, currency } = pickTxAmountAndCurrency(tx)
    const admin = createSupabaseAdmin()
    await admin.from("transactions").upsert(
      {
        user_id: user.id,
        noah_transaction_id: id || null,
        provider: "noah",
        status,
        amount: txAmount || amount,
        currency: currency || allowedCurrency,
        direction: "out",
        payload: tx,
        metadata: {
          sourceWalletId,
          destinationExternalAccountId,
          source: "api_noah_transfers",
        },
      },
      { onConflict: "provider,noah_transaction_id" }
    )

    return NextResponse.json({
      id: id || "",
      transaction_id: id || "",
      amount: String(txAmount || amount),
      currency: String(currency || allowedCurrency).toLowerCase(),
      status,
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 400 })
  }
}
