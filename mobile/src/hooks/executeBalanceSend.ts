import * as Haptics from 'expo-haptics'
import type { QueryClient } from '@tanstack/react-query'
import type { Scope } from '@easner/shared'
import { getApiBaseUrl, getNoahScopeHeaders } from '../lib/apiClient'
import { supabase } from '../lib/supabase'
import { noahService, type NoahTransfer, type PricingQuote } from '../lib/noahService'
import type { Recipient, User } from '../types'
import { recipientService } from '../lib/recipientService'
import { isDraftEasenetRecipient } from '../lib/draftEasenetRecipient'
import { invalidateRecipientsFeed } from '../query/refresh-user-feeds'
import { recordRecipientSentTouch } from '../lib/recentSendRecipients'
import { resolveRecipientEasetagForUi } from '../lib/easenetRecipientUi'
import { isMobileMoneyRecipient } from '../lib/recipientPayoutPreview'

function inferCountryFromRecipientCurrency(currency: string): string | undefined {
  const m: Record<string, string> = {
    KES: 'KE',
    GHS: 'GH',
    NGN: 'NG',
    ZAR: 'ZA',
  }
  return m[currency.toUpperCase()]
}

function mobileMoneyPrepareHints(r: Pick<Recipient, 'mobile_provider'>): string[] | undefined {
  const p = (r.mobile_provider || '').toLowerCase()
  if (p.includes('mtn')) return ['mtn', 'momo']
  if (p.includes('mpesa') || p.includes('m-pesa')) return ['mpesa']
  return undefined
}

function repricingReasonLabel(reasonCode: string): string {
  const map: Record<string, string> = {
    fx_moved: 'FX market moved',
    provider_fee_changed: 'Provider fee changed',
    route_unavailable: 'Selected route became unavailable',
    compliance_status_changed: 'Compliance status changed',
    subscription_changed: 'Subscription changed',
    quote_expired: 'Quote expired',
  }
  return map[reasonCode] || reasonCode.replaceAll('_', ' ')
}

