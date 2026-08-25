import type { QueryClient } from '@tanstack/react-query'
import { qk, scopeKey, type Scope, isDraftRecipientId } from '@easner/shared'
import { noahService, type NoahTransfer } from '../lib/noahService'
import type { Recipient, User } from '../types'
import { recipientService, type RecipientData } from '../lib/recipientService'
import { invalidateRecipientsFeed } from '../query/refresh-user-feeds'
import { recordRecipientSentTouch } from '../lib/recentSendRecipients'
import { resolveRecipientEasetagForUi } from '../lib/easenetRecipientUi'
import type { MobileTransactionRow } from './queries/use-transactions'

type InfinitePages = {
  pages: Array<{ transactions: MobileTransactionRow[]; nextCursor: string | null }>
  pageParams: unknown[]
}

/**
 * Insert a pending transaction row into every cached transactions list so the
 * dashboard / feed reflect the user's intent immediately. Returns a rollback
 * fn that restores the prior cache state if the network call fails.
 */
function insertOptimisticTransaction(
  qc: QueryClient,
  scope: Scope | undefined,
  row: MobileTransactionRow,
): () => void {
  if (!scope) return () => {}
  const entries = qc.getQueriesData<InfinitePages>({
    queryKey: [...scopeKey(scope), 'transactions', 'list'],
    exact: false,
  })
  const snapshots = entries.map(([key, data]) => [key, data] as const)
  for (const [key, data] of entries) {
    if (!data?.pages?.length) continue
    const [first, ...rest] = data.pages
    qc.setQueryData<InfinitePages>(key, {
      ...data,
      pages: [
        { ...first, transactions: [row, ...first.transactions] },
        ...rest,
      ],
    })
  }
  return () => {
    for (const [key, data] of snapshots) {
      qc.setQueryData(key, data)
    }
  }
}

function inferCountryFromRecipientCurrency(currency: string): string | undefined {
  const m: Record<string, string> = {
    KES: 'KE',
    GHS: 'GH',
    NGN: 'NG',
    ZAR: 'ZA',
    CAD: 'CA',
    GBP: 'GB',
  }
  return m[currency.toUpperCase()]
}

export function detailIdFromTransfer(transfer: NoahTransfer): string {
  const etid = transfer.easner_transaction_id?.trim()
  if (etid) return etid
  return String(transfer.transaction_id || transfer.id || '')
}

import type { PayoutPrepareSession } from '../lib/payoutPrepareSession'
import type { WalletPrepareSession } from '../lib/sendFlowWalletQuote'
import { haptics } from '../lib/haptics'

export type { PayoutPrepareSession } from '../lib/payoutPrepareSession'

export type ExecuteBalanceSendInput = {
  recipient: Recipient
  calculatedTotalAmount: number
  receiveAmountValue: number
  selectedBalanceCurrency: string
  /** Required for fiat Global Payout – from confirm screen quote (`/api/noah/payouts/quote`). */
  payoutSession?: PayoutPrepareSession
  /** Required for wallet send – from confirm screen quote (`/api/wallets/send/quote`). */
  walletSession?: WalletPrepareSession
  /** Persisted on transfer metadata for transaction detail / notifications. */
  reviewSnapshot?: Record<string, unknown>
  /** Ledger Easetag P2P: same ETID as confirm review (`reserved_debit_etid`). */
  reservedDebitEtid?: string
  note?: string
  paymentPurpose?: string
  /** Persist draft recipients after successful send (easetag and other rails). */
  draftRecipientPersist?: RecipientData
}

export type ExecuteBalanceSendContext = {
  userId: string | undefined
  userProfile: User | null | undefined
  scope: Scope | undefined
  qc: QueryClient
  updateBalanceOptimistically: (
    currency: 'USD' | 'EUR',
    amount: number,
    op: 'subtract',
    txRef?: string,
  ) => void
  showError: (msg: string) => void
  showInfo: (msg: string, duration?: number) => void
}

export type ExecuteBalanceSendResult = {
  detailId: string
  transfer: NoahTransfer
  recipientForDetails: Recipient
}

