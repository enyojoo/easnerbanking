import { randomUUID } from "crypto"
import type { SupabaseClient } from "@supabase/supabase-js"
import { YC_QUOTE_TTL_MS, computeYcCrossBorderPricing, validateYcRecipientForCorridor } from "@easner/shared"
import { findYcRate, listYcRates } from "@/lib/fx/yc-rates"
import { submitYcReceive } from "@/lib/yellowcard/receive-submit"
import { submitYcSend } from "@/lib/yellowcard/send-submit"
import { executeYcCryptoDeposit } from "@/lib/yellowcard/execute-yc-crypto-deposit"
import { buildYcKycPersonMetadata } from "@/lib/yellowcard/kyc-metadata"
import { resolveYcSendChannelId } from "@/lib/payout-providers/yellowcard-provider"
import { mapRecipientToYcSend } from "@/lib/yellowcard/map-recipient-to-yc-send"
import { listYellowcardChannels } from "@/lib/yellowcard/channels"
import type { RecipientSellPrepareRow } from "@/lib/terminal/recipient-sell-prepare"
import { resolveRecipientPayoutCountry } from "@/lib/terminal/recipient-sell-prepare"
import { isYcLocalPayInEnabledForCountry } from "@/lib/yellowcard/yc-receive-gate"

async function resolveYcReceiveChannelId(input: {
  countryCode: string
  currencyCode: string
  rail: "bank_transfer" | "mobile_money"
}): Promise<string | null> {
  const channels = await listYellowcardChannels()
  const match = channels.find((ch) => {
    const country = String(ch.country ?? "").toUpperCase()
    const currency = String(ch.currency ?? "").toUpperCase()
    if (country !== input.countryCode || currency !== input.currencyCode) return false
    const ramp = String(ch.rampType ?? "").toLowerCase()
    if (ramp.includes("withdraw") || ramp.includes("send")) return false
    const channelType = String(ch.channelType ?? "").toLowerCase()
    if (input.rail === "mobile_money") {
      return channelType.includes("momo") || channelType.includes("mobile")
    }
    return channelType.includes("bank") || !channelType.includes("momo")
  })
  return match ? String(match.id ?? match.channelId ?? "").trim() || null : null
}

/**
 * Create locked cross-border quote + leg 1 receive session.
 */
