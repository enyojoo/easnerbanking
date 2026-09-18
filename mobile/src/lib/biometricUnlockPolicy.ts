export type BiometricKind = 'face' | 'fingerprint' | 'iris'

export type BiometricAvailability = {
  available: boolean
  kind: BiometricKind | null
  /** False when iOS has not reported Face ID/Touch ID types yet — show the button, do not auto-prompt. */
  autoPrompt: boolean
}

export const UNAVAILABLE_BIOMETRIC: BiometricAvailability = {
  available: false,
  kind: null,
  autoPrompt: false,
}

/**
 * iOS: Face ID if present, else Touch ID. If types are empty but biometrics
 * are enrolled, default to Face ID (supportedAuthenticationTypes can be empty
 * before the first Face ID prompt).
 * Android: Class 3 only (fingerprint, iris, or strong face). Weak 2D camera
 * face is excluded so unlock and send confirm stay at the same bar as iOS.
 */
export function pickUnlockBiometric(input: {
  platform: 'ios' | 'android' | 'web'
  strongEnrolled: boolean
  fingerprint: boolean
  face: boolean
  iris: boolean
}): BiometricAvailability {
  if (input.platform === 'web' || !input.strongEnrolled) {
    return UNAVAILABLE_BIOMETRIC
  }
  if (input.platform === 'ios') {
    if (input.face) return { available: true, kind: 'face', autoPrompt: true }
    if (input.fingerprint) return { available: true, kind: 'fingerprint', autoPrompt: true }
    return { available: true, kind: 'face', autoPrompt: false }
  }
  if (input.fingerprint) return { available: true, kind: 'fingerprint', autoPrompt: true }
  if (input.iris) return { available: true, kind: 'iris', autoPrompt: true }
  if (input.face) return { available: true, kind: 'face', autoPrompt: true }
  return UNAVAILABLE_BIOMETRIC
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
  return `Unlock with ${label}`
}
