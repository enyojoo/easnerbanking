// Noah — mobile API client (calls Easner backend under /api/noah/*).
// Noah REST API: https://docs.noah.com/

import * as FileSystem from 'expo-file-system/legacy'
import { getApiBaseUrl } from './apiClient'
import { supabase } from './supabase'

/** Next.js business app (`next dev` → :3000). Must match EXPO_PUBLIC_API_URL / app.config extra. */
function apiUrl(): string {
  return (
    getApiBaseUrl() ||
    process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, '') ||
    (__DEV__ ? 'http://localhost:3000' : '')
  )
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

interface PricingQuote {
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
  }): Promise<PricingQuote> {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) throw new Error('Not authenticated')

    const response = await fetch(`${apiUrl()}/api/pricing/quote`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
      },
      body: JSON.stringify(input),
    })
    const data = await response.json().catch(() => ({}))
    if (!response.ok || !(data as any).ok) {
      throw new Error((data as any).error || 'Failed to create quote')
    }
    return (data as any).quote as PricingQuote
  },

  async validatePricingQuote(quoteId: string): Promise<{ reasonCode?: string | null }> {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) throw new Error('Not authenticated')

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
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) throw new Error('Not authenticated')

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
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) throw new Error('Not authenticated')

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
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) throw new Error('Not authenticated')

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
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) throw new Error('Not authenticated')

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
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) throw new Error('Not authenticated')

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
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) throw new Error('Not authenticated')

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
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) throw new Error('Not authenticated')

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
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) throw new Error('Not authenticated')

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
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) throw new Error('Not authenticated')

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
   * Fetches latest data from Noah and updates user record
   * Returns updated status data
   */
  async syncStatus(): Promise<{ success: boolean; synced: boolean; data?: { kycStatus: string; rejectionReasons?: any[] } }> {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) throw new Error('Not authenticated')

    // Add timeout to fetch
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 10000) // 10 second timeout

    try {
      const response = await fetch(`${apiUrl()}/api/noah/sync-status`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        signal: controller.signal,
      })
      clearTimeout(timeoutId)

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to sync status')
      }

      const data = await response.json()
      return data
    } catch (error: any) {
      clearTimeout(timeoutId)
      if (error.name === 'AbortError') {
        throw new Error('Sync request timed out')
      }
      throw error
    }
  },

  /**
   * Pull latest Noah customer (Individual scope) and upsert into Supabase — same route business uses after hosted KYB/KYC.
   */
  async syncKyc(): Promise<{ success: boolean; noahScope?: string }> {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) throw new Error('Not authenticated')

    const response = await fetch(`${apiUrl()}/api/noah/sync-kyc`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
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
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) throw new Error('Not authenticated')

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
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) throw new Error('Not authenticated')

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
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) throw new Error('Not authenticated')

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
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) throw new Error('Not authenticated')

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
   * Get wallet balances (USD/EUR)
   */
  async getWalletBalances(): Promise<NoahWalletBalances> {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) throw new Error('Not authenticated')

    // Add timeout to fetch
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 8000)

    try {
      console.log('[NoahService] Fetching wallet balances from API...')
      const response = await fetch(`${apiUrl()}/api/noah/wallets/balances`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
        },
        signal: controller.signal,
      })
      clearTimeout(timeoutId)

      if (!response.ok) {
        const errorText = await response.text()
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
          response.status === 403 &&
          (code === 'NOAH_KYC_REQUIRED' ||
            code === 'NOAH_KYB_REQUIRED' ||
            (msg?.includes('verification must be approved') ?? false))
        if (!verificationGate) {
          console.error(`[NoahService] API error ${response.status}:`, errorText)
        }
        return { USD: '0', EUR: '0' }
      }

      const data = await response.json()
      console.log('[NoahService] Received balances:', data)
      return data
    } catch (error: any) {
      clearTimeout(timeoutId)
      // Return zero balances on timeout or error
      console.error('[NoahService] Error fetching wallet balances:', error)
      return { USD: '0', EUR: '0' }
    }
  },

  /**
   * Create transfer from wallet to external bank account
   */
  async createTransfer(transferData: {
    amount: string
    currency: 'usd' | 'eur'
    sourceWalletId: string
    destinationExternalAccountId: string
  }): Promise<NoahTransfer> {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) throw new Error('Not authenticated')

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
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) throw new Error('Not authenticated')

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
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) throw new Error('Not authenticated')

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
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) throw new Error('Not authenticated')

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
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) throw new Error('Not authenticated')

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
   * Noah internal FX move execute — may return 501 until wired.
   */
  async postFxConvert(body: {
    sourceCurrency: string
    destinationCurrency: string
    sourceAmount: string
  }): Promise<{ ok?: boolean; error?: string }> {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) throw new Error('Not authenticated')

    const response = await fetch(`${apiUrl()}/api/noah/fx/convert`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
      },
      body: JSON.stringify(body),
    })
    const data = await response.json().catch(() => ({}))
    if (response.status === 501) {
      return { error: (data as { error?: string }).error || 'Move is not available yet' }
    }
    if (!response.ok) {
      throw new Error((data as { error?: string }).error || 'Move failed')
    }
    return { ok: true }
  },

  /**
   * Download account statement PDF for a single account (date range).
   */
  async downloadStatementPdf(params: {
    from: string
    to: string
    currency: 'USD' | 'EUR' | 'GBP'
  }): Promise<{ uri: string; filename: string }> {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) throw new Error('Not authenticated')

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

