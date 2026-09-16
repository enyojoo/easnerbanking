export type BiometricKind = 'face' | 'fingerprint' | 'iris'

export type BiometricAvailability = {
  available: boolean
  kind: BiometricKind | null
}

/**
 * iOS: Face ID if present, else Touch ID.
 * Android: fingerprint first (Class 3), then iris, then strong face.
 * Weak 2D Android face unlock is excluded by `strongEnrolled`.
 */
export function pickUnlockBiometric(input: {
  platform: 'ios' | 'android' | 'web'
  strongEnrolled: boolean
  fingerprint: boolean
  face: boolean
  iris: boolean
}): BiometricAvailability {
  if (input.platform === 'web' || !input.strongEnrolled) {
    return { available: false, kind: null }
  }
  if (input.platform === 'ios') {
    if (input.face) return { available: true, kind: 'face' }
    if (input.fingerprint) return { available: true, kind: 'fingerprint' }
    return { available: false, kind: null }
  }
  if (input.fingerprint) return { available: true, kind: 'fingerprint' }
  if (input.iris) return { available: true, kind: 'iris' }
  if (input.face) return { available: true, kind: 'face' }
  return { available: false, kind: null }
}

export function biometricUnlockTitle(
  platform: 'ios' | 'android' | 'web',
  kind: BiometricKind | null,
): string {
  if (kind === 'face') return platform === 'ios' ? 'Face ID' : 'Face unlock'
  if (kind === 'fingerprint') return platform === 'ios' ? 'Touch ID' : 'Fingerprint'
  if (kind === 'iris') return 'Iris unlock'
  return 'Biometric unlock'
}

export type BiometricPromptPurpose = 'unlock' | 'confirm' | 'enable'

export function biometricPromptMessage(
  platform: 'ios' | 'android' | 'web',
  kind: BiometricKind | null,
  purpose: BiometricPromptPurpose,
): string {
  const label = biometricUnlockTitle(platform, kind)
  if (purpose === 'confirm') return `Confirm with ${label}`
  if (purpose === 'enable') return `Use ${label} to unlock and confirm payments`
  return `Unlock Easner with ${label}`
}
