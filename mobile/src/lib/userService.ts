import { supabase } from './supabase'
import { joinFullName } from './userProfileHelpers'
import { getApiBaseUrl } from './apiClient'

/** Shape returned by `PUT /api/settings/personal` (and normalized Supabase fallback). */
export type PersonalSettingsPayload = {
  fullName: string
  email: string
  phone: string
  dateOfBirth: string
  avatarUrl: string | null
}

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

/**
 * Normalize `updateProfile` return value so the UI can apply authoritative server fields on save
 * (avoids waiting on AuthContext + `userProfile` timing).
 */
export function personalFromUpdateProfileResult(result: unknown): PersonalSettingsPayload | null {
  if (!result || typeof result !== 'object') return null
  const r = result as Record<string, unknown>
  if (r.personal && typeof r.personal === 'object') {
    const p = r.personal as Record<string, unknown>
    const fullName = typeof p.fullName === 'string' ? p.fullName : ''
    const email = typeof p.email === 'string' ? p.email : ''
    const phone = typeof p.phone === 'string' ? p.phone : ''
    const dateOfBirth = typeof p.dateOfBirth === 'string' ? p.dateOfBirth : ''
    const av = p.avatarUrl
    const avatarUrl =
      av === null || av === undefined
        ? null
        : typeof av === 'string' && av.trim()
          ? av.trim()
          : null
    return { fullName, email, phone, dateOfBirth, avatarUrl }
  }
  /** Direct `users` row from Supabase `.update().select().single()` */
  if (typeof r.id === 'string' && 'full_name' in r) {
    const row = r as Record<string, unknown>
    const fullName = typeof row.full_name === 'string' ? row.full_name : ''
    const email = typeof row.email === 'string' ? row.email : ''
    const phone = typeof row.phone === 'string' ? row.phone : ''
    const dateOfBirth = typeof row.date_of_birth === 'string' ? row.date_of_birth : ''
    const av = row.avatar_url
    const avatarUrl =
      av === null || av === undefined
        ? null
        : typeof av === 'string' && av.trim()
          ? av.trim()
          : null
    return { fullName, email, phone, dateOfBirth, avatarUrl }
  }
  return null
}

export const userService = {
  /**
   * Persist profile fields. Prefer `PUT /api/settings/personal` (same as business web, service-role upsert)
   * because direct `supabase.from('users').update()` often fails under RLS.
   */
  async updateProfile(
    userId: string,
    updates: UserProfileData
  ): Promise<unknown> {
    const fullName = joinFullName({
      firstName: updates.firstName,
      middleName: updates.middleName,
      lastName: updates.lastName,
    })

    const apiBase = getApiBaseUrl()
    if (apiBase) {
      await supabase.auth.refreshSession().catch(() => undefined)
      const {
        data: { session },
      } = await supabase.auth.getSession()
      if (!session?.access_token) {
        throw new Error('Not authenticated')
      }
      if (session.user.id !== userId) {
        throw new Error('Session does not match user')
      }

      const body: Record<string, unknown> = {
        fullName: fullName.trim() || null,
        phone: typeof updates.phone === 'string' ? updates.phone : '',
      }

      if (updates.dateOfBirth !== undefined) {
        body.dateOfBirth = updates.dateOfBirth || null
      }

      if (updates.avatarUrl !== undefined) {
        const v = updates.avatarUrl
        body.avatarUrl =
          v === null || v === '' ? null : typeof v === 'string' ? v.trim() || null : null
      }

      const res = await fetch(`${apiBase}/api/settings/personal`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(body),
      })

      const text = await res.text()
      let json: { error?: string; personal?: unknown } = {}
      try {
        json = text ? (JSON.parse(text) as { error?: string; personal?: unknown }) : {}
      } catch {
        json = {}
      }
      if (!res.ok) {
        const detail =
          typeof json.error === 'string' && json.error.trim()
            ? json.error
            : text?.trim()?.slice(0, 200)
        throw new Error(detail || `Failed to update profile (${res.status})`)
      }
      return json
    }

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

  /** Persist Easetag via business BFF (`PUT /api/username`) for validation + global uniqueness. */
  async updateEasetag(easetag: string): Promise<void> {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) throw new Error('Not authenticated')
    const base = getApiBaseUrl()
    const res = await fetch(`${base}/api/username`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ easetag: easetag.replace(/^@/, '').trim().toLowerCase() }),
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) {
      throw new Error(typeof (json as { error?: string }).error === 'string' ? (json as { error: string }).error : 'Failed to save Easetag')
    }
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
