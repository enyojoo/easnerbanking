import { formatMoneyDisplay } from "./format-money-display"
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
  const transferMethod = isFundBalance
    ? resolveYcFundBalanceTransferMethod(input.rail)
    : TLC_LOCAL_TRANSFER_METHOD

  rows.push({
    id: "transaction-id",
    label: REVIEW_ROW_LABELS.transactionId,
    value: input.transactionId.toUpperCase(),
    valueMono: true,
  })

  if (isFundBalance) {
    rows.push({
      id: "amount-to-credit",
      label: REVIEW_ROW_LABELS.amountToCredit,
      value: formatMoneyDisplay(input.receiveAmount, input.receiveCurrency),
    })
  } else if (isCrossBorder) {
    rows.push({
      id: "recipient-gets",
      label: REVIEW_ROW_LABELS.recipientGets,
      value: formatMoneyDisplay(input.receiveAmount, input.receiveCurrency),
    })
  }

  rows.push({
    id: "transfer-method",
    label: isFundBalance ? REVIEW_ROW_LABELS.depositMethod : REVIEW_ROW_LABELS.transferMethod,
    value: transferMethod,
  })

  return rows
}
