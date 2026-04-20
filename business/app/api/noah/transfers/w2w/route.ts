import { NextResponse } from "next/server"
import { requireAuth, requireNoahEnv, resolveNoahContextAsync } from "../../_helpers"
import { noahFetch } from "@/lib/noah/http"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { normalizeEasetag } from "@/lib/easetag-validation"
import { isUndefinedEasetagColumnError } from "@/lib/easetag-global"
import { getNoahWalletTransferPath } from "@/lib/noah/config"
import { resolveOrgOwnerUserId } from "@/lib/business/org-owner"
import { pickTxAmountAndCurrency } from "@/lib/noah/map-transactions"
import { upsertLedgerTransaction } from "@/lib/ledger/transactions"

/**
 * Wallet-to-wallet (Easetag P2P): resolve payee Easetag → Noah wallet id, then POST Noah internal transfer.
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

  const ctx = await resolveNoahContextAsync(user.id, request)
  if (!ctx.ok) return ctx.response

  const cleanTag = normalizeEasetag(tag)
  const admin = createSupabaseAdmin()

  const { data: meRow, error: meErr } = await admin
    .from("users")
    .select("id,easner_business_id")
    .eq("id", user.id)
    .maybeSingle()
  if (meErr) {
    return NextResponse.json({ error: meErr.message }, { status: 400 })
  }
  const myBusinessId = (meRow?.easner_business_id as string | null | undefined) ?? null

  const { data: payeeUser, error: payeeUserErr } = await admin
    .from("users")
    .select("id,easetag,noah_wallet_id")
    .eq("easetag", cleanTag)
    .maybeSingle()
  if (payeeUserErr && !isUndefinedEasetagColumnError(payeeUserErr)) {
    return NextResponse.json({ error: payeeUserErr.message }, { status: 400 })
  }

  const resolvedPayeeUser =
    payeeUserErr && isUndefinedEasetagColumnError(payeeUserErr) ? null : payeeUser

  let payeeWalletId: string | null = null
  let payeeEasetagResolved = cleanTag
  let payeeUserId: string | undefined
  let payeeBusinessId: string | undefined

  if (resolvedPayeeUser) {
    if (resolvedPayeeUser.id === user.id) {
      return NextResponse.json({ error: "You cannot add yourself as a recipient." }, { status: 400 })
    }
    payeeWalletId = resolvedPayeeUser.noah_wallet_id as string | null
    payeeEasetagResolved = resolvedPayeeUser.easetag as string
    payeeUserId = resolvedPayeeUser.id
  } else {
    const { data: biz, error: bizErr } = await admin
      .from("businesses")
      .select("id,easetag,noah_wallet_id")
      .eq("easetag", cleanTag)
      .maybeSingle()
    if (bizErr) {
      return NextResponse.json({ error: bizErr.message }, { status: 400 })
    }
    if (!biz) {
      return NextResponse.json({ error: "Easetag not found." }, { status: 404 })
    }
    if (myBusinessId && biz.id === myBusinessId) {
      return NextResponse.json({ error: "You cannot add yourself as a recipient." }, { status: 400 })
    }
    payeeWalletId = biz.noah_wallet_id as string | null
    payeeEasetagResolved = biz.easetag as string
    payeeBusinessId = biz.id as string
    const ownerUserId = await resolveOrgOwnerUserId(admin, biz.id as string, user.id)
    payeeUserId = ownerUserId
  }

  if (!payeeWalletId) {
    return NextResponse.json({ error: "Payee does not have an Easner wallet ready yet." }, { status: 400 })
  }

  let sourceWalletId: string | undefined
  if (ctx.scope === "business" && ctx.businessId) {
    const { data: senderBiz } = await admin
      .from("businesses")
      .select("noah_wallet_id")
      .eq("id", ctx.businessId)
      .maybeSingle()
    sourceWalletId = senderBiz?.noah_wallet_id as string | undefined
  } else {
    const { data: sender } = await admin.from("users").select("noah_wallet_id").eq("id", user.id).maybeSingle()
    sourceWalletId = sender?.noah_wallet_id as string | undefined
  }
  if (!sourceWalletId) {
    return NextResponse.json({ error: "Your account does not have an Easner wallet ready yet." }, { status: 400 })
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

  let lastErr = "Wallet transfer failed."
  for (const json of [pascalBody, camelBody]) {
    try {
      const tx = await noahFetch<Record<string, unknown>>({
        method: "POST",
        path,
        json,
      })
      const admin = createSupabaseAdmin()
      const txId = String(tx.ID ?? tx.id ?? "").trim()
      if (txId) {
        const { amount: txAmount, currency: txCurrency } = pickTxAmountAndCurrency(tx)
        await upsertLedgerTransaction(admin, {
          userId: ctx.subjectUserId,
          businessId: ctx.subjectBusinessId,
          provider: "noah",
          providerTransactionId: txId,
          status: String(tx.Status ?? "pending").toLowerCase(),
          amount: txAmount || amount,
          currency: txCurrency || currency.toUpperCase(),
          direction: "out",
          payload: tx,
          metadata: { source: "api_noah_transfers_w2w", destinationEasetag: payeeEasetagResolved },
          txHash: String(tx.TxHash ?? tx.TransactionHash ?? "").trim() || null,
          occurredAt: String(tx.Created ?? tx.Updated ?? new Date().toISOString()),
          settledAt:
            String(tx.Status ?? "").toLowerCase() === "settled"
              ? String(tx.Updated ?? tx.Created ?? new Date().toISOString())
              : null,
          baseCurrency: txCurrency || currency.toUpperCase(),
        })
      }
      return NextResponse.json({ ok: true, path, transaction: tx })
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e)
    }
  }

  return NextResponse.json(
    {
      ok: false,
      error: lastErr,
      hint: `Transfer was rejected on ${path}. Confirm configuration with your administrator if this persists; Easetag resolution succeeded.`,
      payeePreview: {
        easetag: payeeEasetagResolved,
        userId: payeeUserId,
        ...(payeeBusinessId ? { businessId: payeeBusinessId } : {}),
      },
    },
    { status: 502 },
  )
}
