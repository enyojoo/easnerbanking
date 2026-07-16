import { formatMoneyDisplay } from "./format-money-display"
import { formatReviewRowMoneyDisplay } from "./format-review-row-money"
import { formatSendRateLabel } from "./format-exchange-rate"
import { formatPayoutRecipientSubtitle } from "./payout-recipient-subtitle"
import { isPayoutReviewFeeVisible } from "./payout-review-display"
import { hasPayoutCrossCurrencyFx } from "./payout-review-display"
import {
  REVIEW_ROW_LABELS,
  reviewPrimaryAmountLabel,
  TLC_LOCAL_TRANSFER_METHOD,
} from "./review-row-labels"
import type { GlobalPayoutRecipientSnapshot, GlobalPayoutReviewSnapshot } from "./transactions/global-payout-types"

export type YcLocalPayInDetailRow = {
  id: string
  label: string
  value: string
  valueBold?: boolean
}

export function buildCrossBorderSendDetailRows(input: {
  payoutReview: GlobalPayoutReviewSnapshot
  recipientSnapshot?: GlobalPayoutRecipientSnapshot | null
  whenLabel: string
  displayProcessingFee: number
}): YcLocalPayInDetailRow[] {
  const { payoutReview, recipientSnapshot, whenLabel, displayProcessingFee } = input
  const sendCurrency = payoutReview.send_currency
  const hasFx = hasPayoutCrossCurrencyFx(
    payoutReview.send_currency,
    payoutReview.receive_currency,
  )
  const rows: YcLocalPayInDetailRow[] = []

  rows.push({
    id: "amount-paid",
    label: reviewPrimaryAmountLabel("local_pay_in", "detail"),
    value: formatMoneyDisplay(payoutReview.you_send_amount, sendCurrency),
  })

  if (isPayoutReviewFeeVisible(displayProcessingFee)) {
    const feeLocal =
      payoutReview.display_processing_fee_local != null &&
      payoutReview.display_processing_fee_local > 0
        ? payoutReview.display_processing_fee_local
        : displayProcessingFee
    rows.push({
      id: "processing-fee",
      label: REVIEW_ROW_LABELS.processingFee,
      value: formatReviewRowMoneyDisplay(
        REVIEW_ROW_LABELS.processingFee,
        feeLocal,
        sendCurrency,
      ),
    })
  }

  if (hasFx) {
    rows.push({
      id: "exchange-rate",
      label: REVIEW_ROW_LABELS.exchangeRate,
      value: formatSendRateLabel(
        payoutReview.send_currency,
        payoutReview.receive_currency,
        payoutReview.exchange_rate,
      ),
    })
  }

  rows.push({
    id: "recipient-gets",
    label: REVIEW_ROW_LABELS.recipientGets,
    value: formatMoneyDisplay(payoutReview.receive_amount, payoutReview.receive_currency),
    valueBold: true,
  })

  if (recipientSnapshot?.full_name) {
    const subtitle = formatPayoutRecipientSubtitle({
      bankName: recipientSnapshot.bank_name,
      phone: recipientSnapshot.phone,
      mobileProvider: recipientSnapshot.mobile_provider,
      accountNumber: recipientSnapshot.account_number,
      fullAccountNumber: recipientSnapshot.account_number,
    })
    rows.push({
      id: "recipient",
      label: REVIEW_ROW_LABELS.recipient,
      value: subtitle
        ? `${recipientSnapshot.full_name}\n${subtitle}`
        : recipientSnapshot.full_name,
    })
  }

  rows.push({
    id: "transfer-method",
    label: REVIEW_ROW_LABELS.transferMethod,
    value: TLC_LOCAL_TRANSFER_METHOD,
  })

  rows.push({
    id: "when",
    label: REVIEW_ROW_LABELS.when,
    value: whenLabel,
  })

  return rows
}