export async function createCrossBorderTransfer(input: {
  admin: SupabaseClient
  userId: string
  businessId?: string | null
  customerUID: string
  payInCurrency: string
  payInCountry: string
  payInRail: "bank_transfer" | "mobile_money"
  receiveAmount: number
  recipient: RecipientSellPrepareRow
  senderProfile: Parameters<typeof buildYcKycPersonMetadata>[0]["profile"]
}): Promise<{
  transferId: string
  transactionId: string
  localPayIn: number
  customerRate: number
  processingFee: number
  bankInfo: Record<string, unknown> | null
  expiresAt: string
}> {
  const admin = input.admin
  const payInCurrency = input.payInCurrency.toUpperCase()
  const receiveCurrency = String(input.recipient.currency || "").toUpperCase()
  const receiveCountry = resolveRecipientPayoutCountry(input.recipient)
  if (!receiveCountry) throw new Error("Recipient country required")
  if (payInCurrency === receiveCurrency) {
    throw new Error("Through Local Currency requires cross-currency corridors")
  }

  const payInEnabled = await isYcLocalPayInEnabledForCountry(admin, input.payInCountry)
  if (!payInEnabled) {
    throw new Error("Local pay-in is not enabled for your country")
  }

  const rates = await listYcRates(admin, { status: "active" })
  const cross = findYcRate(rates, payInCurrency, receiveCurrency)
  if (!cross?.rate) {
    throw new Error(`No Yellowcard cross rate for ${payInCurrency}→${receiveCurrency}`)
  }

  const receiveChannelId = await resolveYcReceiveChannelId({
    countryCode: input.payInCountry.toUpperCase(),
    currencyCode: payInCurrency,
    rail: input.payInRail,
  })
  const sendRail =
    input.recipient.mobile_provider ||
    String(input.recipient.bank_name || "").toLowerCase().includes("mobile money")
      ? ("mobile_money" as const)
      : ("bank_transfer" as const)
  const sendChannelId = await resolveYcSendChannelId({
    countryCode: receiveCountry,
    currencyCode: receiveCurrency,
    rail: sendRail,
  })
  if (!receiveChannelId || !sendChannelId) {
    throw new Error("Yellowcard channels unavailable for this corridor")
  }

  const { data: corridorRow } = await admin
    .from("payout_corridors")
    .select("fields_schema")
    .eq("country_code", receiveCountry)
    .eq("currency_code", receiveCurrency)
    .eq("rail", sendRail)
    .maybeSingle()

  const ycRecipientCheck = validateYcRecipientForCorridor({
    countryCode: receiveCountry,
    currencyCode: receiveCurrency,
    fieldsSchema: corridorRow?.fields_schema,
    row: input.recipient,
  })
  if (!ycRecipientCheck.ok) {
    throw new Error(ycRecipientCheck.message)
  }

  const sender = buildYcKycPersonMetadata({ profile: input.senderProfile, requireNgIds: true })
  const recipientMapped = await mapRecipientToYcSend(input.recipient)

  // Provisional send lock for fee/crypto sizing
  const leg2Seq = `yc_cb_l2_${randomUUID()}`
  const sendRes = await submitYcSend({
    sequenceId: leg2Seq,
    customerUID: input.customerUID,
    channelId: sendChannelId,
    currency: receiveCurrency,
    country: receiveCountry,
    localAmount: input.receiveAmount,
    refundMode: "cross_border_send",
    sender,
    destination: recipientMapped.destination,
    sendExtras: recipientMapped.root,
    reason: "cross_border_leg2_quote",
  })

  const fromLeg = findYcRate(rates, payInCurrency, "USDC")
  const toLeg = findYcRate(rates, receiveCurrency, "USDC")
  const pricing = computeYcCrossBorderPricing({
    receiveAmount: input.receiveAmount,
    customerRate: cross.rate,
    ycSellFrom: Number(fromLeg?.yc_sell ?? 0),
    ycBuyTo: Number(toLeg?.yc_buy ?? 0),
    receiveLeg: { cryptoAmountUsd: 0, networkFeeAmountUsd: 0, serviceFeeAmountUsd: 0 },
    sendLeg: {
      cryptoAmountUsd: Number(sendRes.settlementInfo?.cryptoAmount ?? 0),
      networkFeeAmountUsd: Number(sendRes.networkFeeAmountUSD ?? 0),
      serviceFeeAmountUsd: Number(sendRes.serviceFeeAmountUSD ?? 0),
    },
  })

  const leg1Seq = `yc_cb_l1_${randomUUID()}`
  const receiveRes = await submitYcReceive({
    sequenceId: leg1Seq,
    customerUID: input.customerUID,
    channelId: receiveChannelId,
    currency: payInCurrency,
    country: input.payInCountry.toUpperCase(),
    localAmount: pricing.localPayIn,
    sender,
    reason: "cross_border_leg1",
  })

  // Recompute with receive leg fees if present
  const pricingFinal = computeYcCrossBorderPricing({
    receiveAmount: input.receiveAmount,
    customerRate: cross.rate,
    ycSellFrom: Number(fromLeg?.yc_sell ?? receiveRes.rate ?? 0),
    ycBuyTo: Number(toLeg?.yc_buy ?? sendRes.rate ?? 0),
    receiveLeg: {
      cryptoAmountUsd: Number(receiveRes.settlementInfo?.cryptoAmount ?? 0),
      networkFeeAmountUsd: Number(receiveRes.networkFeeAmountUSD ?? 0),
      serviceFeeAmountUsd: Number(receiveRes.serviceFeeAmountUSD ?? 0),
    },
    sendLeg: {
      cryptoAmountUsd: Number(sendRes.settlementInfo?.cryptoAmount ?? 0),
      networkFeeAmountUsd: Number(sendRes.networkFeeAmountUSD ?? 0),
      serviceFeeAmountUsd: Number(sendRes.serviceFeeAmountUSD ?? 0),
    },
  })

  const expiresAt = new Date(Date.now() + YC_QUOTE_TTL_MS).toISOString()
  const { data: tx, error: txErr } = await admin
    .from("transactions")
    .insert({
      user_id: input.userId,
      business_id: input.businessId ?? null,
      provider: "yellowcard",
      status: "pending",
      amount: pricingFinal.localPayIn,
      currency: payInCurrency,
      direction: "out",
      metadata: {
        yc_mode: "cross_border_send",
        yc_sequence_id: leg1Seq,
        receive_amount: input.receiveAmount,
        receive_currency: receiveCurrency,
        customer_rate: cross.rate,
      },
    })
    .select("id")
    .single()
  if (txErr || !tx) throw new Error(txErr?.message || "failed_to_create_transaction")

  const { data: transfer, error: trErr } = await admin
    .from("yc_transfers")
    .insert({
      transaction_id: tx.id,
      user_id: input.userId,
      business_id: input.businessId ?? null,
      mode: "cross_border_send",
      status: "awaiting_pay_in",
      pay_in_currency: payInCurrency,
      receive_currency: receiveCurrency,
      quoted_pay_in: pricingFinal.localPayIn,
      quoted_receive: input.receiveAmount,
      customer_rate: cross.rate,
      leg1_sequence_id: leg1Seq,
      leg1_yc_id: receiveRes.id ?? null,
      leg1_channel_id: receiveChannelId,
      leg1_status: receiveRes.status ?? "pending",
      leg2_sequence_id: leg2Seq,
      leg2_yc_id: sendRes.id ?? null,
      leg2_channel_id: sendChannelId,
      leg2_status: "quoted",
      bank_info: receiveRes.bankInfo ?? null,
      settlement_info: {
        receive: receiveRes.settlementInfo,
        send: sendRes.settlementInfo,
      },
      metadata: {
        processing_fee: pricingFinal.processingFee,
        margin_amount: pricingFinal.marginAmount,
        recipient: recipientMapped,
        sender,
      },
      expires_at: expiresAt,
    })
    .select("id")
    .single()
  if (trErr || !transfer) throw new Error(trErr?.message || "failed_to_create_yc_transfer")

  return {
    transferId: String(transfer.id),
    transactionId: String(tx.id),
    localPayIn: pricingFinal.localPayIn,
    customerRate: cross.rate,
    processingFee: pricingFinal.processingFee,
    bankInfo: (receiveRes.bankInfo as Record<string, unknown>) ?? null,
    expiresAt,
  }
}

