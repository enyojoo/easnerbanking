jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
)

import AsyncStorage from '@react-native-async-storage/async-storage'
import {
  loadPayrollActivityVisible,
  markPayrollActivityVisible,
  peekPayrollActivityVisible,
} from '../payrollActivityVisibility'

describe('payroll activity visibility', () => {
  beforeEach(async () => {
    await AsyncStorage.clear()
    jest.clearAllMocks()
  })

  it('keeps Payroll hidden when the user has never had activity', async () => {
    const userId = 'never-active-user'

    expect(peekPayrollActivityVisible(userId)).toBe(false)
    await expect(loadPayrollActivityVisible(userId)).resolves.toBe(false)
    expect(peekPayrollActivityVisible(userId)).toBe(false)
  })

  it('restores a positive visibility result from per-user storage', async () => {
    const userId = 'returning-payroll-user'
    await AsyncStorage.setItem(`easner_payroll_activity_visible_v1_${userId}`, '1')

    await expect(loadPayrollActivityVisible(userId)).resolves.toBe(true)
    expect(peekPayrollActivityVisible(userId)).toBe(true)
  })

  it('makes visibility monotonic even when the storage write fails', async () => {
    const userId = 'storage-failure-user'
    jest.spyOn(AsyncStorage, 'setItem').mockRejectedValueOnce(new Error('storage unavailable'))

    await expect(markPayrollActivityVisible(userId)).resolves.toBeUndefined()
    expect(peekPayrollActivityVisible(userId)).toBe(true)
  })

  it('does not leak visibility between signed-in users', async () => {
    await markPayrollActivityVisible('payroll-user')

    expect(peekPayrollActivityVisible('payroll-user')).toBe(true)
    expect(peekPayrollActivityVisible('different-user')).toBe(false)
  })
})
