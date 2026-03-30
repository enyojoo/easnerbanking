import { supabase } from './supabase'
import { joinFullName } from './userProfileHelpers'

export interface UserProfileData {
  firstName: string
  middleName?: string
  lastName: string
  phone: string
  dateOfBirth?: string
  /** Public HTTPS URL from `/api/upload/profile-avatar`; `null` clears `users.avatar_url` */
  avatarUrl?: string | null
}

export interface UserStats {
  totalTransactions: number
  totalSent: number
  memberSince: string
}

export const userService = {
  async updateProfile(
    userId: string,
    updates: UserProfileData
  ): Promise<any> {
    const fullName = joinFullName({
      firstName: updates.firstName,
      middleName: updates.middleName,
      lastName: updates.lastName,
    })
    const updateData: Record<string, unknown> = {
      full_name: fullName || null,
      phone: updates.phone || null,
      updated_at: new Date().toISOString(),
    }

    if (updates.dateOfBirth !== undefined) {
      updateData.date_of_birth = updates.dateOfBirth || null
    }

    if (updates.avatarUrl !== undefined) {
      const v = updates.avatarUrl
      updateData.avatar_url =
        v === null || v === '' ? null : typeof v === 'string' ? v.trim() || null : null
    }

    const { data, error } = await supabase
      .from('users')
      .update(updateData)
      .eq('id', userId)
      .select()
      .single()

    if (error) throw error
    return data
  },

  async getUserStats(
    userId: string,
    transactions: any[],
    exchangeRates: any[],
    baseCurrency: string,
    userProfile: any
  ): Promise<UserStats> {
    let totalSentInBaseCurrency = 0

    // Calculate total sent in base currency for completed transactions
    for (const transaction of transactions) {
      if (transaction.status === 'completed') {
        let amountInBaseCurrency = transaction.send_amount

        // If transaction currency is different from base currency, convert it
        if (transaction.send_currency !== baseCurrency) {
          // Find exchange rate from transaction currency to base currency
          const rate = exchangeRates.find(
            (r) => r.from_currency === transaction.send_currency && r.to_currency === baseCurrency
          )

          if (rate) {
            amountInBaseCurrency = transaction.send_amount * rate.rate
          } else {
            // If direct rate not found, try reverse rate
            const reverseRate = exchangeRates.find(
              (r) => r.from_currency === baseCurrency && r.to_currency === transaction.send_currency
            )
            if (reverseRate && reverseRate.rate > 0) {
              amountInBaseCurrency = transaction.send_amount / reverseRate.rate
            }
          }
        }

        totalSentInBaseCurrency += amountInBaseCurrency
      }
    }

    // Get member since date from user profile
    const formatDate = (dateString: string) => {
      const date = new Date(dateString)
      const month = date.toLocaleString('en-US', { month: 'short' })
      const day = date.getDate().toString().padStart(2, '0')
      const year = date.getFullYear()
      // Format: "Nov 07, 2025"
      return `${month} ${day}, ${year}`
    }

    const memberSince = userProfile?.profile?.created_at
      ? formatDate(userProfile.profile.created_at)
      : 'N/A'

    return {
      totalTransactions: transactions.filter((t) => t.status === 'completed').length,
      totalSent: totalSentInBaseCurrency,
      memberSince,
    }
  },
}
