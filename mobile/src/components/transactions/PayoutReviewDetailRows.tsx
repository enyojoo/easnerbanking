import React, { type ReactNode } from 'react'
import { View, Text, StyleSheet } from 'react-native'
import {
  REVIEW_ROW_LABELS,
  displayPayoutReceiveAmount,
  computeFootedDisplayProcessingFee,
  formatAccountBalanceLabel,
  formatMoneyDisplay,
  formatPayoutRecipientSubtitle,
  formatReviewRowMoneyDisplay,
  formatSendRateLabel,
  normalizeTransferMethodLabel,
  shouldShowReviewTotalDebited,
  type GlobalPayoutReviewSnapshot,
  type GlobalPayoutRecipientSnapshot,
  type ReviewFlowKind,
} from '@easner/shared'
import { CreditDestinationRow } from './CreditDestinationRow'
import {
  TransactionDetailSummaryRow,
  transactionDetailRowStyles,
} from './TransactionDetailSummaryRow'
import { colors } from '../../theme'

type Props = {
  payoutReview: GlobalPayoutReviewSnapshot
  payoutReviewFlow: ReviewFlowKind
  recipientSnapshot?: GlobalPayoutRecipientSnapshot | null
  showProcessingFee: boolean
  displayProcessingFee: number
  hasFx: boolean
  walletSendReceiveNetwork?: string
  isWalletSendReview: boolean
  displayDescription?: string | null
  name?: string | null
  counterpartyName?: string | null
  counterpartyAddress?: string | null
  destinationAddress?: string | null
  whenTs: string
  sendNote?: string | null
  formatTimestamp: (ts: string) => string
  showRecipientGets?: boolean
  recipientNode?: ReactNode
}

