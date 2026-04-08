import { View, Text, type StyleProp, type TextStyle } from 'react-native'
import type { PayeeAccountKind } from './easnerBrand'

function normalizeEasetag(easetag: string | undefined | null): string {
  return String(easetag || '')
    .trim()
    .replace(/^@+/, '')
    .toLowerCase()
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
  const label = accountKind === 'business' ? 'Business' : 'Personal'
  const half = gap / 2
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
