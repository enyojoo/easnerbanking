import {
  pickUnlockBiometric,
  biometricUnlockTitle,
  biometricPromptMessage,
} from '../biometricUnlockPolicy'

describe('pickUnlockBiometric', () => {
  it('uses Face ID on iOS when face hardware is present', () => {
    expect(
      pickUnlockBiometric({
        platform: 'ios',
        strongEnrolled: true,
        fingerprint: true,
        face: true,
        iris: false,
      }),
    ).toEqual({ available: true, kind: 'face' })
  })

  it('uses Touch ID on older iPhones', () => {
    expect(
      pickUnlockBiometric({
        platform: 'ios',
        strongEnrolled: true,
        fingerprint: true,
        face: false,
        iris: false,
      }),
    ).toEqual({ available: true, kind: 'fingerprint' })
  })

  it('prefers fingerprint over face on Android', () => {
    expect(
      pickUnlockBiometric({
        platform: 'android',
        strongEnrolled: true,
        fingerprint: true,
        face: true,
        iris: false,
      }),
    ).toEqual({ available: true, kind: 'fingerprint' })
  })

  it('rejects weak Android face when strong biometrics are not enrolled', () => {
    expect(
      pickUnlockBiometric({
        platform: 'android',
        strongEnrolled: false,
        fingerprint: false,
        face: true,
        iris: false,
      }),
    ).toEqual({ available: false, kind: null })
  })

  it('labels Face ID vs Fingerprint for settings copy', () => {
    expect(biometricUnlockTitle('ios', 'face')).toBe('Face ID')
    expect(biometricUnlockTitle('ios', 'fingerprint')).toBe('Touch ID')
    expect(biometricUnlockTitle('android', 'fingerprint')).toBe('Fingerprint')
    expect(biometricUnlockTitle('android', 'face')).toBe('Face unlock')
  })

  it('uses Face ID as a PIN shortcut for unlock, send, and first-time enable', () => {
    expect(biometricPromptMessage('ios', 'face', 'unlock')).toBe('Unlock Easner with Face ID')
    expect(biometricPromptMessage('ios', 'face', 'confirm')).toBe('Confirm with Face ID')
    expect(biometricPromptMessage('ios', 'face', 'enable')).toBe(
      'Use Face ID to unlock and confirm payments',
    )
    expect(biometricPromptMessage('android', 'fingerprint', 'confirm')).toBe('Confirm with Fingerprint')
  })
})
