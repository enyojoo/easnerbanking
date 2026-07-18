// Noah — mobile API client (calls Easner backend under /api/noah/*).
// Noah REST API: https://docs.noah.com/

import * as FileSystem from 'expo-file-system/legacy'
import type { Session } from '@supabase/supabase-js'
import { getApiBaseUrl, getNoahScopeHeaders } from './apiClient'
import { getSessionReliable } from './authSession'

async function requireAuthSession(): Promise<Session> {
  const session = await getSessionReliable()
  if (!session?.access_token) throw new Error('Not authenticated')
  return session
}

/** Next.js business app — same origin as {@link getApiBaseUrl}. */
function apiUrl(): string {
  return getApiBaseUrl()
}

/** Legacy execute field — Noah CustomerID (`eind_` + compact user uuid). Server resolves this today; kept for older API builds. */
function noahSourceWalletIdFromSession(session: Session): string {
  return `eind_${session.user.id.replace(/-/g, '')}`
}

/** One sync at a time (consumer hook + Account Verification + intervals share this client). */
let syncStatusQueueTail: Promise<unknown> = Promise.resolve()

/** Result of POST `/api/noah/sync-status` (mobile parses JSON; see business `app/api/noah/sync-status/route.ts`). */
export type NoahSyncStatusResult = {
  success: boolean
  synced: boolean
  /** Set when backend returns 404 `NOAH_CUSTOMER_NOT_FOUND` (no customer in this Noah env yet). */
  code?: 'NOAH_CUSTOMER_NOT_FOUND'
  /** Easner tried these CustomerID strings against Noah (debug env / ID mismatch). */
  triedCustomerIds?: string[]
  data?: { kycStatus: string; rejectionReasons?: any[] }
}

interface NoahCustomer {
  customerId: string
  kycStatus: string
  walletId?: string
  usdVirtualAccountId?: string
  eurVirtualAccountId?: string
  rejectionReasons?: any[]
}

interface NoahVirtualAccount {
  hasAccount: boolean
  currency?: string
  accountNumber?: string
  routingNumber?: string
  iban?: string
  bic?: string
  bankName?: string
  accountHolderName?: string
  bankAddress?: string
  bankBeneficiaryAddress?: string
  status?: string
}

export interface NoahWalletBalances {
  USD: string
  EUR: string
  /** Present when business `GET /api/wallets/on-chain-balances` includes Turnkey metadata */
  source?: "turnkey" | "none"
  /** Server diagnostic, e.g. `turnkey_balance_query_failed:...` */
  detail?: string
  /** CAIP-2 value the server used for Turnkey — must match the network where USDC/EURC were sent */
  balanceCaip2?: string
}

export interface NoahTransfer {
  id: string
  amount: string
  currency: string
  status: string
  /** Present when the backend returns a ledger/transaction id alongside the transfer id */
  transaction_id?: string
  /** Canonical Easner transaction id when the ledger row includes ETID */
  easner_transaction_id?: string
}

export interface PricingQuoteTotals {
  total_provider_cost: number
  total_easner_fee: number
  total_user_fee: number
  total_recipient_amount: number
  reporting_currency: string
}

export interface PayoutQuote {
  receiveAmount: number
  receiveCurrency: string
  customerPrincipal: number
  sendAmount: number
  sendCurrency: string
  totalDebited: number
  channelCost: number
  marginAmount: number
  /** Explicit Easner 1% processing fee leg (uncapped). */
  processingFee?: number
  /** Channel component shown in the combined Processing fee row (foots with total). */
  displayChannelCost?: number
  /** Easner 1% + channel/YC component (USD). */
  displayProcessingFee?: number
  /** Explicit YC send leg fees when provider is Yellowcard. */
  ycLegFeesUsd?: number
  channelId?: string
  provider?: 'noah' | 'yellowcard'
  settlement?: {
    totalFee: number
    feeCurrency: string
    cryptoAuthorizedAmount: string
    cryptoFloor: string
    cryptoSendAmount: string
    cryptoCurrency: string
    sessionId: string
    customerRate?: number
    providerMid?: number
    effectiveRate?: number
    marginCaptureMode?: 'surplus_send' | 'split_debit'
    channelCost?: number
    marginAmount?: number
    customerPrincipal?: number
  }
  yc?: {
    sequenceId: string
    sendId?: string
    channelId: string
    cryptoAmount: number
    walletAddress?: string
  }
  /** @deprecated Prefer `settlement`. Legacy Noah field names. */
  noah: {
    totalFee: number
    cryptoAuthorizedAmount: string
    noahFloor: string
    noahSendAmount: string
    cryptoCurrency: string
    formSessionId: string
    rate?: number
    noahMid?: number
    marginCaptureMode?: 'surplus_send' | 'split_debit'
    channelCost?: number
    marginAmount?: number
    customerPrincipal?: number
  }
  easner: PricingQuote
  pricingQuoteId: string
  expiresAt: string
}

