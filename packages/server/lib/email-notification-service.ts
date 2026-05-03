// Simple, working email notification service

import type { SupabaseClient } from '@supabase/supabase-js'
import { createServerClient } from './supabase'
import { emailService } from './email-service'

async function fetchUserCommunicationPreferences(
  supabase: SupabaseClient,
  userId: string,
): Promise<unknown | undefined> {
  const { data, error } = await supabase
    .from('user_preferences')
    .select('communication_preferences')
    .eq('user_id', userId)
    .maybeSingle()
  if (error && error.code !== '42P01' && error.code !== '42703') {
    console.warn('fetchUserCommunicationPreferences:', error.message)
  }
  return (data as { communication_preferences?: unknown } | null)?.communication_preferences
}

export interface TransactionEmailData {
  transactionId: string
  recipientName: string
  sendAmount: number
  sendCurrency: string
  receiveAmount: number
  receiveCurrency: string
  exchangeRate: number
  fee: number
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled'
  failureReason?: string
  createdAt: string
  updatedAt: string
}

export class EmailNotificationService {
  /**
   * Send transaction status email notification
   */
  static async sendTransactionStatusEmail(
    transactionId: string, 
    status: string
  ): Promise<void> {
    console.log('Sending email for transaction:', transactionId, 'status:', status)
    
    try {
      // Get transaction data from database
      console.log('Creating Supabase client...')
      let supabase
      try {
        supabase = createServerClient()
        console.log('Supabase client created successfully')
      } catch (clientError) {
        console.error('Failed to create Supabase client:', clientError)
        return
      }
      
      console.log('Fetching transaction data...')
      const { data: transaction, error: transactionError } = await supabase
        .from('transactions')
        .select('*')
        .eq('transaction_id', transactionId)
        .single()

      if (transactionError) {
        console.error('Transaction query error:', transactionError)
        throw new Error(`Transaction query failed: ${transactionError.message}`)
      }

      if (!transaction) {
        console.error('Transaction not found for ID:', transactionId)
        throw new Error(`Transaction not found for ID: ${transactionId}`)
      }

      console.log('Transaction found:', transaction.transaction_id)

      // Get user email
      console.log('Fetching user data...')
      const { data: user, error: userError } = await supabase
        .from('users')
        .select('email')
        .eq('id', transaction.user_id)
        .single()

      if (userError || !user?.email) {
        console.error('User not found:', userError)
        throw new Error(`User not found or no email: ${userError?.message || 'No email address'}`)
      }

      console.log('User email found:', user.email)

      const comm = await fetchUserCommunicationPreferences(supabase, transaction.user_id)

      // Get recipient name
      console.log('Fetching recipient data...')
      const { data: recipient, error: recipientError } = await supabase
        .from('recipients')
        .select('full_name')
        .eq('id', transaction.recipient_id)
        .single()

      console.log('Recipient found:', recipient?.full_name || 'Unknown')

      // Create email data
      const emailData: TransactionEmailData = {
        transactionId: transaction.transaction_id,
        recipientName: recipient?.full_name || 'Unknown',
        sendAmount: transaction.send_amount,
        sendCurrency: transaction.send_currency,
        receiveAmount: transaction.receive_amount,
        receiveCurrency: transaction.receive_currency,
        exchangeRate: transaction.exchange_rate,
        fee: transaction.fee_amount,
        status: status as any,
        failureReason: transaction.failure_reason,
        createdAt: transaction.created_at,
        updatedAt: transaction.updated_at
      }

      // Send email based on status
      console.log('Sending email to:', user.email, 'with status:', status)

      let result
      if (status === 'completed') {
        result = await emailService.sendTransactionCompletedEmail(user.email, emailData, comm)
      } else if (status === 'processing') {
        result = await emailService.sendTransactionProcessingEmail(user.email, emailData, comm)
      } else if (status === 'pending') {
        result = await emailService.sendTransactionPendingEmail(user.email, emailData, comm)
      } else if (status === 'failed') {
        result = await emailService.sendTransactionFailedEmail(user.email, emailData, comm)
      } else if (status === 'cancelled') {
        result = await emailService.sendTransactionCancelledEmail(user.email, emailData, comm)
      } else {
        console.log('Unknown status:', status)
        return
      }

      if (result.success) {
        console.log('Email sent successfully!', result.messageId)
      } else {
        console.error('Email sending failed:', result.error)
      }
    } catch (error) {
      console.error('Error sending email:', error)
    }
  }