/**
 * On receive crypto settlement: execute leg 2 send crypto deposit from omnibus.
 * Note: POST /send was already submitted at quote time; deposit USDC to its walletAddress.
 */
export async function maybeExecuteCrossBorderLeg2(
  admin: SupabaseClient,
  transferId: string,
): Promise<void> {
  const { data: transfer } = await admin.from("yc_transfers").select("*").eq("id", transferId).maybeSingle()
  if (!transfer || transfer.mode !== "cross_border_send") return
  if (String(transfer.leg2_status) === "complete" || String(transfer.status) === "completed") return
  if (String(transfer.leg2_status) === "depositing") return

  const settlement = transfer.settlement_info as {
    send?: { walletAddress?: string; cryptoAmount?: number }
  } | null
  const walletAddress = String(settlement?.send?.walletAddress ?? "").trim()
  const cryptoAmount = Number(settlement?.send?.cryptoAmount ?? 0)
  if (!walletAddress || !(cryptoAmount > 0)) {
    throw new Error("cross_border_leg2_missing_settlement")
  }

  await admin
    .from("yc_transfers")
    .update({ leg2_status: "depositing", status: "leg2_in_progress", updated_at: new Date().toISOString() })
    .eq("id", transferId)

  const deposit = await executeYcCryptoDeposit({
    ycWalletAddress: walletAddress,
    cryptoAmountUsd: cryptoAmount,
    pollForSettlement: true,
  })

  if (deposit.status === "failed") {
    await admin
      .from("yc_transfers")
      .update({
        status: "failed",
        leg2_status: "failed",
        metadata: {
          ...(transfer.metadata as object),
          leg2_deposit_error: deposit.errorMessage,
          ops_alert: "cross_border_leg2_failed_refund_to_fee_wallet",
        },
        updated_at: new Date().toISOString(),
      })
      .eq("id", transferId)
    if (transfer.transaction_id) {
      await admin
        .from("transactions")
        .update({ status: "failed", updated_at: new Date().toISOString() })
        .eq("id", transfer.transaction_id)
    }
    console.error("[yc-cross-border] leg2 deposit failed — USDC refund to fee wallet; NGN recovery runbook", {
      transferId,
      error: deposit.errorMessage,
    })
    return
  }

  await admin
    .from("yc_transfers")
    .update({
      leg1_status: "complete",
      leg2_status: "pending_yc",
      metadata: {
        ...(transfer.metadata as object),
        leg2_deposit_tx_hash: deposit.txHash,
      },
      updated_at: new Date().toISOString(),
    })
    .eq("id", transferId)
}

