import { formatMoneyDisplay } from "./format-money-display"
import { formatReviewRowMoneyDisplay } from "./format-review-row-money"
import { formatSendRateLabel } from "./format-exchange-rate"
import { shouldShowPayoutReviewFeeRow } from "./payout-review-display"
import {
  REVIEW_ROW_LABELS,
  TLC_LOCAL_TRANSFER_METHOD,
} from "./review-row-labels"
import { resolveYcFundBalanceTransferMethod } from "./transactions/yc-deposit-display"
import type { YcPayInRail } from "./yc-quote-summary"

export type YcLocalPayInCompleteMode = "fund_balance" | "cross_border_send"

export type YcLocalPayInCompleteRow = {
  id: string
  label: string
  value: string
  valueBold?: boolean
  valueMono?: boolean
}

export function buildYcLocalPayInCompleteRows(input: {
  mode: YcLocalPayInCompleteMode
  rail: YcPayInRail
  transactionId: string
  payInCurrency: string
  receiveCurrency: string
  localPayIn: number
  receiveAmount: number
  customerRate: number
  processingFeeLocal?: number
  processingFeeUsd?: number
  exchangeFeeUsd?: number
  principalLocal?: number
  recipientName?: string
}): YcLocalPayInCompleteRow[] {
  const rows: YcLocalPayInCompleteRow[] = []
  const isFundBalance = input.mode === "fund_balance"
  const isCrossBorder = input.mode === "cross_border_send"
  const isMomo = input.rail === "mobile_money"
  const transferMethod = isFundBalance
    ? resolveYcFundBalanceTransferMethod(input.rail)
    : TLC_LOCAL_TRANSFER_METHOD

  rows.push({
    id: "transaction-id",
    label: REVIEW_ROW_LABELS.transactionId,
    value: input.transactionId.toUpperCase(),
    valueMono: true,
  })

  if (isFundBalance && isMomo && input.customerRate > 0) {
    rows.push({
      id: "exchange-rate",
      label: REVIEW_ROW_LABELS.exchangeRate,
      value: formatSendRateLabel("USD", input.payInCurrency, input.customerRate),
    })
    if ((input.principalLocal ?? 0) > 0) {
      rows.push({
        id: "deposit-amount",
        label: REVIEW_ROW_LABELS.depositAmount,
        value: formatReviewRowMoneyDisplay(
          REVIEW_ROW_LABELS.depositAmount,
          input.principalLocal!,
          input.payInCurrency,
        ),
      })
    }
    const showFee =
      (input.processingFeeLocal ?? 0) > 0 ||
      shouldShowPayoutReviewFeeRow({
        processingFee: input.processingFeeUsd ?? 0,
        exchangeFee: input.exchangeFeeUsd ?? 0,
      })
    if (showFee && (input.processingFeeLocal ?? 0) > 0) {
      rows.push({
        id: "processing-fee",
        label: REVIEW_ROW_LABELS.processingFee,
        value: formatReviewRowMoneyDisplay(
          REVIEW_ROW_LABELS.processingFee,
          input.processingFeeLocal!,
          input.payInCurrency,
        ),
      })
    }
    rows.push({
      id: "total-to-pay",
      label: REVIEW_ROW_LABELS.totalToPay,
      value: formatReviewRowMoneyDisplay(
        REVIEW_ROW_LABELS.totalToPay,
        input.localPayIn,
        input.payInCurrency,
      ),
      valueBold: true,
    })
    rows.push({
      id: "amount-to-credit",
      label: REVIEW_ROW_LABELS.amountToCredit,
      value: formatMoneyDisplay(input.receiveAmount, input.receiveCurrency),
    })
  } else if (isCrossBorder && isMomo && input.customerRate > 0) {
    rows.push({
      id: "exchange-rate",
      label: REVIEW_ROW_LABELS.exchangeRate,
      value: formatSendRateLabel(
        input.payInCurrency,
        input.receiveCurrency,
        input.customerRate,
      ),
    })
    if ((input.principalLocal ?? 0) > 0) {
      rows.push({
        id: "deposit-amount",
        label: REVIEW_ROW_LABELS.depositAmount,
        value: formatReviewRowMoneyDisplay(
          REVIEW_ROW_LABELS.depositAmount,
          input.principalLocal!,
          input.payInCurrency,
        ),
      })
    }
    const showFee = (input.processingFeeLocal ?? 0) > 0
    if (showFee) {
      rows.push({
        id: "processing-fee",
        label: REVIEW_ROW_LABELS.processingFee,
        value: formatReviewRowMoneyDisplay(
          REVIEW_ROW_LABELS.processingFee,
          input.processingFeeLocal!,
          input.payInCurrency,
        ),
      })
    }
    rows.push({
      id: "total-to-pay",
      label: REVIEW_ROW_LABELS.totalToPay,
      value: formatReviewRowMoneyDisplay(
        REVIEW_ROW_LABELS.totalToPay,
        input.localPayIn,
        input.payInCurrency,
      ),
      valueBold: true,
    })
    rows.push({
      id: "recipient-gets",
      label: REVIEW_ROW_LABELS.recipientGets,
      value: formatMoneyDisplay(input.receiveAmount, input.receiveCurrency),
    })
  } else if (isFundBalance && !isMomo) {
    rows.push({
      id: "amount-to-credit",
      label: REVIEW_ROW_LABELS.amountToCredit,
      value: formatMoneyDisplay(input.receiveAmount, input.receiveCurrency),
    })
  } else if (isCrossBorder && !isMomo) {
    rows.push({
      id: "recipient-gets",
      label: REVIEW_ROW_LABELS.recipientGets,
      value: formatMoneyDisplay(input.receiveAmount, input.receiveCurrency),
    })
  }

  rows.push({
    id: "transfer-method",
    label: REVIEW_ROW_LABELS.transferMethod,
    value: transferMethod,
  })

  return rows
}
