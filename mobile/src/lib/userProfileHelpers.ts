/**
 * Helpers for `public.users.full_name` ↔ first/middle/last UI fields.
 */

import type { User } from '../types'

export function splitFullNameForForm(full: string | null | undefined): {
  firstName: string
  middleName: string
  lastName: string
} {
  const p = (full ?? '').trim().split(/\s+/).filter(Boolean)
  if (p.length === 0) return { firstName: '', middleName: '', lastName: '' }
  if (p.length === 1) return { firstName: p[0]!, middleName: '', lastName: '' }
  if (p.length === 2) return { firstName: p[0]!, middleName: '', lastName: p[1]! }
  return {
    firstName: p[0]!,
    middleName: p.slice(1, -1).join(' '),
    lastName: p[p.length - 1]!,
  }
}

export function joinFullName(parts: {
  firstName: string
  middleName?: string
  lastName: string
}): string {
  return [parts.firstName, parts.middleName, parts.lastName]
    .map((s) => (typeof s === 'string' ? s.trim() : ''))
    .filter(Boolean)
    .join(' ')
    .trim()
}

/** First word of full name for greetings (e.g. dashboard “Hi {name}”). */
export function displayFirstNameFromFullName(full: string | null | undefined, fallback = 'User'): string {
  const w = (full ?? '').trim().split(/\s+/)[0]
  return w || fallback
}

/** Up to two initials from full name (same rules as dashboard avatar). */
export function initialsFromFullName(full: string | null | undefined): string {
  const p = (full ?? '').trim().split(/\s+/).filter(Boolean)
  if (p.length === 0) return 'US'
  if (p.length === 1) return (p[0]!.slice(0, 2) || 'U').toUpperCase()
  return `${p[0]![0] ?? ''}${p[p.length - 1]![0] ?? ''}`.toUpperCase()
}

/** Map a `public.users` row (Supabase `select('*')`) to app `User`. */
export function mapUsersRowToUser(ru: Record<string, unknown>): User {
  const fn = typeof ru.full_name === 'string' ? ru.full_name : null
  const names = splitFullNameForForm(fn)
  const extra = ru.enabled_extra_account_currencies
  return {
    id: String(ru.id),
    email: typeof ru.email === 'string' ? ru.email : '',
    full_name: fn,
    first_name: names.firstName,
    middle_name: names.middleName || undefined,
    last_name: names.lastName,
    phone: (ru.phone as string) ?? null,
    date_of_birth: (ru.date_of_birth as string) ?? null,
    avatar_url: (ru.avatar_url as string) ?? null,
    role: ru.role === "business" || ru.role === "individual" ? ru.role : undefined,
    easner_business_id: (ru.easner_business_id as string) ?? null,
    enabled_extra_account_currencies: Array.isArray(extra) ? (extra as string[]) : [],
    noah_customer_id: (ru.noah_customer_id as string) ?? null,
    noah_kyc_status: (ru.noah_kyc_status as string) ?? null,
    noah_kyc_rejection_reasons: ru.noah_kyc_rejection_reasons,
    noah_usd_virtual_account_id: (ru.noah_usd_virtual_account_id as string) ?? null,
    noah_eur_virtual_account_id: (ru.noah_eur_virtual_account_id as string) ?? null,
    noah_gbp_virtual_account_id: (ru.noah_gbp_virtual_account_id as string) ?? null,
    kyc_verified_at: (ru.kyc_verified_at as string) ?? null,
    kyc_id_type: (ru.kyc_id_type as string) ?? null,
    kyc_id_number: (ru.kyc_id_number as string) ?? null,
    kyc_id_issuing_country: (ru.kyc_id_issuing_country as string) ?? null,
    kyc_address_street: (ru.kyc_address_street as string) ?? null,
    kyc_address_city: (ru.kyc_address_city as string) ?? null,
    kyc_address_state: (ru.kyc_address_state as string) ?? null,
    kyc_address_post_code: (ru.kyc_address_post_code as string) ?? null,
    kyc_address_country: (ru.kyc_address_country as string) ?? null,
    residence_country: (ru.residence_country as string) ?? null,
    easetag: typeof ru.easetag === 'string' && ru.easetag.trim() ? ru.easetag.trim().toLowerCase() : undefined,
    status: 'active',
    base_currency: 'USD',
    created_at: String(ru.created_at ?? ''),
    updated_at: String(ru.updated_at ?? ''),
  }
}
