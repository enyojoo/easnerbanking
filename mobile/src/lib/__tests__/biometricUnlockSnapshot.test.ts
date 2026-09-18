import {
  clearUnlockBiometric,
  peekUnlockBiometric,
  setBiometricUnlockEnabled,
  warmUnlockBiometric,
} from '../biometricUnlock'

describe('unlock biometric snapshot', () => {
  afterEach(() => {
    clearUnlockBiometric()
  })

  it('starts empty', () => {
    expect(peekUnlockBiometric('user-1')).toBeNull()
  })

  it('warms a per-user snapshot and updates enabled', async () => {
    const snap = await warmUnlockBiometric('user-1')
    expect(peekUnlockBiometric('user-1')).toEqual(snap)
    expect(peekUnlockBiometric('user-2')).toBeNull()

    await setBiometricUnlockEnabled('user-1', false)
    expect(peekUnlockBiometric('user-1')?.enabled).toBe(false)
  })
})
