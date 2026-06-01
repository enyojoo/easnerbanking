import { NextResponse } from "next/server"
import { requireAuth } from "@/app/api/noah/_helpers"
import { resolveNoahAccountContext } from "@/lib/noah/resolve-account-context"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { isWalletSendEnabled } from "@/lib/lifi/client"
import { buildWalletSendQuote } from "@/lib/wallet-send/wallet-send-quote"
import { validateWalletRecipientForSend, type WalletRecipientRow } from "@/lib/wallet-send/validate-recipient"
import { resolveTurnkeyAddressForNoahPair } from "@/lib/wallet/resolve-wallet-owner"
import { settlementAssetForBalance } from "@/lib/wallet-send/routing"

export const runtime = "nodejs"

export async function POST(request: Request) {
  const auth = await requireAuth(request)
  if ("error" in auth) return auth.error
  if (!isWalletSendEnabled()) {
    return NextResponse.json({ error: "wallet_send_disabled" }, { status: 503 })
  }

  const acc = await resolveNoahAccountContext(request, auth.user.id)
  if (!acc.ok) return acc.response

  const body = (await request.json().catch(() => null)) as {
    recipientId?: string
    sourceBalanceCurrency?: string
    amountEntryMode?: "send" | "receive"
    receiveAmount?: number | string
    sendAmount?: number | string
  } | null

  const recipientId = String(body?.recipientId || "").trim()
  if (!recipientId) {
    return NextResponse.json({ error: "recipientId is required" }, { status: 400 })
  }

  const admin = createSupabaseAdmin()
  const { data: recipient, error } = await admin
    .from("recipients")
    .select("*")
    .eq("id", recipientId)
    .eq("user_id", auth.user.id)
    .maybeSingle()

  if (error || !recipient) {
    return NextResponse.json({ error: "Recipient not found." }, { status: 404 })
  }

  const gate = validateWalletRecipientForSend(recipient as WalletRecipientRow)
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: 400 })
  }

  const amountEntryMode = body?.amountEntryMode === "send" ? "send" : "receive"
  const sendAmountInput = Number(body?.sendAmount)
  const sendBudget =
    amountEntryMode === "send" &&
    Number.isFinite(sendAmountInput) &&
    sendAmountInput > 0
      ? sendAmountInput
      : undefined
  const receiveAmountInput = Number(body?.receiveAmount)
  if (
    amountEntryMode === "receive" &&
    (!Number.isFinite(receiveAmountInput) || receiveAmountInput <= 0) &&
    !sendBudget
  ) {
    return NextResponse.json({ error: "receiveAmount must be positive." }, { status: 400 })
  }
  if (amountEntryMode === "send" && !sendBudget) {
    return NextResponse.json({ error: "sendAmount must be positive." }, { status: 400 })
  }

  const sourceBalanceCurrency = String(body?.sourceBalanceCurrency || "USD").trim().toUpperCase()
  const settlement = settlementAssetForBalance(sourceBalanceCurrency)
  const probeFrom = await resolveTurnkeyAddressForNoahPair(
    admin,
    acc.ctx,
    settlement,
    "Solana",
  )

  try {
    const quote = await buildWalletSendQuote({
      admin,
      recipient: recipient as WalletRecipientRow,
      sourceBalanceCurrency,
      amountEntryMode,
      receiveAmount: receiveAmountInput,
      sendAmount: sendAmountInput,
      probeFromAddress: probeFrom ?? undefined,
    })
    return NextResponse.json({ ok: true, quote })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "quote_failed" },
      { status: 400 },
    )
  }
}