  /**
   * Send crypto receive transaction status email notification
   */
  static async sendCryptoReceiveTransactionEmail(
    transactionId: string,
    status: string
  ): Promise<void> {
    console.log('Sending email for crypto receive transaction:', transactionId, 'status:', status)

    try {
      const supabase = createServerClient()

      // Get crypto receive transaction data
      const { data: transaction, error: transactionError } = await supabase
        .from('crypto_receive_transactions')
        .select(`
          *,
          crypto_wallet:crypto_wallets(*, recipient:recipients(*)),
          user:users(first_name, last_name, email)
        `)
        .eq('transaction_id', transactionId)
        .single()

      if (transactionError || !transaction) {
        console.error('Crypto receive transaction not found:', transactionError)
        return
      }

      const userEmail = transaction.user?.email
      if (!userEmail) {
        console.error('User email not found')
        return
      }

      const comm = await fetchUserCommunicationPreferences(supabase, transaction.user_id as string)

      // Map crypto receive status to transaction email status
      let emailStatus: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled' = 'processing'
      if (status === 'deposited') {
        emailStatus = 'completed'
      } else if (status === 'failed') {
        emailStatus = 'failed'
      } else if (status === 'pending') {
        emailStatus = 'pending'
      }

      // Create email data for crypto receive transaction
      const emailData: TransactionEmailData = {
        transactionId: transaction.transaction_id,
        recipientName: transaction.crypto_wallet?.recipient?.full_name || 'Your Account',
        sendAmount: transaction.crypto_amount,
        sendCurrency: transaction.crypto_currency,
        receiveAmount: transaction.fiat_amount,
        receiveCurrency: transaction.fiat_currency,
        exchangeRate: transaction.exchange_rate,
        fee: 0,
        status: emailStatus,
        createdAt: transaction.created_at,
        updatedAt: transaction.updated_at,
      }

      // Send email based on status
      let result
      if (status === 'deposited') {
        result = await emailService.sendTransactionCompletedEmail(userEmail, emailData, comm)
      } else if (status === 'converting' || status === 'converted' || status === 'confirmed') {
        result = await emailService.sendTransactionProcessingEmail(userEmail, emailData, comm)
      } else if (status === 'pending') {
        result = await emailService.sendTransactionPendingEmail(userEmail, emailData, comm)
      } else if (status === 'failed') {
        result = await emailService.sendTransactionFailedEmail(userEmail, emailData, comm)
      } else {
        console.log('Unknown crypto receive status:', status)
        return
      }

      if (result.success) {
        console.log('Crypto receive email sent successfully!', result.messageId)
      } else {
        console.error('Crypto receive email sending failed:', result.error)
      }
    } catch (error) {
      console.error('Error sending crypto receive email:', error)
    }
  }

  /**
   * Send welcome email
   */
  static async sendWelcomeEmail(
    userEmail: string, 
    firstName: string
  ): Promise<void> {
    try {
      let prefs: unknown
      try {
        const supabase = createServerClient()
        const { data: row } = await supabase
          .from('users')
          .select('id')
          .eq('email', userEmail)
          .maybeSingle()
        prefs = row?.id
          ? await fetchUserCommunicationPreferences(supabase, row.id)
          : undefined
      } catch {
        prefs = undefined
      }

      const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://www.easner.com'
      const result = await emailService.sendWelcomeEmail(
        {
          firstName,
          lastName: '',
          email: userEmail,
          baseCurrency: 'USD',
          dashboardUrl: `${appUrl}/dashboard`,
        },
        prefs,
      )
      
      if (result.success) {
        console.log('Welcome email sent to:', userEmail)
      } else {
        console.error('Welcome email failed:', result.error)
      }
    } catch (error) {
      console.error('Error sending welcome email:', error)
    }
  }

  /**
   * Send admin notification email for transaction events
   * Built exactly like sendTransactionStatusEmail (user emails) but sends to admin
   */
  static async sendAdminTransactionNotification(
    transactionId: string, 
    status: string
  ): Promise<void> {
    console.log('Sending admin notification for transaction:', transactionId, 'status:', status)
    
    try {
      // Get transaction data from database (exact same as user email method)
      console.log('Creating Supabase client...')
      let supabase
      try {
        supabase = createServerClient()
        console.log('Supabase client created successfully')
      } catch (clientError) {
        console.error('Failed to create Supabase client:', clientError)
        return
      }
      
      console.log('Fetching transaction data...')
      const { data: transaction, error: transactionError } = await supabase
        .from('transactions')
        .select('*')
        .eq('transaction_id', transactionId)
        .single()

      if (transactionError) {
        console.error('Transaction query error:', transactionError)
        throw new Error(`Transaction query failed: ${transactionError.message}`)
      }

      if (!transaction) {
        console.error('Transaction not found for ID:', transactionId)
        throw new Error(`Transaction not found for ID: ${transactionId}`)
      }

      console.log('Transaction found:', transaction.transaction_id)

      // Get user data (exact same as user email method)
      console.log('Fetching user data...')
      const { data: user, error: userError } = await supabase
        .from('users')
        .select('email, first_name, last_name')
        .eq('id', transaction.user_id)
        .single()

      if (userError || !user?.email) {
        console.error('User not found:', userError)
        throw new Error(`User not found or no email: ${userError?.message || 'No email address'}`)
      }

      console.log('User data found:', user.email)

      // Get recipient name (exact same as user email method)
      console.log('Fetching recipient data...')
      const { data: recipient, error: recipientError } = await supabase
        .from('recipients')
        .select('full_name')
        .eq('id', transaction.recipient_id)
        .single()

      console.log('Recipient found:', recipient?.full_name || 'Unknown')

      // Create admin email data
      const adminEmailData = {
        transactionId: transaction.transaction_id,
        status: status,
        sendAmount: transaction.send_amount,
        sendCurrency: transaction.send_currency,
        receiveAmount: transaction.receive_amount,
        receiveCurrency: transaction.receive_currency,
        exchangeRate: transaction.exchange_rate,
        fee: transaction.fee_amount,
        recipientName: recipient?.full_name || 'Unknown',
        userId: transaction.user_id,
        userEmail: user.email,
        userName: `${user.first_name || ''} ${user.last_name || ''}`.trim() || 'Unknown',
        createdAt: transaction.created_at,
        updatedAt: transaction.updated_at,
        failureReason: transaction.failure_reason
      }

      // Send admin notification email (exact same pattern as user email)
      console.log('Sending admin notification email to: enyo@easner.com')
      
      const result = await emailService.sendEmail({
        to: 'enyo@easner.com',
        template: 'adminTransactionNotification',
        data: adminEmailData
      })

      if (result.success) {
        console.log('Admin notification email sent successfully!', result.messageId)
      } else {
        console.error('Admin notification email sending failed:', result.error)
      }
    } catch (error) {
      console.error('Error sending admin notification email:', error)
    }
  }
}