/** Mark cross-border complete on SEND.COMPLETE for leg2 + margin sweep to fee wallet. */
export async function completeCrossBorderOnSendSuccess(
  admin: SupabaseClient,
  transferId: string,
): Promise<void> {
  const { data: transfer } = await admin.from("yc_transfers").select("*").eq("id", transferId).maybeSingle()
  if (!transfer) return
  if (String(transfer.status) === "completed") return

  const now = new Date().toISOString()
  const meta = (transfer.metadata || {}) as Record<string, unknown>
  const omnibusIn = Number(transfer.omnibus_in_actual ?? 0)
  const leg2Crypto = Number(
    (transfer.settlement_info as { send?: { cryptoAmount?: number } } | null)?.send?.cryptoAmount ?? 0,
  )
  const processingFee = Number(meta.processing_fee ?? 0)
  const marginAmount = Number(meta.margin_amount ?? 0)
  // Surplus left in omnibus after leg2 crypto out = FX margin (+ any residual).
  const residual = omnibusIn > 0 && leg2Crypto > 0 ? Math.max(0, omnibusIn - leg2Crypto) : 0
  const sweepAmt = Math.max(processingFee, marginAmount, residual)

  let feeWalletSweepTxHash: string | null = null
  if (sweepAmt >= 0.01 && !meta.fee_wallet_sweep_tx_hash) {
    const { resolveWalletSendFeeSolanaAddress } = await import("@/lib/wallet-send/fee-address")
    const { sendStablecoinFromDepositOmnibus } = await import("@/lib/turnkey/send-from-omnibus")
    const feeAddr = resolveWalletSendFeeSolanaAddress({ ledgerCurrency: "USD" })
    if (feeAddr) {
      const marginSend = await sendStablecoinFromDepositOmnibus({
        ledgerCurrency: "USD",
        asset: "USDC",
        destinationAddress: feeAddr,
        amount: sweepAmt,
        pollForSettlement: false,
      }).catch((e) => {
        console.warn("[yc-cross-border] margin sweep failed (non-fatal):", e)
        return null
      })
      feeWalletSweepTxHash = marginSend?.txHash ?? null
    }
  }

  await admin
    .from("yc_transfers")
    .update({
      status: "completed",
      leg2_status: "complete",
      fee_wallet_sweep: sweepAmt > 0 ? sweepAmt : transfer.fee_wallet_sweep,
      metadata: {
        ...meta,
        ...(feeWalletSweepTxHash ? { fee_wallet_sweep_tx_hash: feeWalletSweepTxHash } : {}),
        completed_at: now,
      },
      updated_at: now,
    })
    .eq("id", transferId)

  if (transfer.transaction_id) {
    const { data: txRow } = await admin
      .from("transactions")
      .select("metadata")
      .eq("id", transfer.transaction_id)
      .maybeSingle()
    const prior = (txRow?.metadata || {}) as Record<string, unknown>
    const { mergeYcPayoutLifecycle } = await import("@/lib/yellowcard/yc-ledger")
    await admin
      .from("transactions")
      .update({
        status: "settled",
        settled_at: now,
        metadata: mergeYcPayoutLifecycle(prior, { completed_at: now, processing_at: now }),
        updated_at: now,
      })
      .eq("id", transfer.transaction_id)
  }
}
