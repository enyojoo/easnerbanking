import { supabase } from './supabase'
import { noahService } from './noahService'
import { mapNoahDetailToTransactionData } from './noahUserDataHelpers'
import type { TransactionData } from '../types'

export type { TransactionData }

async function emailNotificationHeaders(): Promise<Record<string, string>> {
  const {
    data: { session },
  } = await supabase.auth.getSession()
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (session?.access_token) {
    headers.Authorization = `Bearer ${session.access_token}`
  }
  return headers
}

export const transactionService = {
  async create(transactionData: {
    userId: string
    recipientId: string
    sendAmount: number
    sendCurrency: string
    receiveAmount: number
    receiveCurrency: string
    exchangeRate: number
    feeAmount: number
    feeType: string
    totalAmount: number
    transactionId: string
  }): Promise<TransactionData> {
    const { data, error } = await supabase
      .from('transactions')
      .insert({
        transaction_id: transactionData.transactionId,
        user_id: transactionData.userId,
        recipient_id: transactionData.recipientId,
        send_amount: transactionData.sendAmount,
        send_currency: transactionData.sendCurrency,
        receive_amount: transactionData.receiveAmount,
        receive_currency: transactionData.receiveCurrency,
        exchange_rate: transactionData.exchangeRate,
        fee_amount: transactionData.feeAmount,
        fee_type: transactionData.feeType,
        total_amount: transactionData.totalAmount,
        status: 'pending',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select(`
        *,
        recipient:recipients(*),
        user:users(first_name, last_name, email)
      `)
      .single()

    if (error) {
      if ((error as { code?: string }).code === 'PGRST205' || error.message?.includes('schema cache')) {
        throw new Error(
          'Legacy transaction storage is not available. Send from your wallet using Send Money.',
        )
      }
      throw new Error(`Failed to create transaction: ${error.message}`)
    }

    // Send initial pending status email via API (non-blocking)
    try {
      console.log('Sending initial pending email for transaction:', data.transaction_id)
      const baseUrl = process.env.EXPO_PUBLIC_API_URL || 'https://app.easner.com'
      const headers = await emailNotificationHeaders()
      // Use fetch to call the email API endpoint
      fetch(`${baseUrl}/api/send-email-notification`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          type: 'transaction',
          transactionId: data.transaction_id,
          status: 'pending'
        })
      }).then(response => {
        if (response.ok) {
          console.log('Initial pending email sent successfully')
        } else {
          console.error('Failed to send initial transaction email:', response.statusText)
        }
      }).catch(error => {
        console.error('Failed to send initial transaction email:', error)
      })
    } catch (emailError) {
      console.error('Failed to send initial transaction email:', emailError)
      // Don't fail the transaction creation if email fails
    }

    // Send admin notification email via API (non-blocking)
    try {
      console.log('Sending admin notification for new transaction:', data.transaction_id)
      const baseUrl = process.env.EXPO_PUBLIC_API_URL || 'https://app.easner.com'
      const headers = await emailNotificationHeaders()
      // Use fetch to call the admin notification API endpoint
      fetch(`${baseUrl}/api/send-email-notification`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          type: 'admin-transaction',
          transactionId: data.transaction_id,
          status: 'pending'
        })
      }).then(response => {
        if (response.ok) {
          console.log('Admin notification sent successfully')
        } else {
          console.error('Failed to send admin notification email:', response.statusText)
        }
      }).catch(error => {
        console.error('Failed to send admin notification email:', error)
      })
    } catch (adminEmailError) {
      console.error('Failed to send admin notification email:', adminEmailError)
      // Don't fail the transaction creation if admin email fails
    }

    return data
  },

  async getById(transactionId: string): Promise<TransactionData> {
    const {
      data: { session },
    } = await supabase.auth.getSession()
    const userId = session?.user?.id ?? ''

    const { data, error } = await supabase
      .from('transactions')
      .select(
        `
        *,
        recipient:recipients(*),
        user:users(first_name, last_name, email)
      `,
      )
      .eq('transaction_id', transactionId)
      .single()

    if (!error && data) {
      return data as TransactionData
    }

    try {
      const tx = await noahService.getTransactionDetail(transactionId)
      return mapNoahDetailToTransactionData(userId, tx)
    } catch (e) {
      if (error) {
        throw new Error(`Failed to fetch transaction: ${error.message}`)
      }
      throw e
    }
  },

  async getByUserId(userId: string, limit = 20): Promise<TransactionData[]> {
    const { data, error } = await supabase
      .from('transactions')
      .select(
        `
        *,
        recipient:recipients(*),
        user:users(first_name, last_name, email)
      `,
      )
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (!error && data) {
      return data as TransactionData[]
    }

    const rows = await noahService.listTransactions(limit)
    return rows.map((r) => mapNoahDetailToTransactionData(userId, r))
  },

  async updateStatus(transactionId: string, status: string): Promise<void> {
    const updates: any = { status }
    
    if (status === 'completed') {
      updates.completed_at = new Date().toISOString()
    }
    
    updates.updated_at = new Date().toISOString()

    const { error } = await supabase
      .from('transactions')
      .update(updates)
      .eq('transaction_id', transactionId)

    if (error) {
      if ((error as { code?: string }).code === 'PGRST205' || error.message?.includes('schema cache')) {
        console.warn('transactionService.updateStatus: no transactions table; skipping')
        return
      }
      throw new Error(`Failed to update transaction status: ${error.message}`)
    }

    // Send status update email via API (non-blocking)
    try {
      console.log('Sending status update email for transaction:', transactionId, 'status:', status)
      const baseUrl = process.env.EXPO_PUBLIC_API_URL || 'https://app.easner.com'
      const headers = await emailNotificationHeaders()
      // Use fetch to call the email API endpoint
      fetch(`${baseUrl}/api/send-email-notification`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          type: 'transaction',
          transactionId: transactionId,
          status: status
        })
      }).then(response => {
        if (response.ok) {
          console.log('Status update email sent successfully')
        } else {
          console.error('Failed to send status update email:', response.statusText)
        }
      }).catch(error => {
        console.error('Failed to send status update email:', error)
      })
    } catch (emailError) {
      console.error('Failed to send status update email:', emailError)
      // Don't fail the status update if email fails
    }
  }
}