function fmtMoney(amount: number, currency: string): string {
  const sym =
    currency === 'USD'
      ? '$'
      : currency === 'EUR'
        ? '€'
        : currency === 'KES'
          ? 'KSh '
          : currency === 'GHS'
            ? '₵ '
            : ''
  return `${sym}${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function detailIdFromTransfer(transfer: NoahTransfer): string {
  const etid = transfer.easner_transaction_id?.trim()
  if (etid) return etid
  return String(transfer.transaction_id || transfer.id || '')
}

export type PayoutPrepareSession = {
  formSessionId: string
  cryptoAuthorizedAmount: string
  cryptoCurrency: string
}

export type ExecuteBalanceSendInput = {
  recipient: Recipient
  calculatedTotalAmount: number
  receiveAmountValue: number
  selectedBalanceCurrency: string
  pricingQuoteId?: string
  pricingQuoteExpiry?: string
  pricingQuoteResult?: PricingQuote | null
  /** When set, skip Noah prepare at execute (already done on confirm). */
  payoutSession?: PayoutPrepareSession
  /** Ledger Easetag P2P: same ETID as confirm review (`reserved_debit_etid`). */
  reservedDebitEtid?: string
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
    pricingQuoteId,
    pricingQuoteExpiry,
    pricingQuoteResult,
    payoutSession,
    reservedDebitEtid,
  } = input

  const easetag = resolveRecipientEasetagForUi(recipient).trim()

  const usdLike =
    String(recipient.currency || '').toUpperCase() === 'USD' &&
    String(recipient.country_code || '').toUpperCase() === 'US'
  const hasAch =
    Boolean(recipient.routing_number?.trim()) && Boolean(recipient.account_number?.trim())
  const eurSepa =
    String(recipient.currency || '').toUpperCase() === 'EUR' && Boolean(recipient.iban?.trim())
  const eurCountry = (recipient.country_code || 'DE').toUpperCase()
  const canUseFiatBalance = selectedBalanceCurrency === 'USD' || selectedBalanceCurrency === 'EUR'
  const mobileCorridorCountry = (
    recipient.country_code ||
    inferCountryFromRecipientCurrency(recipient.currency) ||
    ''
  ).toUpperCase()
  const isMobile =
    isMobileMoneyRecipient(recipient) && Boolean(mobileCorridorCountry) && canUseFiatBalance

  let transfer: NoahTransfer

  if (easetag) {
    transfer = await noahService.createWalletToWalletTransfer({
      destinationEasetag: easetag,
      amount: calculatedTotalAmount.toFixed(8),
      currency: selectedBalanceCurrency.toLowerCase(),
      ...(reservedDebitEtid?.trim() ? { reservedDebitEtid: reservedDebitEtid.trim() } : {}),
    })
  } else {
    const {
      data: { session: walletSession },
    } = await supabase.auth.getSession()
    const scopeHeaders = await getNoahScopeHeaders()
    const walletsResponse = await fetch(`${getApiBaseUrl()}/api/noah/wallets`, {
      headers: {
        Authorization: `Bearer ${walletSession?.access_token}`,
        ...scopeHeaders,
      },
    })

    if (!walletsResponse.ok) {
      throw new Error('Failed to fetch wallet. Please try again.')
    }

    const walletsData = await walletsResponse.json()
    const wallet = walletsData.wallets?.[0]

    if (!wallet) {
      throw new Error('No wallet found. Please set up your account first.')
    }

    const sourceWalletId = String(wallet.sourceWalletId || wallet.walletId || '')
    if (!sourceWalletId) {
      throw new Error('No source wallet id from Noah.')
    }

    if (recipient.noah_external_account_id?.trim()) {
      transfer = await noahService.createTransfer({
        amount: calculatedTotalAmount.toString(),
        currency: selectedBalanceCurrency.toLowerCase(),
        sourceWalletId,
        destinationExternalAccountId: recipient.noah_external_account_id.trim(),
      })
    } else if (isMobile) {
      const phone = (recipient.phone_number || recipient.account_number || '').replace(/\s/g, '')
      if (!phone) {
        throw new Error('Mobile money needs a phone number on the recipient.')
      }
      const fiatAmount = receiveAmountValue.toFixed(2)
      const session =
        payoutSession ??
        (await (async () => {
          const prep = await noahService.prepareMobileMoneyPayout({
            fiatAmount,
            countryCode: mobileCorridorCountry,
            currency: recipient.currency.toUpperCase(),
            fullName: recipient.full_name,
            phoneNumber: phone,
            paymentMethodSubstrings: mobileMoneyPrepareHints(recipient),
          })
          if (!prep.ok || !prep.formSessionId || !prep.cryptoAuthorizedAmount) {
            throw new Error(
              prep.error ||
                'Noah could not prepare this mobile payout. Confirm Identifier channels exist for this country and currency.',
            )
          }
          return {
            formSessionId: prep.formSessionId,
            cryptoAuthorizedAmount: prep.cryptoAuthorizedAmount,
            cryptoCurrency: prep.cryptoCurrency,
          }
        })())
      transfer = await noahService.createTransfer({
        amount: fiatAmount,
        currency: recipient.currency.toLowerCase(),
        sourceWalletId,
        formSessionId: session.formSessionId,
        cryptoAuthorizedAmount: session.cryptoAuthorizedAmount,
        cryptoCurrency: session.cryptoCurrency,
      })
    } else if (eurSepa && canUseFiatBalance) {
      const fiatAmount = receiveAmountValue.toFixed(2)
      const session =
        payoutSession ??
        (await (async () => {
          const prep = await noahService.prepareSellPayout({
            fiatAmount,
            fullName: recipient.full_name,
            countryCode: eurCountry,
            currency: 'EUR',
            iban: recipient.iban!.trim(),
            accountType: recipient.checking_or_savings === 'savings' ? 'Savings' : 'Checking',
          })
          if (!prep.ok || !prep.formSessionId || !prep.cryptoAuthorizedAmount) {
            throw new Error(prep.error || 'Noah could not prepare SEPA payout.')
          }
          return {
            formSessionId: prep.formSessionId,
            cryptoAuthorizedAmount: prep.cryptoAuthorizedAmount,
            cryptoCurrency: prep.cryptoCurrency,
          }
        })())
      transfer = await noahService.createTransfer({
        amount: fiatAmount,
        currency: 'eur',
        sourceWalletId,
        formSessionId: session.formSessionId,
        cryptoAuthorizedAmount: session.cryptoAuthorizedAmount,
        cryptoCurrency: session.cryptoCurrency,
      })
    } else if (usdLike && hasAch && canUseFiatBalance) {
      if (
        !recipient.address_line1?.trim() ||
        !recipient.city?.trim() ||
        !recipient.state?.trim() ||
        !recipient.postal_code?.trim()
      ) {
        throw new Error('US bank payouts need street, city, state, and postal code on the recipient.')
      }
      const fiatAmount = receiveAmountValue.toFixed(2)
      const session =
        payoutSession ??
        (await (async () => {
          const prep = await noahService.prepareSellPayout({
            fiatAmount,
            fullName: recipient.full_name,
            countryCode: 'US',
            currency: 'USD',
            accountNumber: recipient.account_number.trim(),
            routingNumber: recipient.routing_number!.trim(),
            addressLine1: recipient.address_line1.trim(),
            city: recipient.city.trim(),
            state: recipient.state.trim(),
            postalCode: recipient.postal_code.trim(),
            accountType: recipient.checking_or_savings === 'savings' ? 'Savings' : 'Checking',
            transferType: recipient.transfer_type === 'Wire' ? 'Wire' : 'ACH',
          })
          if (!prep.ok || !prep.formSessionId || !prep.cryptoAuthorizedAmount) {
            throw new Error(prep.error || 'Noah could not prepare this payout. Check recipient details.')
          }
          return {
            formSessionId: prep.formSessionId,
            cryptoAuthorizedAmount: prep.cryptoAuthorizedAmount,
            cryptoCurrency: prep.cryptoCurrency,
          }
        })())
      transfer = await noahService.createTransfer({
        amount: fiatAmount,
        currency: 'usd',
        sourceWalletId,
        formSessionId: session.formSessionId,
        cryptoAuthorizedAmount: session.cryptoAuthorizedAmount,
        cryptoCurrency: session.cryptoCurrency,
      })
    } else {
      throw new Error(
        'Noah balance send needs: Easetag, saved payout id, mobile money with country, EUR IBAN, or US ACH with full address.',
      )
    }
  }

  if (pricingQuoteId) {
    const validation = await noahService.validatePricingQuote(pricingQuoteId)
    await noahService.applyPricingQuote(pricingQuoteId, transfer.transaction_id || transfer.id)
    const pt = pricingQuoteResult?.pricingTotals
    const summaryLines =
      pt != null && pricingQuoteResult
        ? [
            `Recipient gets: ${fmtMoney(pt.total_recipient_amount, recipient.currency)}`,
            `Rate: 1 ${selectedBalanceCurrency} = ${Number(pricingQuoteResult.effectiveRate).toFixed(6)} ${recipient.currency}`,
            `Total fees: ${fmtMoney(pt.total_user_fee, selectedBalanceCurrency)}`,
          ].join('\n')
        : ''
    if (validation.reasonCode) {
      ctx.showInfo(
        summaryLines
          ? `Pricing was revalidated (${repricingReasonLabel(validation.reasonCode)}).\n\n${summaryLines}`
          : `Pricing was revalidated: ${repricingReasonLabel(validation.reasonCode)}`,
        5500,
      )
    } else if (pricingQuoteExpiry) {
      ctx.showInfo(
        summaryLines
          ? `Quote locked. Expires ${new Date(pricingQuoteExpiry).toLocaleTimeString()}.\n\n${summaryLines}`
          : `Quote locked. Expires ${new Date(pricingQuoteExpiry).toLocaleTimeString()}.`,
        5500,
      )
    } else if (summaryLines) {
      ctx.showInfo(summaryLines, 5000)
    }
  }

  const providerTxRef = transfer.transaction_id || transfer.id
  if (selectedBalanceCurrency === 'USD' || selectedBalanceCurrency === 'EUR') {
    ctx.updateBalanceOptimistically(
      selectedBalanceCurrency as 'USD' | 'EUR',
      calculatedTotalAmount,
      'subtract',
      providerTxRef,
    )
  }

  await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)

  let recipientForDetails: Recipient = recipient
  if (
    ctx.userId &&
    recipient?.id &&
    easetag &&
    isDraftEasenetRecipient(recipient.id) &&
    ctx.userProfile?.id
  ) {
    try {
      const tag = recipient.payee_easetag!.trim()
      const created = await recipientService.create(ctx.userProfile.id, {
        fullName: recipient.full_name,
        accountNumber: tag,
        bankName: `Easetag (@${tag})`,
        currency: 'USD',
        countryCode: 'US',
        payeeEasetag: tag,
        payeeAvatarUrl: recipient.payee_avatar_url ?? null,
        payeeAccountKind: recipient.payee_account_kind,
      })
      if (ctx.scope && ctx.userId) await invalidateRecipientsFeed(ctx.qc, ctx.scope, ctx.userId)
      recipientForDetails = created
      void recordRecipientSentTouch(ctx.userId, created.id)
    } catch (persistErr) {
      console.warn('Post-send Easetag recipient save failed:', persistErr)
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
