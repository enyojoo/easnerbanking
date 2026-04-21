import { Image } from 'react-native'

export function normalizeAvatarUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

export function warmAvatarCache(value: unknown): void {
  const url = normalizeAvatarUrl(value)
  if (!url) return
  Image.prefetch(url).catch(() => undefined)
}
