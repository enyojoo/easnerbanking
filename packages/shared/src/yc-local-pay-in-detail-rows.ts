import { formatMoneyDisplay } from "./format-money-display"
import { formatReviewRowMoneyDisplay } from "./format-review-row-money"
import { formatSendRateLabel } from "./format-exchange-rate"
import { formatPayoutRecipientSubtitle } from "./payout-recipient-subtitle"
import { computeFootedDisplayProcessingFee } from "./payout-processing-fee"
import { isPayoutReviewFeeVisible } from "./payout-review-display"
import { hasPayoutCrossCurrencyFx } from "./payout-review-display"
import {
  REVIEW_ROW_LABELS,
  TLC_LOCAL_TRANSFER_METHOD,
} from "./review-row-labels"
import { computeYcCrossBorderPrincipalLocalPayIn } from "./transactions/yc-deposit-display"
import {
  displayPayoutReceiveAmount,
  type GlobalPayoutRecipientSnapshot,
  type GlobalPayoutReviewSnapshot,
} from "./transactions/global-payout-types"

export type YcLocalPayInDetailRow = {
  id: string
  label: string
  value: string
  valueBold?: boolean
}

function resolveCrossBorderPrincipalLocalPayIn(
  payoutReview: GlobalPayoutReviewSnapshot,
): number {
  if (
    payoutReview.principal_local_pay_in != null &&
    payoutReview.principal_local_pay_in > 0
  ) {
    return payoutReview.principal_local_pay_in
  }
  return computeYcCrossBorderPrincipalLocalPayIn({
    receiveAmount: displayPayoutReceiveAmount(payoutReview),
    customerRate: payoutReview.exchange_rate,
  })
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
  const principalLocal = resolveCrossBorderPrincipalLocalPayIn(payoutReview)
  const amountPaid = payoutReview.total_debited
  const preciseFeeLocal =
    payoutReview.display_processing_fee_local != null &&
    payoutReview.display_processing_fee_local > 0
      ? payoutReview.display_processing_fee_local
      : displayProcessingFee
  const feeLocal = computeFootedDisplayProcessingFee({
    sendingAmount: principalLocal,
    totalDebited: amountPaid,
    fallbackFee: preciseFeeLocal,
  })

  rows.push({
    id: "transfer-amount",
    label: REVIEW_ROW_LABELS.transferAmount,
    value: formatReviewRowMoneyDisplay(
      REVIEW_ROW_LABELS.transferAmount,
      principalLocal,
      sendCurrency,
    ),
  })

  if (isPayoutReviewFeeVisible(feeLocal)) {
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
    id: "amount-paid",
    label: REVIEW_ROW_LABELS.amountPaid,
    value: formatReviewRowMoneyDisplay(
      REVIEW_ROW_LABELS.amountPaid,
      amountPaid,
      sendCurrency,
    ),
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
