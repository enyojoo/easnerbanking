import { NextResponse } from "next/server"
import { requireAuth, requireNoahEnv } from "../../_helpers"
import { resolveNoahContext } from "../../_helpers"
import { noahFetch } from "@/lib/noah/http"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { normalizeEasetag } from "@/lib/easetag-validation"
import { getNoahWalletTransferPath } from "@/lib/noah/config"

/**
 * Wallet-to-wallet (Easenet): resolve payee Easetag → Noah wallet id, then POST Noah internal transfer.
 * Path defaults to `/transactions/transfer`; override with `NOAH_WALLET_TRANSFER_PATH` per your Noah program contract.
 */
export async function POST(request: Request) {
  const mis = requireNoahEnv()
  if (mis) return mis
  const auth = await requireAuth(request)
  if ("error" in auth) return auth.error
  const { user } = auth

  const body = (await request.json().catch(() => null)) as {
    destinationEasetag?: string
    amount?: string | number
    currency?: string
    cryptoCurrency?: string
  } | null

  const tag = String(body?.destinationEasetag || "").trim()
  const amount = Number.parseFloat(String(body?.amount ?? ""))
  const currency = String(body?.currency || "usd").toLowerCase()
  const cryptoCurrency = String(body?.cryptoCurrency || "USDC_TEST").trim()

  if (!tag || !Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: "destinationEasetag and positive amount required." }, { status: 400 })
  }

  const ctx = resolveNoahContext(user.id, request)
  const cleanTag = normalizeEasetag(tag)
  const admin = createSupabaseAdmin()
  const { data: payeeRow } = await admin
    .from("users")
    .select("id,easetag,noah_wallet_id")
    .eq("easetag", cleanTag)
    .maybeSingle()
  if (!payeeRow) {
    return NextResponse.json({ error: "Easetag not found." }, { status: 404 })
  }
  if (payeeRow.id === user.id) {
    return NextResponse.json({ error: "Cannot send to your own Easetag." }, { status: 400 })
  }
  const payeeWalletId = payeeRow.noah_wallet_id as string | null
  if (!payeeWalletId) {
    return NextResponse.json({ error: "Payee has no provisioned Noah wallet yet." }, { status: 400 })
  }

  const { data: sender } = await admin.from("users").select("noah_wallet_id").eq("id", user.id).maybeSingle()
  const sourceWalletId = sender?.noah_wallet_id as string | undefined
  if (!sourceWalletId) {
    return NextResponse.json({ error: "Sender has no Noah wallet yet." }, { status: 400 })
  }

  const path = getNoahWalletTransferPath()
  const pascalBody: Record<string, unknown> = {
    CustomerID: ctx.noahCustomerId,
    SourceWalletID: sourceWalletId,
    DestinationWalletID: payeeWalletId,
    Amount: amount.toFixed(8),
    Currency: currency.toUpperCase(),
    CryptoCurrency: cryptoCurrency,
  }
  const camelBody: Record<string, unknown> = {
    customerId: ctx.noahCustomerId,
    sourceWalletId,
    destinationWalletId: payeeWalletId,
    amount: amount.toFixed(8),
    currency: currency.toUpperCase(),
    cryptoCurrency,
  }

  let lastErr = "Noah wallet transfer failed."
  for (const json of [pascalBody, camelBody]) {
    try {
      const tx = await noahFetch<Record<string, unknown>>({
        method: "POST",
        path,
        json,
      })
      return NextResponse.json({ ok: true, path, transaction: tx })
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e)
    }
  }

  return NextResponse.json(
    {
      ok: false,
      error: lastErr,
      hint: `Noah rejected wallet transfer on ${path}. Confirm NOAH_WALLET_TRANSFER_PATH and payload with Noah for your program; Easetag resolution succeeded.`,
      payeePreview: { easetag: payeeRow.easetag, userId: payeeRow.id },
    },
    { status: 502 },
  )
}
