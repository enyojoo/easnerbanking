import { View, Text, type StyleProp, type TextStyle } from 'react-native'
import type { PayeeAccountKind } from './easnerBrand'

function normalizeEasetag(easetag: string | undefined | null): string {
  return String(easetag || '')
    .trim()
    .replace(/^@+/, '')
    .toLowerCase()
}

/** Saved Easetag recipients may omit `payee_easetag` (legacy / fallback insert) but keep `bank_name` like `Easetag (@tag)`. */
export function isEasenetRecipientRecord(r: {
  payee_easetag?: string | null
  bank_name?: string | null
}): boolean {
  if (String(r.payee_easetag || '').trim()) return true
  return /^Easetag\s*\(@/i.test(String(r.bank_name || ''))
}

/** Tag for display / transfers; empty if not an Easenet row. */
/**
 * Saved / draft Easetag rows already carry `payee_account_kind` and display name from lookup or DB —
 * skip repeated public API fetches (see {@link useEasenetRecipientHydration}).
 */
export function shouldSkipEasenetPublicFetch(r: {
  payee_easetag?: string | null
  bank_name?: string | null
  payee_account_kind?: 'business' | 'personal' | null
  full_name?: string | null
  payee_avatar_url?: string | null
}): boolean {
  if (!isEasenetRecipientRecord(r)) return false
  if (!String(r.full_name || '').trim()) return false
  const kind = r.payee_account_kind
  if (kind === 'business' || kind === 'personal') return true
  /** Legacy rows may omit `payee_account_kind` but still have name + avatar from lookup — avoid repeat API calls. */
  return Boolean(String(r.payee_avatar_url || '').trim())
}

export function resolveRecipientEasetagForUi(r: {
  payee_easetag?: string | null
  bank_name?: string | null
}): string {
  const direct = String(r.payee_easetag || '').trim()
  if (direct) return normalizeEasetag(direct)
  const m = String(r.bank_name || '').match(/^Easetag\s*\(@([^)]+)\)/i)
  if (m?.[1]) return normalizeEasetag(m[1])
  return ''
}

export function formatEasenetRecipientSubtitle(
  easetag: string | undefined | null,
  accountKind?: PayeeAccountKind | null,
): string {
  const tag = normalizeEasetag(easetag)
  if (!tag) return ''
  const label = accountKind === 'business' ? 'Business' : 'Personal'
  return `${label} • @${tag}`
}

/** Row: `Label` • `@tag` with bullet vertically centered (matches bank / mobile money `•` pattern). */
export function EasenetSubtitleRow({
  easetag,
  accountKind,
  textStyle,
  gap = 4,
}: {
  easetag: string | undefined | null
  accountKind?: PayeeAccountKind | null
  textStyle: StyleProp<TextStyle>
  /** Horizontal space around the bullet */
  gap?: number
}) {
  const tag = normalizeEasetag(easetag)
  if (!tag) return null
  const label =
    accountKind === 'business' ? 'Business' : accountKind === 'personal' ? 'Personal' : null
  const half = gap / 2
  if (!label) {
    return (
      <Text style={textStyle} numberOfLines={1} ellipsizeMode="tail">
        @{tag}
      </Text>
    )
  }
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', minWidth: 0, alignSelf: 'stretch' }}>
      <Text style={[textStyle, { flexShrink: 1 }]} numberOfLines={1} ellipsizeMode="tail">
        {label}
      </Text>
      <Text style={[textStyle, { flexShrink: 0, paddingHorizontal: half }]}>•</Text>
      <Text style={[textStyle, { flexShrink: 0 }]} numberOfLines={1}>
        @{tag}
      </Text>
    </View>
  )
}

/** `Label • detail` (mobile / bank / wallet) — same bullet rhythm as {@link EasenetSubtitleRow}. */
export function PayoutSubtitleRow({
  left,
  right,
  textStyle,
  gap = 4,
}: {
  left: string
  right: string
  textStyle: StyleProp<TextStyle>
  gap?: number
}) {
  const L = String(left || '').trim()
  const R = String(right || '').trim()
  if (!L && !R) return null
  if (!L) {
    return (
      <Text style={textStyle} numberOfLines={1} ellipsizeMode="tail">
        {R}
      </Text>
    )
  }
  if (!R) {
    return (
      <Text style={textStyle} numberOfLines={1} ellipsizeMode="tail">
        {L}
      </Text>
    )
  }
  const half = gap / 2
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', minWidth: 0, alignSelf: 'stretch' }}>
      <Text style={[textStyle, { flexShrink: 1 }]} numberOfLines={1} ellipsizeMode="tail">
        {L}
      </Text>
      <Text style={[textStyle, { flexShrink: 0, paddingHorizontal: half }]}>•</Text>
      <Text style={[textStyle, { flexShrink: 0 }]} numberOfLines={1} ellipsizeMode="tail">
        {R}
      </Text>
    </View>
  )
}
