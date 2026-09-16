/** Parse `major.minor` or `major.minor.patch`. Invalid input returns null (fail open). */
export function parseAppVersionParts(raw: string | null | undefined): [number, number, number] | null {
  const trimmed = String(raw ?? '').trim()
  if (!trimmed) return null
  const parts = trimmed.split('.')
  if (parts.length < 2 || parts.length > 3) return null
  const nums = parts.map((part) => {
    if (!/^\d+$/.test(part)) return NaN
    return Number(part)
  })
  if (nums.some((n) => !Number.isFinite(n))) return null
  return [nums[0]!, nums[1]!, nums[2] ?? 0]
}

export function isValidMinNativeVersion(raw: string): boolean {
  const trimmed = raw.trim()
  return trimmed === '' || parseAppVersionParts(trimmed) != null
}

/** True when the installed native version is strictly below the required minimum. */
export function isNativeVersionBelowMin(
  current: string | null | undefined,
  min: string | null | undefined,
): boolean {
  const currentParts = parseAppVersionParts(current)
  const minParts = parseAppVersionParts(min)
  if (!currentParts || !minParts) return false
  for (let i = 0; i < 3; i++) {
    if (currentParts[i]! < minParts[i]!) return true
    if (currentParts[i]! > minParts[i]!) return false
  }
  return false
}