export interface WalletSendQuote {
  receiveAmount: number
  receiveCurrency: string
  receiveNetwork: string
  sendAmount: number
  sendCurrency: string
  totalDebited: number
  marginAmount: number
  channelCost: number
  /** Explicit Easner 1% processing fee leg (uncapped). */
  processingFee?: number
  /** Channel/route component shown in the combined Processing fee row (foots with total). */
  displayChannelCost?: number
  networkFee: number
  rate: number
  customerRate: number
  lifiMid: number
  expiresAt: string
  formSessionId: string
  pricingQuoteId: string
  executionModel: 'direct_turnkey' | 'lifi_bridge'
  wallet: {
    cryptoAuthorizedAmount: string
    lifiFloor: string
    tokenIconUrl?: string
    networkIconUrl?: string
  }
}

export interface PricingQuote {
  quoteId: string
  expiresAt: string
  providerRate: number
  effectiveRate: number
  destinationAmount: number
  fxMarkupBps: number
  payinFeeAmount: number
  payoutFeeAmount: number
  totalFeeAmount: number
  sourceAmount: number
  sourceCurrency: string
  destinationCurrency: string
  providerCosts?: unknown
  totalProviderCostReporting?: number | null
  pricingTotals?: PricingQuoteTotals | null
}

interface NoahKycLink {
  kyc_link: string | null
  kyc_status?: string
  customer_id?: string
  kyc_link_id?: string
  alreadyOnboarded?: boolean
  hostedIncludesTerms?: boolean
}

