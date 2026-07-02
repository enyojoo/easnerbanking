import type { GlobalPayoutReviewSnapshot } from "@easner/shared/transactions/global-payout-types"
import {
  isWalletSendOutRow as isWalletSendOutRowShared,
  resolveWalletSendTransferMethod,
} from "@easner/shared"
import { resolveWalletSendExecutionModel, type WalletSendExecutionModel } from "./routing"
import type { WalletSendSessionRow } from "./wallet-send-session"

function roundMoney(n: number): number {
  return Math.round(n * 1_000_000) / 1_000_000
}

function readNestedPayoutReview(raw: unknown): GlobalPayoutReviewSnapshot | null {
  if (!raw || typeof raw !== "object") return null
  const o = raw as Record<string, unknown>
  const receiveAmount = Number(o.receive_amount)
  const totalDebited = Number(o.total_debited)
  const youSend = Number(o.you_send_amount)
  if (!Number.isFinite(receiveAmount) || receiveAmount <= 0) return null
  if (!Number.isFinite(totalDebited) || totalDebited <= 0) return null
  return {
    you_send_amount: Number.isFinite(youSend) ? youSend : totalDebited,
    total_debited: totalDebited,
    exchange_fee: Number.isFinite(Number(o.exchange_fee)) ? Number(o.exchange_fee) : 0,
    processing_fee: Number.isFinite(Number(o.processing_fee)) ? Number(o.processing_fee) : 0,
    exchange_rate: Number.isFinite(Number(o.exchange_rate)) ? Number(o.exchange_rate) : 1,
    send_currency: String(o.send_currency || "USD").toUpperCase(),
    receive_amount: receiveAmount,
    receive_currency: String(o.receive_currency || "USD").toUpperCase(),
    transfer_method: String(o.transfer_method || "").trim(),
    processing_time: String(o.processing_time || "").trim(),
    ...(o.execution_model === "direct_turnkey" || o.execution_model === "lifi_bridge"
      ? { execution_model: o.execution_model }
      : {}),
  }
}

export function buildWalletSendPayoutReviewSnapshot(input: {
  session: Pick<
    WalletSendSessionRow,
    | "receive_amount"
    | "receive_asset"
    | "receive_network"
    | "source_balance_currency"
    | "total_debited"
    | "margin_amount"
    | "customer_rate"
    | "execution_model"
    | "lifi_floor"
    | "lifi_mid"
  >
  channelCost?: number
  reviewSnapshot?: Record<string, unknown> | null
}): GlobalPayoutReviewSnapshot {
  const balanceCurrency = input.session.source_balance_currency.trim().toUpperCase()
  const executionModel = input.session.execution_model
  const receiveAmount = input.session.receive_amount
  const totalDebited = input.session.total_debited
  const marginAmount = input.session.margin_amount
  const customerRate =
    executionModel === "direct_turnkey" ? 1 : input.session.customer_rate

  const youSendFromReview = Number(input.reviewSnapshot?.you_send_amount)
  const youSendAmount =
    Number.isFinite(youSendFromReview) && youSendFromReview > 0
      ? youSendFromReview
      : executionModel === "direct_turnkey"
        ? receiveAmount
        : roundMoney(receiveAmount / customerRate)

  const exchangeFeeFromReview = Number(input.reviewSnapshot?.exchange_fee)
  const channelCostFromSession =
    input.channelCost ??
    (executionModel === "lifi_bridge"
      ? roundMoney(Math.max(0, input.session.lifi_floor - receiveAmount / input.session.lifi_mid))
      : 0)
  const exchangeFee =
    Number.isFinite(exchangeFeeFromReview) && exchangeFeeFromReview >= 0
      ? exchangeFeeFromReview
      : channelCostFromSession

  const processingTime = String(input.reviewSnapshot?.processing_time ?? "").trim()
  const reviewTransferMethod = String(input.reviewSnapshot?.transfer_method ?? "").trim()
  const transferMethod = resolveWalletSendTransferMethod(
    reviewTransferMethod,
    input.session.receive_asset,
    input.session.receive_network,
  )

  const exchangeRateFromReview = Number(input.reviewSnapshot?.exchange_rate)
  const exchangeRate =
    Number.isFinite(exchangeRateFromReview) && exchangeRateFromReview > 0
      ? exchangeRateFromReview
      : customerRate

  // Explicit Easner 1% leg. Direct Turnkey: margin_amount IS the fee. LI.FI: derive the bps
  // leg = total − lifiFloor − FX margin (FX margin stays hidden, folded into the rate).
  const processingFeeFromReview = Number(input.reviewSnapshot?.processing_fee)
  const fallbackProcessingFee =
    executionModel === "direct_turnkey"
      ? marginAmount
      : roundMoney(Math.max(0, totalDebited - input.session.lifi_floor - marginAmount))
  const processingFee =
    Number.isFinite(processingFeeFromReview) && processingFeeFromReview >= 0
      ? processingFeeFromReview
      : fallbackProcessingFee

  return {
    you_send_amount: youSendAmount,
    total_debited: totalDebited,
    exchange_fee: exchangeFee,
    processing_fee: processingFee,
    exchange_rate: exchangeRate,
    send_currency: balanceCurrency,
    receive_amount: receiveAmount,
    receive_currency: input.session.receive_asset.trim().toUpperCase(),
    transfer_method: transferMethod,
    processing_time: processingTime,
    execution_model: executionModel,
    ...(marginAmount > 0 ? { margin_amount: marginAmount } : {}),
    ...(processingFee > 0 ? { easner_fee: processingFee } : {}),
    ...(exchangeFee > 0 ? { channel_cost: exchangeFee } : {}),
  }
}