export function PayoutReviewDetailRows({
  payoutReview,
  payoutReviewFlow,
  recipientSnapshot,
  showProcessingFee,
  displayProcessingFee,
  hasFx,
  walletSendReceiveNetwork,
  isWalletSendReview,
  displayDescription,
  name,
  counterpartyName,
  counterpartyAddress,
  destinationAddress,
  whenTs,
  sendNote,
  formatTimestamp,
  showRecipientGets = true,
  recipientNode,
}: Props) {
  const sendCurrency = payoutReview.send_currency
  const feeDisplayAmount =
    payoutReviewFlow === 'balance_payout'
      ? computeFootedDisplayProcessingFee({
          sendingAmount: payoutReview.you_send_amount,
          totalDebited: payoutReview.total_debited,
          fallbackFee: displayProcessingFee,
        })
      : payoutReview.principal_local_pay_in != null
        ? computeFootedDisplayProcessingFee({
            sendingAmount: payoutReview.principal_local_pay_in,
            totalDebited: payoutReview.total_debited,
            fallbackFee: displayProcessingFee,
          })
      : displayProcessingFee

  return (
    <>
      <TransactionDetailSummaryRow
        label={REVIEW_ROW_LABELS.sent}
        value={formatMoneyDisplay(payoutReview.you_send_amount, sendCurrency)}
      />
      {showProcessingFee ? (
        <TransactionDetailSummaryRow
          label={REVIEW_ROW_LABELS.processingFee}
          value={formatReviewRowMoneyDisplay(
            REVIEW_ROW_LABELS.processingFee,
            feeDisplayAmount,
            sendCurrency,
          )}
        />
      ) : null}
      {hasFx ? (
        <TransactionDetailSummaryRow
          label={REVIEW_ROW_LABELS.exchangeRate}
          value={formatSendRateLabel(
            sendCurrency,
            payoutReview.receive_currency,
            payoutReview.exchange_rate,
          )}
        />
      ) : null}
      <TransactionDetailSummaryRow
        label={REVIEW_ROW_LABELS.totalDebited}
        value={formatReviewRowMoneyDisplay(
          REVIEW_ROW_LABELS.totalDebited,
          payoutReview.total_debited,
          sendCurrency,
        )}
        valueBold
      />
      {shouldShowReviewTotalDebited(payoutReviewFlow) && sendCurrency ? (
        <CreditDestinationRow
          label={REVIEW_ROW_LABELS.debitedFrom}
          currency={sendCurrency}
          balanceLabel={formatAccountBalanceLabel(sendCurrency)}
        />
      ) : null}
      {showRecipientGets ? (
        <TransactionDetailSummaryRow
          label={REVIEW_ROW_LABELS.recipientGets}
          value={formatMoneyDisplay(
            displayPayoutReceiveAmount(payoutReview),
            payoutReview.receive_currency,
          )}
          valueBold
        />
      ) : null}
      {recipientSnapshot || recipientNode || isWalletSendReview ? (
        <TransactionDetailSummaryRow label={REVIEW_ROW_LABELS.recipient}>
          {recipientNode ? (
            recipientNode
          ) : recipientSnapshot ? (
            <View style={styles.valueStack}>
              <Text style={styles.valuePrimary}>{recipientSnapshot.full_name}</Text>
              {formatPayoutRecipientSubtitle({
                bankName: recipientSnapshot.bank_name,
                phone: recipientSnapshot.phone,
                mobileProvider: recipientSnapshot.mobile_provider,
                accountNumber: recipientSnapshot.account_number,
                fullAccountNumber: recipientSnapshot.account_number,
                walletNetwork: walletSendReceiveNetwork,
              }) ? (
                <Text style={styles.valueSecondary}>
                  {formatPayoutRecipientSubtitle({
                    bankName: recipientSnapshot.bank_name,
                    phone: recipientSnapshot.phone,
                    mobileProvider: recipientSnapshot.mobile_provider,
                    accountNumber: recipientSnapshot.account_number,
                    fullAccountNumber: recipientSnapshot.account_number,
                    walletNetwork: walletSendReceiveNetwork,
                  })}
                </Text>
              ) : null}
            </View>
          ) : (
            <View style={styles.valueStack}>
              <Text style={styles.valuePrimary}>
                {String(
                  displayDescription || name || counterpartyName || 'Wallet transfer',
                )}
              </Text>
              {formatPayoutRecipientSubtitle({
                bankName: recipientSnapshot?.bank_name || 'Wallet',
                accountNumber: counterpartyAddress || destinationAddress,
                fullAccountNumber: counterpartyAddress || destinationAddress,
                walletNetwork: walletSendReceiveNetwork,
              }) ? (
                <Text style={styles.valueSecondary}>
                  {formatPayoutRecipientSubtitle({
                    bankName: recipientSnapshot?.bank_name || 'Wallet',
                    accountNumber: counterpartyAddress || destinationAddress,
                    fullAccountNumber: counterpartyAddress || destinationAddress,
                    walletNetwork: walletSendReceiveNetwork,
                  })}
                </Text>
              ) : null}
            </View>
          )}
        </TransactionDetailSummaryRow>
      ) : null}
      <TransactionDetailSummaryRow
        label={REVIEW_ROW_LABELS.transferMethod}
        value={normalizeTransferMethodLabel(payoutReview.transfer_method)}
      />
      <TransactionDetailSummaryRow
        label={REVIEW_ROW_LABELS.when}
        value={formatTimestamp(whenTs)}
      />
      {sendNote ? (
        <TransactionDetailSummaryRow label={REVIEW_ROW_LABELS.note} value={sendNote} />
      ) : null}
    </>
  )
}

const styles = StyleSheet.create({
  valueStack: {
    flex: 1,
    alignItems: 'flex-end',
    marginLeft: 8,
  },
  valuePrimary: {
    ...transactionDetailRowStyles.value,
    flex: 0,
  },
  valueSecondary: {
    ...transactionDetailRowStyles.value,
    fontSize: 13,
    color: colors.text.secondary,
    flex: 0,
  },
})
