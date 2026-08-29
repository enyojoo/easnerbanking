import { splitFullNameForForm } from './userProfileHelpers'

type ProfileLike = {
  email?: string | null
  phone?: string | null
  full_name?: string | null
  first_name?: string | null
  last_name?: string | null
  date_of_birth?: string | null
  kyc_address_street?: string | null
  kyc_address_city?: string | null
  kyc_address_state?: string | null
  kyc_address_post_code?: string | null
  kyc_address_country?: string | null
  residence_country?: string | null
  profile?: ProfileLike | null
} | null

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' ? (v as Record<string, unknown>) : {}
}

function firstString(...values: Array<string | null | undefined>): string {
  for (const v of values) {
    const s = String(v || '').trim()
    if (s) return s
  }
  return ''
}

function dobParts(raw: string | null | undefined): { day: string; month: string; year: string } {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(raw || '').trim())
  if (!m) return { day: '', month: '', year: '' }
  return { year: m[1]!, month: m[2]!, day: m[3]! }
}

export function expressFormFromProfile(userProfile: ProfileLike): Record<string, string> {
  const p = userProfile?.profile ?? userProfile
  const names = splitFullNameForForm(p?.full_name)
  const country = firstString(p?.kyc_address_country, p?.residence_country).toUpperCase()
  const dob = dobParts(p?.date_of_birth)
  return {
    given_name: firstString(p?.first_name, names.firstName),
    surname: firstString(p?.last_name, names.lastName),
    email: firstString(p?.email, userProfile?.email),
    phone: firstString(p?.phone, userProfile?.phone),
    line1: firstString(p?.kyc_address_street),
    city: firstString(p?.kyc_address_city),
    state: firstString(p?.kyc_address_state),
    postal_code: firstString(p?.kyc_address_post_code),
    country,
    dob_day: dob.day,
    dob_month: dob.month,
    dob_year: dob.year,
    nationalities: country,
    birth_city: '',
    birth_country: country,
    identifier: '',
    ssn: '',
  }
}

export function expressFormFromStatusPrefill(
  prefill: Record<string, unknown> | undefined,
  payerCountry?: string | null,
): Record<string, string> {
  const pre = asRecord(prefill)
  const address = asRecord(pre.address)
  const dob = asRecord(pre.date_of_birth)
  const country = firstString(address.country as string, payerCountry).toUpperCase()
  return {
    given_name: firstString(pre.given_name as string, pre.first_name as string),
    surname: firstString(pre.surname as string, pre.last_name as string),
    email: firstString(pre.email as string),
    phone: firstString(pre.phone as string),
    line1: firstString(address.line1 as string),
    city: firstString(address.city as string),
    state: firstString(address.state as string),
    postal_code: firstString(address.postal_code as string),
    country,
    dob_day: firstString(dob.day != null ? String(dob.day) : ''),
    dob_month: firstString(dob.month != null ? String(dob.month) : ''),
    dob_year: firstString(dob.year != null ? String(dob.year) : ''),
    nationalities: firstString(country),
    birth_city: '',
    birth_country: country,
    identifier: '',
    ssn: '',
  }
}

export function mergeExpressForm(
  prev: Record<string, string>,
  incoming: Record<string, string>,
): Record<string, string> {
  const next = { ...prev }
  for (const [key, value] of Object.entries(incoming)) {
    if (key === 'ssn') continue
    if (!String(next[key] || '').trim() && value) next[key] = value
  }
  return next
}

export function expressLockedCountry(
  form: Record<string, string>,
  payerCountry?: string | null,
): string {
  return firstString(payerCountry, form.country).toUpperCase()
}