export async function executeBalanceSend(
  input: ExecuteBalanceSendInput,
  ctx: ExecuteBalanceSendContext,
): Promise<ExecuteBalanceSendResult> {
  const {
    recipient,
    calculatedTotalAmount,
    receiveAmountValue,
    selectedBalanceCurrency,
    payoutSession,
    reservedDebitEtid,
    note,
  } = input

  const easetag = resolveRecipientEasetagForUi(recipient).trim()
  const isWalletSend = Boolean(recipient.wallet_network?.trim())
  const canUseFiatBalance = selectedBalanceCurrency === 'USD' || selectedBalanceCurrency === 'EUR'

  const optimisticId = `optimistic_${Date.now()}`
  const rollbackOptimistic = insertOptimisticTransaction(ctx.qc, ctx.scope, {
    id: optimisticId,
    transaction_id: optimisticId,
    transaction_type: 'send',
    amount: String(receiveAmountValue || calculatedTotalAmount),
    currency: (recipient.currency || selectedBalanceCurrency || '').toLowerCase(),
    status: 'pending',
    created_at: new Date().toISOString(),
    noah_created_at: new Date().toISOString(),
    direction: 'debit',
    name: recipient.full_name || 'Transfer',
    description: note?.trim() || null,
  })

  let transfer: NoahTransfer

  try {
  if (isWalletSend) {
    if (!input.walletSession?.formSessionId?.trim()) {
      throw new Error(
        'Wallet send quote is required. Return to review and wait for the quote to load before confirming.',
      )
    }
    transfer = await noahService.executeWalletSend({
      recipientId: recipient.id,
      formSessionId: input.walletSession.formSessionId,
      ...(input.reservedDebitEtid?.trim() ? { reservedDebitEtid: input.reservedDebitEtid.trim() } : {}),
      ...(input.reviewSnapshot ? { reviewSnapshot: input.reviewSnapshot } : {}),
    })
  } else if (easetag) {
    transfer = await noahService.createWalletToWalletTransfer({
      destinationEasetag: easetag,
      amount: calculatedTotalAmount.toFixed(8),
      currency: selectedBalanceCurrency.toLowerCase(),
      ...(reservedDebitEtid?.trim() ? { reservedDebitEtid: reservedDebitEtid.trim() } : {}),
      ...(note?.trim() ? { note: note.trim() } : {}),
    })
  } else {
    if (!canUseFiatBalance) {
      throw new Error('Balance send supports USD or EUR funding only.')
    } else {
      if (
        !payoutSession?.formSessionId?.trim() ||
        !payoutSession.cryptoAuthorizedAmount?.trim() ||
        !payoutSession.cryptoCurrency?.trim()
      ) {
        throw new Error(
          'Payout quote is required. Return to review and wait for the quote to load before confirming.',
        )
      }

      const countryCode = (
        recipient.country_code ||
        inferCountryFromRecipientCurrency(recipient.currency) ||
        ''
      ).toUpperCase()
      if (!countryCode) {
        throw new Error('Recipient country is required for this payout.')
      }

      transfer = await noahService.createTransfer({
        amount: receiveAmountValue.toFixed(2),
        currency: recipient.currency.toLowerCase(),
        formSessionId: payoutSession.formSessionId,
        cryptoAuthorizedAmount: payoutSession.cryptoAuthorizedAmount,
        cryptoCurrency: payoutSession.cryptoCurrency,
        countryCode,
        ...(payoutSession.channelId ? { channelId: payoutSession.channelId } : {}),
        recipientId: recipient.id,
        ...(input.reviewSnapshot ? { reviewSnapshot: input.reviewSnapshot } : {}),
        ...(payoutSession.noahFloor ? { noahFloor: payoutSession.noahFloor } : {}),
        ...(payoutSession.noahSendAmount ? { noahSendAmount: payoutSession.noahSendAmount } : {}),
        ...(payoutSession.totalDebited ? { totalDebited: payoutSession.totalDebited } : {}),
        ...(payoutSession.marginAmount ? { marginAmount: payoutSession.marginAmount } : {}),
        ...(payoutSession.marginCaptureMode
          ? { marginCaptureMode: payoutSession.marginCaptureMode }
          : {}),
        ...(payoutSession.customerRate != null ? { customerRate: payoutSession.customerRate } : {}),
        ...(payoutSession.noahMid != null ? { noahMid: payoutSession.noahMid } : {}),
        ...(payoutSession.payoutProvider ? { payoutProvider: payoutSession.payoutProvider } : {}),
        ...(payoutSession.ycSequenceId ? { ycSequenceId: payoutSession.ycSequenceId } : {}),
        ...(payoutSession.ycSendId ? { ycSendId: payoutSession.ycSendId } : {}),
        ...(payoutSession.ycWalletAddress ? { ycWalletAddress: payoutSession.ycWalletAddress } : {}),
        ...(payoutSession.ycCryptoAmount != null ? { ycCryptoAmount: payoutSession.ycCryptoAmount } : {}),
        ...(payoutSession.gridQuoteId ? { gridQuoteId: payoutSession.gridQuoteId } : {}),
        ...(payoutSession.gridSequenceId ? { gridSequenceId: payoutSession.gridSequenceId } : {}),
        ...(payoutSession.gridCustomerId ? { gridCustomerId: payoutSession.gridCustomerId } : {}),
        ...(payoutSession.gridExternalAccountId ? { gridExternalAccountId: payoutSession.gridExternalAccountId } : {}),
        ...(payoutSession.gridCryptoAmount != null ? { gridCryptoAmount: payoutSession.gridCryptoAmount } : {}),
        ...(payoutSession.gridFundingAddress ? { gridFundingAddress: payoutSession.gridFundingAddress } : {}),
        ...(payoutSession.lockId ? { lockId: payoutSession.lockId } : {}),
        ...(reservedDebitEtid?.trim() ? { reservedDebitEtid: reservedDebitEtid.trim() } : {}),
        ...(note?.trim() ? { note: note.trim() } : {}),
        ...(input.paymentPurpose?.trim() ? { paymentPurpose: input.paymentPurpose.trim() } : {}),
      })
    }
  }
  } catch (e) {
    rollbackOptimistic()
    throw e
  }

  // Replace the optimistic row with authoritative data from the server.
  if (ctx.scope) {
    void ctx.qc.invalidateQueries({ queryKey: qk.transactions.root(ctx.scope), refetchType: 'active' })
  }

  const providerTxRef = transfer.transaction_id || transfer.id
  const isGlobalFiatPayout = Boolean(payoutSession?.formSessionId?.trim())
  if (
    !isGlobalFiatPayout &&
    (isWalletSend || (selectedBalanceCurrency === 'USD' || selectedBalanceCurrency === 'EUR'))
  ) {
    ctx.updateBalanceOptimistically(
      selectedBalanceCurrency as 'USD' | 'EUR',
      calculatedTotalAmount,
      'subtract',
      providerTxRef,
    )
  }

  haptics.success()

  const recipientForDetails: Recipient = recipient
  if (
    ctx.userId &&
    recipient?.id &&
    isDraftRecipientId(recipient.id) &&
    ctx.userProfile?.id
  ) {
    // Fire-and-forget: the transfer already succeeded – don't hold the result
    // (and the success navigation) on recipient bookkeeping.
    const userId = ctx.userId
    const userProfileId = ctx.userProfile.id
    const tag = easetag
    const persist =
      input.draftRecipientPersist ??
      (tag
        ? {
            fullName: recipient.full_name,
            accountNumber: tag,
            bankName: `Easetag (@${tag})`,
            currency: 'USD',
            countryCode: 'US',
            payeeAvatarUrl: recipient.payee_avatar_url,
            payeeAccountKind: recipient.payee_account_kind,
          }
        : undefined)
    if (persist) {
      void (async () => {
        try {
          const created = await recipientService.findOrCreate(userProfileId, persist)
          if (ctx.scope) await invalidateRecipientsFeed(ctx.qc, ctx.scope, userId)
          void recordRecipientSentTouch(userId, created.id)
        } catch (persistErr) {
          console.warn('Post-send draft recipient save failed:', persistErr)
        }
      })()
    }
  } else if (ctx.userId && recipient?.id) {
    void recordRecipientSentTouch(ctx.userId, recipient.id)
  }

  const detailId = detailIdFromTransfer(transfer)
  if (!detailId) {
    throw new Error('Transfer succeeded but no transaction reference was returned.')
  }

  return { detailId, transfer, recipientForDetails }
}
