import { formatMoneyDisplay } from "./format-money-display"
import { formatReviewRowMoneyDisplay } from "./format-review-row-money"
import { formatSendRateLabel } from "./format-exchange-rate"
import { isPayoutReviewFeeVisible, shouldShowPayoutReviewFeeRow } from "./payout-review-display"
import { computeFootedDisplayProcessingFee } from "./payout-processing-fee"
import {
  REVIEW_ROW_LABELS,
  TLC_LOCAL_TRANSFER_METHOD,
} from "./review-row-labels"
import { resolveYcFundBalanceTransferMethod } from "./transactions/yc-deposit-display"
import type { YcPayInRail } from "./yc-quote-summary"

export type YcLocalPayInReviewMode = "fund_balance" | "cross_border_send"
export type YcLocalPayInReviewPhase = "preview" | "locked"

export type YcLocalPayInReviewRow = {
  id: string
  label: string
  value: string
  valueBold?: boolean
  valueMono?: boolean
}

export function buildYcLocalPayInReviewRows(input: {
  mode: YcLocalPayInReviewMode
  phase: YcLocalPayInReviewPhase
  rail: YcPayInRail
  payInCurrency: string
  receiveCurrency: string
  customerRate: number
  localPayIn: number
  receiveAmount: number
  requestedReceiveAmount?: number
  processingFeeLocal?: number
  processingFeeUsd?: number
  exchangeFeeUsd?: number
  principalLocal?: number
  usdCredit?: number
  transactionId?: string
  processingTime?: string
}): YcLocalPayInReviewRow[] {
  const rows: YcLocalPayInReviewRow[] = []
  const isFundBalance = input.mode === "fund_balance"
  const isCrossBorder = input.mode === "cross_border_send"
  const isLocked = input.phase === "locked"
  const isMomo = input.rail === "mobile_money"
  const isCrossBorderBankLocked = isCrossBorder && isLocked && !isMomo
  /** Bank TLC preview/locked: show principal + fee when we have a footing breakdown. */
  const isCrossBorderBankBreakdown =
    isCrossBorder && !isMomo && (input.principalLocal ?? 0) > 0
  /** Fund-balance review uses locked /confirm order data for bank and MoMo. */
  const isFundBalanceLockedBreakdown = isFundBalance && isLocked
  const hasPrincipalBreakdown =
    (isFundBalanceLockedBreakdown || isCrossBorderBankLocked || isCrossBorderBankBreakdown) &&
    (input.principalLocal ?? 0) > 0
  const processingFeeLocal = hasPrincipalBreakdown
    ? computeFootedDisplayProcessingFee({
        sendingAmount: input.principalLocal!,
        totalDebited: input.localPayIn,
        fallbackFee: input.processingFeeLocal,
      })
    : input.processingFeeLocal ?? 0
  const transferMethod = isFundBalance
    ? resolveYcFundBalanceTransferMethod(input.rail)
    : TLC_LOCAL_TRANSFER_METHOD

  if (isLocked && input.transactionId) {
    rows.push({
      id: "transaction-id",
      label: REVIEW_ROW_LABELS.transactionId,
      value: input.transactionId.toUpperCase(),
      valueMono: true,
    })
  }

  if (input.customerRate > 0) {
    const rateLabel = isFundBalance
      ? formatSendRateLabel("USD", input.payInCurrency, input.customerRate)
      : formatSendRateLabel(input.payInCurrency, input.receiveCurrency, input.customerRate)
    rows.push({
      id: "exchange-rate",
      label: REVIEW_ROW_LABELS.exchangeRate,
      value: rateLabel,
    })
  }

  const showFee =
    isPayoutReviewFeeVisible(processingFeeLocal) ||
    shouldShowPayoutReviewFeeRow({
      processingFee: input.processingFeeUsd,
      exchangeFee: input.exchangeFeeUsd,
    })

  if (
    hasPrincipalBreakdown
  ) {
    const principalLabel = isCrossBorder
      ? REVIEW_ROW_LABELS.transferAmount
      : REVIEW_ROW_LABELS.depositAmount
    rows.push({
      id: "deposit-amount",
      label: principalLabel,
      value: formatReviewRowMoneyDisplay(
        principalLabel,
        input.principalLocal!,
        input.payInCurrency,
      ),
    })
  }

  if (showFee && isPayoutReviewFeeVisible(processingFeeLocal)) {
    rows.push({
      id: "processing-fee",
      label: REVIEW_ROW_LABELS.processingFee,
      value: formatReviewRowMoneyDisplay(
        REVIEW_ROW_LABELS.processingFee,
        processingFeeLocal,
        input.payInCurrency,
      ),
    })
  }

  const payLabel = isFundBalance
    ? isMomo && !isLocked
      ? REVIEW_ROW_LABELS.estimatedToPay
      : REVIEW_ROW_LABELS.totalToPay
    : isCrossBorderBankLocked
      ? REVIEW_ROW_LABELS.totalToPay
      : isLocked
        ? REVIEW_ROW_LABELS.amountToPay
        : isMomo
          ? REVIEW_ROW_LABELS.estimatedToPay
          : REVIEW_ROW_LABELS.amountToPay

  rows.push({
    id: "pay-amount",
    label: payLabel,
    value: formatReviewRowMoneyDisplay(payLabel, input.localPayIn, input.payInCurrency),
    valueBold: (isLocked && isFundBalance) || isCrossBorderBankLocked,
  })

  if (isFundBalanceLockedBreakdown && (input.usdCredit ?? 0) > 0) {
    rows.push({
      id: "amount-to-credit",
      label: REVIEW_ROW_LABELS.amountToCredit,
      value: formatMoneyDisplay(input.usdCredit!, "USD"),
    })
  } else {
    rows.push({
      id: "recipient-gets",
      label: REVIEW_ROW_LABELS.recipientGets,
      value: formatMoneyDisplay(
        input.requestedReceiveAmount ?? input.receiveAmount,
        input.receiveCurrency,
      ),
      valueBold: true,
    })
  }

  rows.push({
    id: "transfer-method",
    label: isFundBalance ? REVIEW_ROW_LABELS.depositMethod : REVIEW_ROW_LABELS.transferMethod,
    value: transferMethod,
    ...(isFundBalance && isMomo ? {} : { valueBold: false }),
  })

  if (isLocked && input.processingTime) {
    rows.push({
      id: "arrival",
      label: REVIEW_ROW_LABELS.arrival,
      value: input.processingTime,
    })
  }

  return rows
}
