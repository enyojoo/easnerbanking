import { prefetchImageUri, prefetchImageUris, warmImageCache } from './imageCache'

const AVATAR_CACHE_TTL_DAYS = 30
const AVATAR_CACHE_TTL_MS = AVATAR_CACHE_TTL_DAYS * 24 * 60 * 60 * 1000

function avatarCacheBucket(nowMs: number = Date.now()): string {
  return String(Math.floor(nowMs / AVATAR_CACHE_TTL_MS))
}

function applyAvatarVersionParam(url: string, version: string): string {
  try {
    const parsed = new URL(url)
    parsed.searchParams.set('av', version)
    return parsed.toString()
  } catch {
    const [base, hash = ''] = url.split('#', 2)
    const sep = base.includes('?') ? '&' : '?'
    return `${base}${sep}av=${encodeURIComponent(version)}${hash ? `#${hash}` : ''}`
  }
}

export function normalizeAvatarUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (trimmed.length === 0) return null
  // Keep avatar URLs stable for 30 days (cache bucket) unless a specific
  // version already exists (e.g. freshly uploaded photo with explicit bust key).
  if (/([?&])av=/.test(trimmed)) return trimmed
  return applyAvatarVersionParam(trimmed, avatarCacheBucket())
}

/** Normalized avatar URI for expo-image / prefetch. */
export function avatarImageUri(value: unknown): string | null {
  return normalizeAvatarUrl(value)
}

/** @deprecated Prefer {@link avatarImageUri} + {@link AvatarImage} / {@link CachedImage}. */
export function avatarImageSource(value: unknown): { uri: string } | null {
  const uri = avatarImageUri(value)
  if (!uri) return null
  return { uri }
}

/** Force refresh immediately after user changes profile photo. */
export function bustAvatarUrl(value: unknown, version: string = String(Date.now())): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed) return null
  return applyAvatarVersionParam(trimmed, version)
}

/** Prefetch into expo-image disk cache (PIN, dashboard, More, etc.). */
export function warmAvatarCache(value: unknown): void {
  warmImageCache(avatarImageUri(value))
}

export async function warmAvatarCacheAsync(value: unknown): Promise<void> {
  await prefetchImageUri(avatarImageUri(value))
}

export async function warmAvatarCaches(values: Iterable<unknown>): Promise<void> {
  await prefetchImageUris(
    [...values].map((v) => avatarImageUri(v)).filter((u): u is string => Boolean(u)),
  )
}
