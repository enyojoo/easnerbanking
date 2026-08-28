import {
  buildGlobalPayoutLifecycle,
  formatTransactionDetailHeroTitle,
  walletSendListProductLabel,
  walletSendUserFacingDisplayCurrency,
  type GlobalPayoutReviewSnapshot,
  type GlobalPayoutRecipientSnapshot,
} from '@easner/shared'
import type { MobileTransactionRow } from '../hooks/queries/use-transactions'
import type { NoahTransfer } from './noahService'
import type { Recipient } from '../types'

type BuildPostSendTransactionSnapshotInput = {
  detailId: string
  transfer: NoahTransfer
  recipient: Recipient
  selectedBalanceCurrency: string
  quotedReceiveAmount: number
  calculatedTotalAmount: number
  youSendAmount?: number
  receiveCurrency?: string
  transferMethod?: string
  processingTime?: string
  reviewSnapshot?: Record<string, unknown>
  sendNote?: string
  /** Ledger Easetag P2P – uses dedicated detail rows, not payout_review. */
  easetag?: string
  isWalletSend?: boolean
  walletExecutionModel?: 'direct_turnkey' | 'relay_bridge'
  networkFee?: number
}

function recipientSnapshotFromRecipient(
  recipient: Recipient,
): GlobalPayoutRecipientSnapshot | undefined {
  const fullName = recipient.full_name?.trim()
  if (!fullName) return undefined
  return {
    full_name: fullName,
    ...(recipient.bank_name?.trim() ? { bank_name: recipient.bank_name.trim() } : {}),
    ...(recipient.account_number?.trim() ? { account_number: recipient.account_number.trim() } : {}),
    ...(recipient.phone_number?.trim() ? { phone: recipient.phone_number.trim() } : {}),
    ...(recipient.mobile_provider?.trim()
      ? { mobile_provider: recipient.mobile_provider.trim() }
      : {}),
    ...(recipient.country_code?.trim() ? { country_code: recipient.country_code.trim() } : {}),
    ...(recipient.currency?.trim() ? { currency: recipient.currency.trim() } : {}),
    ...(recipient.transfer_type?.trim() ? { transfer_type: recipient.transfer_type.trim() } : {}),
  }
}

