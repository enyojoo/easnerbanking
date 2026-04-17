// Noah — mobile API client (calls Easner backend under /api/noah/*).
// Noah REST API: https://docs.noah.com/

import * as FileSystem from 'expo-file-system/legacy'
import type { Session } from '@supabase/supabase-js'
import { getApiBaseUrl } from './apiClient'
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

interface NoahTOSLink {
  tosLink: string
  tosLinkId: string
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

interface NoahWalletBalances {
  USD: string
  EUR: string
}

interface NoahTransfer {
  id: string
  amount: string
  currency: string
  status: string
  /** Present when the backend returns a ledger/transaction id alongside the transfer id */
  transaction_id?: string
}

/** Aligns with business/lib/pricing/provider-costs PricingTotals when PRICING_PROVIDER_DECOMPOSED=true */
export interface PricingQuoteTotals {
  total_provider_cost: number
  total_easner_fee: number
  total_user_fee: number
  total_recipient_amount: number
  reporting_currency: string
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
  kyc_link: string
  tos_link?: string
  kyc_status?: string
  tos_status?: string
  customer_id?: string
  kyc_link_id?: string
}

export const noahService = {
  async createPricingQuote(input: {
    sourceCurrency: string
    destinationCurrency: string
    sourceAmount: number
    rail?: string
    countryCode?: string
    payoutCountry?: string
    payoutMethod?: string
    fundingRail?: string
    fundingDirection?: 'inbound' | 'outbound'
    fundingRailOutbound?: string
    fundingDirectionOutbound?: 'inbound' | 'outbound'
  }): Promise<PricingQuote> {
    const session = await requireAuthSession()

    const response = await fetch(`${apiUrl()}/api/pricing/quote`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        sourceCurrency: input.sourceCurrency,
        destinationCurrency: input.destinationCurrency,
        sourceAmount: input.sourceAmount,
        rail: input.rail,
        countryCode: input.countryCode,
        payoutCountry: input.payoutCountry,
        payoutMethod: input.payoutMethod,
        fundingRail: input.fundingRail,
        fundingDirection: input.fundingDirection,
        fundingRailOutbound: input.fundingRailOutbound,
        fundingDirectionOutbound: input.fundingDirectionOutbound,
      }),
    })
    const data = await response.json().catch(() => ({}))
    if (!response.ok || !(data as any).ok) {
      throw new Error((data as any).error || 'Failed to create quote')
    }
    return (data as any).quote as PricingQuote
  },

  async validatePricingQuote(quoteId: string): Promise<{ reasonCode?: string | null }> {
    const session = await requireAuthSession()

    const response = await fetch(`${apiUrl()}/api/pricing/validate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ quoteId }),
    })
    const data = await response.json().catch(() => ({}))
    if (!response.ok || !(data as any).ok) {
      throw new Error((data as any).error || 'Quote validation failed')
    }
    return { reasonCode: (data as any)?.repricing?.reasonCode ?? null }
  },

  async applyPricingQuote(quoteId: string, transactionId?: string): Promise<{ reasonCode?: string | null }> {
    const session = await requireAuthSession()

    const response = await fetch(`${apiUrl()}/api/pricing/apply`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ quoteId, transactionId }),
    })
    const data = await response.json().catch(() => ({}))
    if (!response.ok || !(data as any).ok) {
      throw new Error((data as any).error || 'Failed to apply quote')
    }
    return { reasonCode: (data as any)?.repricing?.reasonCode ?? null }
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
   * Get TOS link for user
   */
  async getTOSLink(email: string, type: 'individual' | 'business' = 'individual'): Promise<NoahTOSLink> {
    const session = await requireAuthSession()

    const response = await fetch(`${apiUrl()}/api/noah/tos`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ email, type }),
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.error || 'Failed to create TOS link')
    }

    return await response.json()
  },

  /**
   * Check if TOS has been accepted
   */
  async checkTOSStatus(tosLinkId: string): Promise<{ signed: boolean; signedAgreementId?: string }> {
    const session = await requireAuthSession()

    const response = await fetch(`${apiUrl()}/api/noah/tos?tosLinkId=${tosLinkId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
      },
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.error || 'Failed to check TOS status')
    }

    return await response.json()
  },

  /**
   * Get KYC link for user
   */
  async getKycLink(full_name: string, email: string, type: 'individual' | 'business' = 'individual'): Promise<NoahKycLink> {
    const session = await requireAuthSession()

    const response = await fetch(`${apiUrl()}/api/noah/kyc-links`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ full_name, email, type }),
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.error || 'Failed to create KYC link')
    }

    return await response.json()
  },

  /**
   * Update customer with signed_agreement_id after TOS acceptance
   * This is required because accepting TOS via hosted link doesn't automatically update the customer
   */
  async updateCustomerTOS(signedAgreementId: string): Promise<{ success: boolean; hasAcceptedTOS: boolean }> {
    const session = await requireAuthSession()

    const response = await fetch(`${apiUrl()}/api/noah/customers/update-tos`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        signedAgreementId,
      }),
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.error || 'Failed to update customer TOS')
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

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 8000)
    const authHeaders = {
      'Authorization': `Bearer ${session.access_token}`,
    } as const

    try {
      console.log('[NoahService] Fetching on-chain wallet balances (Turnkey)...')
      const tkRes = await fetch(`${apiUrl()}/api/wallets/on-chain-balances`, {
        method: 'GET',
        headers: { ...authHeaders },
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

      const tk = (await tkRes.json()) as { USD?: string; EUR?: string }
      console.log('[NoahService] On-chain balances:', tk)
      return {
        USD: typeof tk.USD === 'string' ? tk.USD : '0',
        EUR: typeof tk.EUR === 'string' ? tk.EUR : '0',
      }
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
   * Requires `NOAH_API_KEY` on the business app (route uses requireNoahEnv).
   */
  async ensureTurnkeySubOrg(): Promise<{
    ok: boolean
    created?: boolean
    subOrganizationId?: string
    error?: string
  }> {
    const session = await requireAuthSession()
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 15000)
    try {
      const res = await fetch(`${apiUrl()}/api/wallets/ensure-sub-org`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
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
    USD: { address: string; stablecoin: string; chain: string; memo: string }
    EUR: { address: string; stablecoin: string; chain: string; memo: string }
  }> {
    const session = await requireAuthSession()
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 8000)
    const empty = (stablecoin: string) => ({
      address: '',
      stablecoin,
      chain: 'Solana',
      memo: '',
    })
    try {
      const res = await fetch(`${apiUrl()}/api/wallets/deposit-addresses`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${session.access_token}` },
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
   * Prepare Noah crypto→fiat sell (validates beneficiary; use FormSessionID on /transactions/sell).
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
      cryptoCurrency: (data.cryptoCurrency as string) ?? 'USDC_TEST',
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
    const response = await fetch(`${apiUrl()}/api/noah/payouts/prepare-mobile`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
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
      cryptoCurrency: (data.cryptoCurrency as string) ?? 'USDC_TEST',
      paymentMethodId: (data.paymentMethodId as string) ?? null,
    }
  },

  async createWalletToWalletTransfer(input: {
    destinationEasetag: string
    amount: string
    currency: string
    cryptoCurrency?: string
  }): Promise<NoahTransfer> {
    const session = await requireAuthSession()
    const response = await fetch(`${apiUrl()}/api/noah/transfers/w2w`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        destinationEasetag: input.destinationEasetag.replace(/^@/, '').trim(),
        amount: input.amount,
        currency: input.currency,
        cryptoCurrency: input.cryptoCurrency,
      }),
    })
    const data = await response.json().catch(() => ({})) as Record<string, unknown>
    if (!response.ok || !data.ok) {
      throw new Error(typeof data.error === 'string' ? data.error : 'Wallet transfer failed')
    }
    const tx = data.transaction as Record<string, unknown> | undefined
    const id = String(tx?.ID ?? tx?.id ?? '')
    const status = String(tx?.Status ?? tx?.status ?? 'pending').toLowerCase()
    return {
      id,
      amount: input.amount,
      currency: input.currency,
      status,
      transaction_id: id,
    }
  },

  /**
   * Create transfer from wallet to external bank account
   */
  async createTransfer(transferData: {
    amount: string
    currency: string
    sourceWalletId: string
    destinationExternalAccountId?: string
    formSessionId?: string
    cryptoAuthorizedAmount?: string
    cryptoCurrency?: string
  }): Promise<NoahTransfer> {
    const session = await requireAuthSession()

    const response = await fetch(`${apiUrl()}/api/noah/transfers`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
      },
      body: JSON.stringify(transferData),
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.error || 'Failed to create transfer')
    }

    return await response.json()
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
   * Noah GET /prices (via Easner) — USD/EUR stablecoin conversion quote.
   */
  async getFxQuote(params: {
    sourceCurrency: string
    destinationCurrency: string
    sourceAmount: string
  }): Promise<{
    destinationAmount?: string
    impliedRate?: number
    error?: string
  }> {
    const session = await requireAuthSession()

    const qs = new URLSearchParams({
      sourceCurrency: params.sourceCurrency,
      destinationCurrency: params.destinationCurrency,
      sourceAmount: params.sourceAmount,
    })
    const response = await fetch(`${apiUrl()}/api/noah/prices?${qs.toString()}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
      },
    })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) {
      throw new Error((data as { error?: string }).error || 'Failed to get quote')
    }
    return data as { destinationAmount?: string; impliedRate?: number }
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