export const isWalletSendOutRow = isWalletSendOutRowShared

/** Resolve payout_review for wallet_send rows (nested snapshot or legacy flat metadata). */
export function resolveWalletSendPayoutReview(
  meta: Record<string, unknown>,
  ledgerAmount: number,
  ledgerCurrency: string,
): GlobalPayoutReviewSnapshot | null {
  const receiveNetwork = String(meta.receive_network ?? meta.chain ?? "").trim()
  const nested = readNestedPayoutReview(meta.payout_review)
  if (nested) {
    const executionModel =
      nested.execution_model ??
      resolveWalletSendExecutionModel(nested.receive_currency, receiveNetwork)
    return {
      ...nested,
      execution_model: executionModel,
      transfer_method: resolveWalletSendTransferMethod(
        nested.transfer_method,
        nested.receive_currency,
        receiveNetwork,
      ),
    }
  }

  const receiveAmount = Number(meta.receive_amount)
  if (!Number.isFinite(receiveAmount) || receiveAmount <= 0) return null

  const receiveCurrency = String(meta.receive_asset ?? meta.receive_currency ?? "").trim().toUpperCase()
  if (!receiveCurrency) return null

  const totalDebited =
    Number(meta.total_debited) > 0
      ? Number(meta.total_debited)
      : ledgerAmount > 0
        ? ledgerAmount
        : 0
  if (!Number.isFinite(totalDebited) || totalDebited <= 0) return null

  const sendCurrency = String(meta.send_currency ?? ledgerCurrency).trim().toUpperCase()
  const executionModelRaw = String(meta.execution_model ?? "").trim()
  const executionModel: WalletSendExecutionModel =
    executionModelRaw === "direct_turnkey" || executionModelRaw === "lifi_bridge"
      ? executionModelRaw
      : resolveWalletSendExecutionModel(receiveCurrency, receiveNetwork)

  const marginAmount = Number(meta.margin_amount ?? meta.processing_fee ?? 0)
  const youSendRaw = Number(meta.you_send_amount)
  const customerRate = Number(meta.customer_rate ?? meta.exchange_rate ?? 1)
  const youSendAmount =
    Number.isFinite(youSendRaw) && youSendRaw > 0
      ? youSendRaw
      : executionModel === "direct_turnkey"
        ? receiveAmount
        : customerRate > 0
          ? roundMoney(receiveAmount / customerRate)
          : totalDebited

  const exchangeFeeRaw = Number(meta.exchange_fee ?? meta.channel_cost ?? 0)
  const exchangeFee =
    Number.isFinite(exchangeFeeRaw) && exchangeFeeRaw >= 0
      ? exchangeFeeRaw
      : roundMoney(Math.max(0, totalDebited - youSendAmount))

  return {
    you_send_amount: youSendAmount,
    total_debited: totalDebited,
    exchange_fee: exchangeFee,
    processing_fee: Number.isFinite(marginAmount) ? marginAmount : 0,
    exchange_rate:
      Number.isFinite(customerRate) && customerRate > 0 ? customerRate : 1,
    send_currency: sendCurrency,
    receive_amount: receiveAmount,
    receive_currency: receiveCurrency,
    transfer_method: resolveWalletSendTransferMethod(
      String(
        (meta.payout_review as Record<string, unknown> | undefined)?.transfer_method ??
          meta.transfer_method ??
          "",
      ),
      receiveCurrency,
      receiveNetwork,
    ),
    processing_time: String(meta.processing_time ?? "").trim(),
    execution_model: executionModel,
    ...(Number.isFinite(marginAmount) && marginAmount > 0
      ? { margin_amount: marginAmount, easner_fee: marginAmount }
      : {}),
    ...(exchangeFee > 0 ? { channel_cost: exchangeFee } : {}),
  }
}