/** Hydrate transaction detail instantly after send confirm (before API enrichment). */
export function buildPostSendTransactionSnapshot(
  input: BuildPostSendTransactionSnapshotInput,
): MobileTransactionRow {
  const {
    detailId,
    transfer,
    recipient,
    selectedBalanceCurrency,
    quotedReceiveAmount,
    calculatedTotalAmount,
    youSendAmount,
    receiveCurrency,
    transferMethod,
    processingTime,
    reviewSnapshot,
    sendNote,
    easetag,
    isWalletSend,
    walletExecutionModel,
    networkFee,
  } = input

  const easetagTag = easetag?.trim().replace(/^@+/, '')
  const isEasetagSend = Boolean(easetagTag)

  const now = new Date().toISOString()
  const easnerTxId = transfer.easner_transaction_id?.trim() || detailId
  const providerTxId = transfer.transaction_id?.trim() || transfer.id?.trim()
  const parsedAmount = Number(transfer.amount)
  const amount =
    Number.isFinite(parsedAmount) && parsedAmount > 0
      ? parsedAmount
      : isEasetagSend
        ? calculatedTotalAmount
        : quotedReceiveAmount || calculatedTotalAmount
  const currency = (
    isEasetagSend
      ? selectedBalanceCurrency
      : transfer.currency || recipient.currency || selectedBalanceCurrency || 'usd'
  ).toLowerCase()

  const payoutReview = (reviewSnapshot ??
    (isEasetagSend || (!quotedReceiveAmount && !calculatedTotalAmount)
      ? undefined
      : {
          you_send_amount: youSendAmount ?? calculatedTotalAmount,
          total_debited: calculatedTotalAmount,
          exchange_fee: 0,
          processing_fee: 0,
          exchange_rate: 1,
          send_currency: selectedBalanceCurrency,
          receive_amount: quotedReceiveAmount,
          receive_currency: receiveCurrency ?? recipient.currency ?? selectedBalanceCurrency,
          transfer_method: transferMethod ?? 'Transfer',
          processing_time: processingTime ?? 'Instant',
          ...(isWalletSend && walletExecutionModel ? { execution_model: walletExecutionModel } : {}),
          ...(isWalletSend && networkFee != null && networkFee > 0 ? { network_fee: networkFee } : {}),
        })) as GlobalPayoutReviewSnapshot | undefined
  const recipientSnapshot = recipientSnapshotFromRecipient(recipient)
  const note = sendNote?.trim()
  const walletNetwork = recipient.wallet_network?.trim()
  const walletAddress = recipient.account_number?.trim()
  const recipientName = recipient.full_name?.trim() || 'Transfer'

  const metadata: Record<string, unknown> = {
    ...(isEasetagSend && easetagTag ? { payee_easetag: easetagTag } : {}),
    ...(isWalletSend ? { activity_type: 'wallet_send' as const } : {}),
    ...(isWalletSend && walletNetwork ? { receive_network: walletNetwork, chain: walletNetwork } : {}),
    ...(isWalletSend && walletAddress ? { destination_address: walletAddress } : {}),
    ...(payoutReview && !isEasetagSend
      ? { payout_review: payoutReview, review_snapshot: payoutReview }
      : {}),
    ...(providerTxId ? { provider_transaction_id: providerTxId } : {}),
  }

  const includeLifecycle =
    !isEasetagSend &&
    Boolean(payoutReview) &&
    (!isWalletSend || walletExecutionModel === 'relay_bridge')

  let lifecycle: ReturnType<typeof buildGlobalPayoutLifecycle> | undefined
  if (includeLifecycle && payoutReview) {
    metadata.processing_at = now
    lifecycle = buildGlobalPayoutLifecycle({
      status: transfer.status?.trim() || 'pending',
      metadata,
      createdAt: now,
      settledAt: null,
      payoutReview,
      recipientName,
    })
  }

  const displayCurrency = payoutReview
    ? isWalletSend
      ? walletSendUserFacingDisplayCurrency({
          receiveCurrency: payoutReview.receive_currency,
          sendCurrency: payoutReview.send_currency,
          executionModel: payoutReview.execution_model,
        })
      : payoutReview.receive_currency
    : undefined

  return {
    id: detailId,
    ledger_row_id: detailId,
    transaction_id: easnerTxId,
    noah_transaction_id: providerTxId,
    transaction_type: 'send',
    direction: 'debit',
    amount,
    currency,
    ledger_amount: isEasetagSend ? calculatedTotalAmount : amount,
    ledger_currency: selectedBalanceCurrency.toUpperCase(),
    status: transfer.status?.trim() || 'pending',
    created_at: now,
    noah_created_at: now,
    updated_at: now,
    ledger_created_at: now,
    name: recipientName,
    recipient_name: recipientName,
    recipient_id: recipient.id,
    ...(isEasetagSend ? { source_type: 'easetag_p2p' as const } : {}),
    ...(note ? { send_note: note, description: note } : {}),
    ...(payoutReview && !isEasetagSend ? { payout_review: payoutReview } : {}),
    ...(recipientSnapshot ? { recipient_snapshot: recipientSnapshot } : {}),
    ...(lifecycle?.length ? { lifecycle } : {}),
    ...(payoutReview && displayCurrency
      ? {
          display_amount: payoutReview.receive_amount,
          display_currency: displayCurrency,
          display_description: recipientName,
          display_hero_title: formatTransactionDetailHeroTitle({
            direction: 'out',
            counterpartyName: recipientName,
            productFallback: isWalletSend ? walletSendListProductLabel() : 'Transfer',
          }),
          ...(isWalletSend ? { transaction_product: walletSendListProductLabel() } : {}),
        }
      : {}),
    metadata,
  }
}
