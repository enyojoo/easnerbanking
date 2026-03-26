// Noah — mobile API client (calls Easner backend under /api/noah/*).
// Noah REST API: https://docs.noah.com/

import { supabase } from './supabase'

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3001'

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

interface NoahKycLink {
  kyc_link: string
  tos_link?: string
  kyc_status?: string
  tos_status?: string
  customer_id?: string
  kyc_link_id?: string
}

export const noahService = {
  /**
   * Fetch customer by id (hosted customer object from provider API)
   */
  async getCustomer(customerId: string): Promise<Record<string, unknown>> {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) throw new Error('Not authenticated')

    const response = await fetch(`${API_BASE_URL}/api/noah/customers/${customerId}`, {
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

    const response = await fetch(`${API_BASE_URL}/api/noah/tos`, {
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

    const response = await fetch(`${API_BASE_URL}/api/noah/tos?tosLinkId=${tosLinkId}`, {
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

    const response = await fetch(`${API_BASE_URL}/api/noah/kyc-links`, {
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

    const response = await fetch(`${API_BASE_URL}/api/noah/customers/update-tos`, {
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

    const response = await fetch(`${API_BASE_URL}/api/noah/customers`, {
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

    const response = await fetch(`${API_BASE_URL}/api/noah/customers`, {
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
    const response = await fetch(`${API_BASE_URL}/api/noah/customers`, {
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
      const response = await fetch(`${API_BASE_URL}/api/noah/sync-status`, {
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
   * Get customer KYC status (polling)
   */
  async getCustomerKYCStatus(customerId: string): Promise<{ kycStatus: string }> {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) throw new Error('Not authenticated')

    const response = await fetch(`${API_BASE_URL}/api/noah/customers/${customerId}/status`, {
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
  async getVirtualAccount(currency: 'usd' | 'eur'): Promise<NoahVirtualAccount> {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) throw new Error('Not authenticated')

    // Add timeout to fetch
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 8000)

    try {
    const response = await fetch(`${API_BASE_URL}/api/noah/virtual-accounts?currency=${currency}`, {
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
      const response = await fetch(`${API_BASE_URL}/api/noah/liquidation-addresses?currency=${currency}&chain=${chain}`, {
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
      const response = await fetch(`${API_BASE_URL}/api/noah/liquidation-addresses`, {
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
      const response = await fetch(`${API_BASE_URL}/api/noah/wallets/balances`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
        },
        signal: controller.signal,
      })
      clearTimeout(timeoutId)

      if (!response.ok) {
        const errorText = await response.text()
        console.error(`[NoahService] API error ${response.status}:`, errorText)
        // Return zero balances on error
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

    const response = await fetch(`${API_BASE_URL}/api/noah/transfers`, {
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

    const response = await fetch(`${API_BASE_URL}/api/noah/transfers/${transferId}`, {
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
}