export const noahService = {
  async createPayoutQuote(input: {
    recipientId: string
    receiveAmount: number
    sourceBalanceCurrency: string
    amountEntryMode?: 'send' | 'receive'
    sendAmount?: number
    note?: string
    paymentPurpose?: string
    email?: string
    branchCode?: string
  }): Promise<PayoutQuote> {
    const session = await requireAuthSession()
    const scopeHeaders = await getNoahScopeHeaders()
    const response = await fetch(`${apiUrl()}/api/payouts/quote`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
        ...scopeHeaders,
      },
      body: JSON.stringify({
        recipientId: input.recipientId,
        receiveAmount: input.receiveAmount,
        sourceBalanceCurrency: input.sourceBalanceCurrency,
        amountEntryMode: input.amountEntryMode ?? 'receive',
        ...(input.amountEntryMode === 'send' &&
        input.sendAmount != null &&
        input.sendAmount > 0
          ? { sendAmount: input.sendAmount }
          : {}),
        ...(input.note ? { note: input.note } : {}),
        ...(input.paymentPurpose ? { paymentPurpose: input.paymentPurpose } : {}),
        ...(input.email ? { email: input.email } : {}),
        ...(input.branchCode ? { branchCode: input.branchCode } : {}),
      }),
    })
    const data = await response.json().catch(() => ({}))
    if (!response.ok || !(data as { ok?: boolean }).ok) {
      throw new Error((data as { error?: string }).error || 'Failed to create payout quote')
    }
    return (data as { quote: PayoutQuote }).quote
  },

  async createWalletSendQuote(input: {
    recipientId: string
    sourceBalanceCurrency: string
    amountEntryMode?: 'send' | 'receive'
    receiveAmount?: number
    sendAmount?: number
  }): Promise<WalletSendQuote> {
    const session = await requireAuthSession()
    const scopeHeaders = await getNoahScopeHeaders()
    const response = await fetch(`${apiUrl()}/api/wallets/send/quote`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
        ...scopeHeaders,
      },
      body: JSON.stringify({
        recipientId: input.recipientId,
        sourceBalanceCurrency: input.sourceBalanceCurrency,
        amountEntryMode: input.amountEntryMode ?? 'receive',
        ...(input.receiveAmount != null ? { receiveAmount: input.receiveAmount } : {}),
        ...(input.amountEntryMode === 'send' && input.sendAmount != null && input.sendAmount > 0
          ? { sendAmount: input.sendAmount }
          : {}),
      }),
    })
    const data = await response.json().catch(() => ({}))
    if (!response.ok || !(data as { ok?: boolean }).ok) {
      throw new Error((data as { error?: string }).error || 'Failed to create wallet send quote')
    }
    return (data as { quote: WalletSendQuote }).quote
  },

  async executeWalletSend(input: {
    recipientId: string
    formSessionId: string
    reservedDebitEtid?: string
    reviewSnapshot?: Record<string, unknown>
  }): Promise<NoahTransfer> {
    const session = await requireAuthSession()
    const scopeHeaders = await getNoahScopeHeaders()
    const response = await fetch(`${apiUrl()}/api/wallets/send/execute`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
        ...scopeHeaders,
      },
      body: JSON.stringify(input),
    })
    const data = await response.json().catch(() => ({}))
    if (!response.ok || !(data as { ok?: boolean }).ok) {
      throw new Error((data as { error?: string }).error || 'Wallet send failed')
    }
    return {
      id: String((data as { provider_transaction_id?: string }).provider_transaction_id || ''),
      amount: '',
      currency: '',
      status: String((data as { status?: string }).status || 'pending'),
      transaction_id: String((data as { transaction_id?: string }).transaction_id || ''),
      easner_transaction_id: String((data as { easner_transaction_id?: string }).easner_transaction_id || ''),
    }
  },

  async getCryptoExchangeRates(input?: {
    destinations?: string
    networks?: string
  }): Promise<{ source: string; rates: Array<{
    from_currency: string
    to_currency: string
    receive_network: string
    rate: number
    lifi_mid: number
    as_of: string
  }> }> {
    const session = await requireAuthSession()
    const scopeHeaders = await getNoahScopeHeaders()
    const qs = new URLSearchParams()
    if (input?.destinations) qs.set('destinations', input.destinations)
    if (input?.networks) qs.set('networks', input.networks)
    const suffix = qs.toString() ? `?${qs.toString()}` : ''
    const response = await fetch(`${apiUrl()}/api/fx/crypto-rates${suffix}`, {
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        ...scopeHeaders,
      },
    })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) {
      throw new Error((data as { error?: string }).error || 'Failed to load crypto rates')
    }
    return data as { source: string; rates: Array<{
      from_currency: string
      to_currency: string
      receive_network: string
      rate: number
      lifi_mid: number
      as_of: string
    }> }
  },

  async inferWalletAddress(address: string): Promise<{
    candidates: Array<{ asset: string; network: string; confidence: string; reason: string }>
    best: { asset: string; network: string } | null
  }> {
    const session = await requireAuthSession()
    const scopeHeaders = await getNoahScopeHeaders()
    const response = await fetch(`${apiUrl()}/api/wallets/send/infer-address`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
        ...scopeHeaders,
      },
      body: JSON.stringify({ address }),
    })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) {
      throw new Error((data as { error?: string }).error || 'Inference failed')
    }
    return data as {
      candidates: Array<{ asset: string; network: string; confidence: string; reason: string }>
      best: { asset: string; network: string } | null
    }
  },

  /**
   * Fetch customer by id (hosted customer object from provider API)
   */
  async getCustomer(customerId: string): Promise<Record<string, unknown>> {
    const session = await requireAuthSession()

    const response = await fetch(`${apiUrl()}/api/noah/customers/${customerId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
      },
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({}))
      throw new Error((error as any).error || 'Failed to get customer')
    }

    return await response.json()
  },

  /**
   * Noah hosted onboarding (identity + partner terms in one session).
   */
  async getKycLink(
    full_name: string,
    email: string,
    type: 'individual' | 'business' = 'individual',
    options?: { residenceCountry?: string },
  ): Promise<NoahKycLink> {
    const session = await requireAuthSession()

    const body: Record<string, string> = { full_name, email, type }
    const residence = options?.residenceCountry?.trim().toUpperCase()
    if (residence) body.residenceCountry = residence

    const response = await fetch(`${apiUrl()}/api/noah/kyc-links`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
        'X-Easner-Noah-Scope': 'individual',
      },
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.error || 'Failed to create KYC link')
    }

    return await response.json()
  },

  /**
   * Create Noah customer with KYC data
   * @deprecated Use createCustomerWithKyc instead - it reads KYC data from database
   */
  async createCustomer(customerData: any): Promise<NoahCustomer> {
    const session = await requireAuthSession()

    const response = await fetch(`${apiUrl()}/api/noah/customers`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
      },
      body: JSON.stringify(customerData),
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.error || 'Failed to create customer')
    }

    return await response.json()
  },

  /**
   * Create Noah customer using KYC data from database
   * This is the preferred method - it reads KYC submissions from the database
   * instead of requiring the full payload to be sent from mobile
   */
  async createCustomerWithKyc(data: {
    signedAgreementId: string
    needsUSD?: boolean
    needsEUR?: boolean
  }): Promise<NoahCustomer> {
    const session = await requireAuthSession()

    const response = await fetch(`${apiUrl()}/api/noah/customers`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        signedAgreementId: data.signedAgreementId,
        needsUSD: data.needsUSD ?? true,
        needsEUR: data.needsEUR ?? false,
      }),
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.error || 'Failed to create customer')
    }

    return await response.json()
  },

  /**
   * Get customer status
   */
  async getCustomerStatus(): Promise<NoahCustomer | null> {
    const session = await requireAuthSession()

    // Add timeout to fetch
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 8000)

    try {
    const response = await fetch(`${apiUrl()}/api/noah/customers`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
      },
        signal: controller.signal,
    })
      clearTimeout(timeoutId)

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.error || 'Failed to get customer status')
    }

    const data = await response.json()
    if (!data.hasCustomer) return null

    return {
      customerId: data.customerId,
      kycStatus: data.kycStatus,
      rejectionReasons: data.rejectionReasons,
      }
    } catch (error: any) {
      clearTimeout(timeoutId)
      if (error.name === 'AbortError') {
        throw new Error('Request timed out')
      }
      throw error
    }
  },

  /**
   * Sync Noah customer status to database
   * Fetches latest data from Noah and updates user / org record (same POST as business web).
   */
  async syncStatus(options?: {
    /** `individual` = personal KYC; `business` = org KYB (requires business role + org on server). */
    scope?: 'individual' | 'business'
  }): Promise<NoahSyncStatusResult> {
    const run = async (): Promise<NoahSyncStatusResult> => {
      const session = await requireAuthSession()

      const scope = options?.scope ?? 'individual'

      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 10000)

      try {
        const response = await fetch(`${apiUrl()}/api/noah/sync-status`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
            'X-Easner-Noah-Scope': scope,
          },
          signal: controller.signal,
        })
        clearTimeout(timeoutId)

        if (!response.ok) {
          const errText = await response.text()
          let errBody: {
            error?: string
            code?: string
            triedCustomerIds?: string[]
          } = {}
          try {
            errBody = errText
              ? (JSON.parse(errText) as {
                  error?: string
                  code?: string
                  triedCustomerIds?: string[]
                })
              : {}
          } catch {
            errBody = {}
          }
          if (response.status === 404 && errBody.code === 'NOAH_CUSTOMER_NOT_FOUND') {
            return {
              success: false,
              synced: false,
              code: 'NOAH_CUSTOMER_NOT_FOUND',
              triedCustomerIds: Array.isArray(errBody.triedCustomerIds)
                ? errBody.triedCustomerIds
                : undefined,
            }
          }
          throw new Error(errBody.error || 'Failed to sync status')
        }

        const data = (await response.json()) as {
          success?: boolean
          kycStatus?: string
          rejectionReasons?: unknown[]
          needsFiatAccounts?: boolean
          provisioned?: {
            usdAccountCreated?: boolean
            eurAccountCreated?: boolean
          }
          hint?: string
          [key: string]: unknown
        }
        const success =
          data.success === true ||
          (typeof data.kycStatus === 'string' && data.kycStatus.length > 0)
        return {
          success,
          synced: success,
          data:
            success && typeof data.kycStatus === 'string'
              ? {
                  kycStatus: data.kycStatus,
                  rejectionReasons: data.rejectionReasons as any[] | undefined,
                  needsFiatAccounts: data.needsFiatAccounts,
                  provisioned: data.provisioned,
                  hint: typeof data.hint === 'string' ? data.hint : undefined,
                }
              : undefined,
        }
      } catch (error: any) {
        clearTimeout(timeoutId)
        if (error.name === 'AbortError') {
          throw new Error('Sync request timed out')
        }
        throw error
      }
    }

    const p = syncStatusQueueTail.then(() => run())
    syncStatusQueueTail = p.then(
      () => undefined,
      () => undefined,
    )
    return p
  },

  /**
   * Pull latest Noah customer (Individual scope) and upsert into Supabase — same route business uses after hosted KYB/KYC.
   */
  async syncKyc(): Promise<{ success: boolean; noahScope?: string }> {
    const session = await requireAuthSession()

    const response = await fetch(`${apiUrl()}/api/noah/sync-kyc`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
        'X-Easner-Noah-Scope': 'individual',
      },
    })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) {
      throw new Error((data as { error?: string }).error || 'Failed to sync KYC')
    }
    return data as { success: boolean; noahScope?: string }
  },

  /**
   * Get customer KYC status (polling)
   */
  async getCustomerKYCStatus(customerId: string): Promise<{ kycStatus: string }> {
    const session = await requireAuthSession()

    const response = await fetch(`${apiUrl()}/api/noah/customers/${customerId}/status`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
      },
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.error || 'Failed to get KYC status')
    }

    return await response.json()
  },

  /**
   * Get virtual account details
   */
  async getVirtualAccount(currency: 'usd' | 'eur' | 'gbp'): Promise<NoahVirtualAccount> {
    const session = await requireAuthSession()

    // Add timeout to fetch
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 8000)

    try {
    const response = await fetch(`${apiUrl()}/api/noah/virtual-accounts?currency=${currency}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
      },
        signal: controller.signal,
    })
      clearTimeout(timeoutId)

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.error || 'Failed to get virtual account')
    }

    return await response.json()
    } catch (error: any) {
      clearTimeout(timeoutId)
      if (error.name === 'AbortError') {
        throw new Error('Request timed out')
      }
      throw error
    }
  },

  /**
   * Get liquidation address for receiving crypto deposits
   */
  async getLiquidationAddress(currency: 'usdc' | 'eurc', chain: 'solana' = 'solana'): Promise<{
    hasAddress: boolean
    currency?: string
    chain?: string
    address?: string
    memo?: string
    liquidationAddressId?: string
  }> {
    const session = await requireAuthSession()

    // Add timeout to fetch
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 8000)

    try {
      const response = await fetch(`${apiUrl()}/api/noah/liquidation-addresses?currency=${currency}&chain=${chain}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
        },
        signal: controller.signal,
      })
      clearTimeout(timeoutId)

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to get liquidation address')
      }

      return await response.json()
    } catch (error: any) {
      clearTimeout(timeoutId)
      if (error.name === 'AbortError') {
        throw new Error('Request timed out')
      }
      throw error
    }
  },

  /**
   * Create liquidation address for receiving crypto deposits
   */
  async createLiquidationAddress(currency: 'usdc' | 'eurc', chain: 'solana' = 'solana'): Promise<{
    hasAddress: boolean
    currency?: string
    chain?: string
    address?: string
    memo?: string
    liquidationAddressId?: string
  }> {
    const session = await requireAuthSession()

    // Add timeout to fetch
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 8000)

    try {
      const response = await fetch(`${apiUrl()}/api/noah/liquidation-addresses`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ currency, chain }),
        signal: controller.signal,
      })
      clearTimeout(timeoutId)

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to create liquidation address')
      }

      return await response.json()
    } catch (error: any) {
      clearTimeout(timeoutId)
      if (error.name === 'AbortError') {
        throw new Error('Request timed out')
      }
      throw error
    }
  },

  /**
   * Wallet balances as USD/EUR from Turnkey on-chain USDC/EURC at mapped Solana addresses only.
   */
  async getWalletBalances(): Promise<NoahWalletBalances> {
    const session = await requireAuthSession()
    const scopeHeaders = await getNoahScopeHeaders()

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 8000)
    const authHeaders = {
      'Authorization': `Bearer ${session.access_token}`,
    } as const

    try {
      console.log('[NoahService] Fetching on-chain wallet balances (Turnkey)...')
      const tkRes = await fetch(`${apiUrl()}/api/wallets/on-chain-balances`, {
        method: 'GET',
        headers: { ...authHeaders, ...scopeHeaders },
        signal: controller.signal,
      })
      clearTimeout(timeoutId)

      if (!tkRes.ok) {
        const errorText = await tkRes.text()
        let code: string | undefined
        let msg: string | undefined
        try {
          const j = JSON.parse(errorText) as { code?: string; error?: string }
          code = j.code
          msg = typeof j.error === 'string' ? j.error : undefined
        } catch {
          /* plain text */
        }
        const verificationGate =
          tkRes.status === 403 &&
          (code === 'NOAH_KYC_REQUIRED' ||
            code === 'NOAH_KYB_REQUIRED' ||
            (msg?.includes('verification must be approved') ?? false))
        if (!verificationGate) {
          console.error(`[NoahService] on-chain balances error ${tkRes.status}:`, errorText)
        }
        return { USD: '0', EUR: '0' }
      }

      const tk = (await tkRes.json()) as {
        USD?: string
        EUR?: string
        source?: string
        detail?: string
        balanceCaip2?: string
      }
      const source: NoahWalletBalances["source"] =
        tk.source === "turnkey" || tk.source === "none" ? tk.source : undefined
      const out: NoahWalletBalances = {
        USD: typeof tk.USD === "string" ? tk.USD : "0",
        EUR: typeof tk.EUR === "string" ? tk.EUR : "0",
        ...(source ? { source } : {}),
        ...(typeof tk.detail === "string" ? { detail: tk.detail } : {}),
        ...(typeof tk.balanceCaip2 === "string" ? { balanceCaip2: tk.balanceCaip2 } : {}),
      }
      if (out.source === "none") {
        console.warn(
          "[NoahService] On-chain balances: source=none (cards may show 0).",
          { detail: out.detail, balanceCaip2: out.balanceCaip2 },
          "If USDC/EURC are on-chain, verify the API host has TURNKEY_BALANCE_CAIP2 matching that network (e.g. solana:mainnet vs solana:devnet).",
        )
      } else {
        console.log("[NoahService] On-chain balances:", {
          USD: out.USD,
          EUR: out.EUR,
          source: out.source,
          balanceCaip2: out.balanceCaip2,
        })
      }
      return out
    } catch (error: any) {
      clearTimeout(timeoutId)
      console.error('[NoahService] Error fetching wallet balances:', error)
      return { USD: '0', EUR: '0' }
    }
  },

  /**
   * Solana USDC / EURC deposit addresses from Turnkey `wallet_accounts` (same as business /accounts).
   */
  /**
   * Ensure Turnkey sub-org exists (server-side create) and is linked — idempotent.
   * (Consumer mobile: default Noah scope is individual.)
   */
  async ensureTurnkeySubOrg(): Promise<{
    ok: boolean
    created?: boolean
    subOrganizationId?: string
    error?: string
  }> {
    const session = await requireAuthSession()
    const scopeHeaders = await getNoahScopeHeaders()
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 15000)
    try {
      const res = await fetch(`${apiUrl()}/api/wallets/ensure-sub-org`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
          ...scopeHeaders,
        },
        signal: controller.signal,
      })
      clearTimeout(timeoutId)
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean
        created?: boolean
        subOrganizationId?: string
        error?: string
      }
      if (!res.ok) {
        return { ok: false, error: json.error || `HTTP ${res.status}` }
      }
      return {
        ok: true,
        created: json.created === true,
        subOrganizationId: typeof json.subOrganizationId === 'string' ? json.subOrganizationId : undefined,
      }
    } catch (e: any) {
      clearTimeout(timeoutId)
      return { ok: false, error: e?.message || 'ensure-sub-org failed' }
    }
  },

  async getTurnkeyDepositAddresses(): Promise<{
    USD: {
      address: string
      ownerAddress: string
      stablecoin: string
      chain: string
      memo: string
    }
    EUR: {
      address: string
      ownerAddress: string
      stablecoin: string
      chain: string
      memo: string
    }
  }> {
    const session = await requireAuthSession()
    await this.ensureTurnkeySubOrg().catch(() => undefined)

    const scopeHeaders = await getNoahScopeHeaders()
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 8000)
    const empty = (stablecoin: string) => ({
      address: '',
      ownerAddress: '',
      stablecoin,
      chain: 'Solana',
      memo: '',
    })
    try {
      const res = await fetch(`${apiUrl()}/api/wallets/deposit-addresses`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          ...scopeHeaders,
        },
        signal: controller.signal,
      })
      clearTimeout(timeoutId)
      if (!res.ok) {
        return { USD: empty('USDC'), EUR: empty('EURC') }
      }
      const j = (await res.json()) as Record<string, unknown>
      const pick = (k: 'USD' | 'EUR', stablecoin: string) => {
        const row = j[k]
        if (!row || typeof row !== 'object') return empty(stablecoin)
        const o = row as Record<string, unknown>
        return {
          address: typeof o.address === 'string' ? o.address : '',
          ownerAddress: typeof o.ownerAddress === 'string' ? o.ownerAddress : '',
          stablecoin: typeof o.stablecoin === 'string' ? o.stablecoin : stablecoin,
          chain: typeof o.chain === 'string' ? o.chain : 'Solana',
          memo: typeof o.memo === 'string' ? o.memo : '',
        }
      }
      return { USD: pick('USD', 'USDC'), EUR: pick('EUR', 'EURC') }
    } catch {
      clearTimeout(timeoutId)
      return { USD: empty('USDC'), EUR: empty('EURC') }
    }
  },

  /**
   * Prepare Noah crypto→fiat sell quote (validates beneficiary; execute re-prepares at payout time).
   */
  async prepareSellPayout(input: {
    fiatAmount: string
    fullName: string
    countryCode?: string
    currency?: string
    accountNumber?: string
    routingNumber?: string
    iban?: string
    addressLine1?: string
    city?: string
    state?: string
    postalCode?: string
    accountType?: 'Checking' | 'Savings'
    /** US: ACH vs Fedwire (stored as `Wire` on recipient). Ignored for EUR. */
    transferType?: 'ACH' | 'Wire'
  }): Promise<{
    ok: boolean
    formSessionId: string | null
    cryptoAuthorizedAmount: string | null
    cryptoCurrency: string
    paymentMethodId: string | null
    error?: string
  }> {
    const session = await requireAuthSession()
    const scopeHeaders = await getNoahScopeHeaders()
    const currency = (input.currency || 'USD').toUpperCase()
    const countryCode =
      (input.countryCode || (currency === 'EUR' ? 'DE' : 'US')).toUpperCase()
    const body: Record<string, unknown> = {
      fiatAmount: input.fiatAmount,
      currency,
      countryCode,
      fullName: input.fullName,
      accountType: input.accountType ?? 'Checking',
    }
    if (currency === 'EUR' && input.iban?.trim()) {
      body.iban = input.iban.replace(/\s/g, '')
    } else {
      body.accountNumber = input.accountNumber
      body.routingNumber = input.routingNumber
      body.addressLine1 = input.addressLine1
      body.city = input.city
      body.state = input.state
      body.postalCode = input.postalCode
      body.transferType = input.transferType ?? 'ACH'
    }

    const response = await fetch(`${apiUrl()}/api/noah/payouts/prepare`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
        ...scopeHeaders,
      },
      body: JSON.stringify(body),
    })
    const data = await response.json().catch(() => ({})) as Record<string, unknown>
    if (!response.ok) {
      return {
        ok: false,
        formSessionId: null,
        cryptoAuthorizedAmount: null,
        cryptoCurrency: '',
        paymentMethodId: null,
        error: typeof data.error === 'string' ? data.error : 'Prepare failed',
      }
    }
    return {
      ok: true,
      formSessionId: (data.formSessionId as string) ?? null,
      cryptoAuthorizedAmount: (data.cryptoAuthorizedAmount as string) ?? null,
      cryptoCurrency: (data.cryptoCurrency as string) ?? 'USDC',
      paymentMethodId: (data.paymentMethodId as string) ?? null,
    }
  },

  async prepareMobileMoneyPayout(input: {
    fiatAmount: string
    countryCode: string
    currency: string
    fullName: string
    phoneNumber: string
    paymentMethodSubstrings?: string[]
  }): Promise<{
    ok: boolean
    formSessionId: string | null
    cryptoAuthorizedAmount: string | null
    cryptoCurrency: string
    paymentMethodId: string | null
    error?: string
  }> {
    const session = await requireAuthSession()
    const scopeHeaders = await getNoahScopeHeaders()
    const response = await fetch(`${apiUrl()}/api/noah/payouts/prepare-mobile`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
        ...scopeHeaders,
      },
      body: JSON.stringify({
        fiatAmount: input.fiatAmount,
        countryCode: input.countryCode,
        currency: input.currency,
        fullName: input.fullName,
        phoneNumber: input.phoneNumber,
        paymentMethodSubstrings: input.paymentMethodSubstrings,
      }),
    })
    const data = await response.json().catch(() => ({})) as Record<string, unknown>
    if (!response.ok) {
      return {
        ok: false,
        formSessionId: null,
        cryptoAuthorizedAmount: null,
        cryptoCurrency: '',
        paymentMethodId: null,
        error: typeof data.error === 'string' ? data.error : 'Mobile prepare failed',
      }
    }
    return {
      ok: true,
      formSessionId: (data.formSessionId as string) ?? null,
      cryptoAuthorizedAmount: (data.cryptoAuthorizedAmount as string) ?? null,
      cryptoCurrency: (data.cryptoCurrency as string) ?? 'USDC',
      paymentMethodId: (data.paymentMethodId as string) ?? null,
    }
  },

  async createWalletToWalletTransfer(input: {
    destinationEasetag: string
    amount: string
    currency: string
    /** Same `ETID`+8 digits as review; passed as `reserved_debit_etid` for ledger P2P. */
    reservedDebitEtid?: string
    note?: string
  }): Promise<NoahTransfer> {
    const session = await requireAuthSession()
    const scopeHeaders = await getNoahScopeHeaders()
    const etid = input.reservedDebitEtid?.trim().toUpperCase() ?? ''
    const response = await fetch(`${apiUrl()}/api/wallets/easetag-transfer`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
        ...scopeHeaders,
        'Idempotency-Key': etid || `mobile-easetag-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      },
      body: JSON.stringify({
        destination_easetag: input.destinationEasetag.replace(/^@/, '').trim(),
        amount: input.amount,
        currency: String(input.currency || 'usd').toUpperCase(),
        ...(etid ? { reserved_debit_etid: etid } : {}),
        ...(input.note?.trim() ? { note: input.note.trim() } : {}),
      }),
    })
    const data = (await response.json().catch(() => ({}))) as Record<string, unknown>
    if (!response.ok || !data.ok) {
      const detail = typeof data.detail === 'string' ? data.detail.trim() : ''
      const err = typeof data.error === 'string' ? data.error : 'Easetag transfer failed'
      throw new Error(detail ? `${err}: ${detail}` : err)
    }
    const serverEtid =
      typeof data.easner_transaction_id === 'string' ? data.easner_transaction_id.trim() : ''
    const legacyId = String(data.debit_provider_transaction_id ?? data.transfer_group_id ?? '')
    const detailId = serverEtid || legacyId
    return {
      id: detailId,
      amount: input.amount,
      currency: input.currency,
      status: 'settled',
      transaction_id: detailId,
      ...(serverEtid ? { easner_transaction_id: serverEtid } : {}),
    }
  },

  /** Global fiat off-ramp execute (quote from `/api/noah/payouts/quote`; server uses quoted session when provided). */
  async createTransfer(transferData: {
    amount: string
    currency: string
    formSessionId: string
    cryptoAuthorizedAmount: string
    cryptoCurrency: string
    countryCode: string
    channelId?: string
    recipientId?: string
    note?: string
    paymentPurpose?: string
    /** Same ETID as review screen; idempotency for PIN retry. */
    reservedDebitEtid?: string
    reviewSnapshot?: Record<string, unknown>
    noahFloor?: string
    noahSendAmount?: string
    totalDebited?: string
    marginAmount?: string
    marginCaptureMode?: 'surplus_send' | 'split_debit'
    customerRate?: number
    noahMid?: number
  }): Promise<NoahTransfer> {
    const session = await requireAuthSession()
    const scopeHeaders = await getNoahScopeHeaders()
    const etid = transferData.reservedDebitEtid?.trim().toUpperCase() ?? ''

    const response = await fetch(`${apiUrl()}/api/noah/transfers`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
        ...(etid ? { 'Idempotency-Key': etid } : {}),
        ...scopeHeaders,
      },
      body: JSON.stringify({
        amount: transferData.amount,
        currency: transferData.currency,
        sourceWalletId: noahSourceWalletIdFromSession(session),
        formSessionId: transferData.formSessionId,
        cryptoAuthorizedAmount: transferData.cryptoAuthorizedAmount,
        cryptoCurrency: transferData.cryptoCurrency,
        countryCode: transferData.countryCode,
        ...(transferData.channelId ? { channelId: transferData.channelId } : {}),
        ...(transferData.recipientId ? { recipientId: transferData.recipientId } : {}),
        ...(transferData.note ? { note: transferData.note } : {}),
        ...(transferData.paymentPurpose ? { paymentPurpose: transferData.paymentPurpose } : {}),
        ...(etid ? { reservedDebitEtid: etid } : {}),
        ...(transferData.reviewSnapshot ? { reviewSnapshot: transferData.reviewSnapshot } : {}),
        ...(transferData.noahFloor ? { noahFloor: transferData.noahFloor } : {}),
        ...(transferData.noahSendAmount ? { noahSendAmount: transferData.noahSendAmount } : {}),
        ...(transferData.totalDebited ? { totalDebited: transferData.totalDebited } : {}),
        ...(transferData.marginAmount ? { marginAmount: transferData.marginAmount } : {}),
        ...(transferData.marginCaptureMode ? { marginCaptureMode: transferData.marginCaptureMode } : {}),
        ...(transferData.customerRate != null ? { customerRate: transferData.customerRate } : {}),
        ...(transferData.noahMid != null ? { noahMid: transferData.noahMid } : {}),
      }),
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.error || 'Failed to create transfer')
    }

    const raw = (await response.json()) as NoahTransfer & {
      easner_transaction_id?: string
      transaction_id?: string
    }
    const tid = String(raw.transaction_id ?? raw.id ?? '')
    const responseEtid =
      typeof raw.easner_transaction_id === 'string' ? raw.easner_transaction_id.trim() : ''
    const detailId = responseEtid || tid
    return {
      ...raw,
      id: detailId,
      transaction_id: detailId,
      ...(responseEtid ? { easner_transaction_id: responseEtid } : {}),
    }
  },

  /**
   * Get transfer status
   */
  async getTransferStatus(transferId: string): Promise<NoahTransfer> {
    const session = await requireAuthSession()

    const response = await fetch(`${apiUrl()}/api/noah/transfers/${transferId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
      },
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.error || 'Failed to get transfer status')
    }

    return await response.json()
  },

  /**
   * List Noah transactions (via Easner `/api/noah/transactions`).
   */
  async listTransactions(limit = 20): Promise<Record<string, unknown>[]> {
    const session = await requireAuthSession()

    const safe = Math.min(100, Math.max(1, limit))
    const response = await fetch(`${apiUrl()}/api/noah/transactions?limit=${safe}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
      },
    })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) {
      throw new Error((data as { error?: string }).error || 'Failed to list transactions')
    }
    return (data as { transactions?: Record<string, unknown>[] }).transactions ?? []
  },

  /**
   * Single Noah transaction (via Easner `/api/noah/transactions/:id`).
   */
  async getTransactionDetail(transactionId: string): Promise<Record<string, unknown>> {
    const session = await requireAuthSession()

    const response = await fetch(
      `${apiUrl()}/api/noah/transactions/${encodeURIComponent(transactionId)}`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      },
    )
    const data = await response.json().catch(() => ({}))
    if (!response.ok) {
      throw new Error((data as { error?: string }).error || 'Transaction not found')
    }
    const tx = (data as { transaction?: Record<string, unknown> }).transaction
    if (!tx) {
      throw new Error('Transaction not found')
    }
    return tx
  },

  /**
   * Noah GET /prices (via Easner) — any supported fiat pair (USD/EUR wallet + payout fiats).
   */
  async getFxQuote(params: {
    sourceCurrency: string
    destinationCurrency: string
    sourceAmount: string
    country?: string
    paymentMethodCategory?: string
  }): Promise<{
    destinationAmount?: string
    impliedRate?: number
    error?: string
  }> {
    const session = await requireAuthSession()
    const scopeHeaders = await getNoahScopeHeaders()

    const qs = new URLSearchParams({
      sourceCurrency: params.sourceCurrency,
      destinationCurrency: params.destinationCurrency,
      sourceAmount: params.sourceAmount,
    })
    if (params.country?.trim()) qs.set('country', params.country.trim())
    if (params.paymentMethodCategory?.trim()) {
      qs.set('paymentMethodCategory', params.paymentMethodCategory.trim())
    }
    const response = await fetch(`${apiUrl()}/api/noah/prices?${qs.toString()}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        ...scopeHeaders,
      },
    })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) {
      throw new Error((data as { error?: string }).error || 'Failed to get quote')
    }
    return data as { destinationAmount?: string; impliedRate?: number }
  },

  /**
   * Batch Noah /prices rates for wallet send (USD/EUR → payout currencies).
   */
  async getNoahExchangeRates(options?: {
    destinations?: string
  }): Promise<
    Array<{ from_currency: string; to_currency: string; rate: number; as_of?: string; noah_mid?: number }>
  > {
    const session = await requireAuthSession()
    const scopeHeaders = await getNoahScopeHeaders()
    const dest = options?.destinations?.trim().toUpperCase()
    const path =
      dest && dest.length === 3
        ? `/api/fx/noah-rates?destinations=${encodeURIComponent(dest)}`
        : "/api/fx/noah-rates"
    const response = await fetch(`${apiUrl()}${path}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        ...scopeHeaders,
      },
    })
    const data = (await response.json().catch(() => ({}))) as {
      rates?: Array<{ from_currency: string; to_currency: string; rate: number; as_of?: string }>
      error?: string
    }
    if (!response.ok) {
      throw new Error(data.error || 'Failed to load Noah exchange rates')
    }
    return data.rates ?? []
  },

  /**
   * Download account statement PDF for a single account (date range).
   */
  async downloadStatementPdf(params: {
    from: string
    to: string
    currency: 'USD' | 'EUR' | 'GBP'
  }): Promise<{ uri: string; filename: string }> {
    const session = await requireAuthSession()

    const response = await fetch(`${apiUrl()}/api/noah/statements/pdf`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        from: params.from,
        to: params.to,
        currency: params.currency,
      }),
    })
    if (!response.ok) {
      const err = await response.json().catch(() => ({}))
      throw new Error((err as { error?: string }).error || 'Failed to generate statement')
    }

    const arrayBuffer = await response.arrayBuffer()
    const base64 = arrayBufferToBase64(arrayBuffer)
    const filename = `easner-statement-${params.currency}-${params.from}-${params.to}.pdf`

    const dir = FileSystem.documentDirectory
    if (!dir) {
      throw new Error('Document directory is not available')
    }
    const path = `${dir}${filename}`
    await FileSystem.writeAsStringAsync(path, base64, {
      encoding: 'base64',
    })
    return { uri: path, filename }
  },
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]!)
  }
  if (typeof btoa === 'undefined') {
    throw new Error('Base64 encoding is not available in this environment')
  }
  return btoa(binary)
}

