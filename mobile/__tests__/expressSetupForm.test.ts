import {
  applyExpressFormDraft,
  mergeExpressForm,
} from '../src/lib/expressSetupForm'
import { seedExpressSetupForm } from '../src/lib/expressSetupFormDraft'

describe('express setup form draft', () => {
  it('lets a saved draft win over empty profile fields', () => {
    const merged = applyExpressFormDraft(
      { given_name: 'Ada', line1: '', ssn: '123456789' },
      { given_name: 'Grace', line1: '1 Main', ssn: '000000000' },
    )
    expect(merged.given_name).toBe('Grace')
    expect(merged.line1).toBe('1 Main')
    expect(merged.ssn).toBe('123456789')
  })

  it('fills blanks from prefill without overwriting typed values', () => {
    expect(
      mergeExpressForm({ city: 'Boston', line1: '' }, { city: 'Austin', line1: '1 Main' }),
    ).toEqual({ city: 'Boston', line1: '1 Main' })
  })

  it('seeds from an in-memory draft', () => {
    expect(seedExpressSetupForm({ city: '' }, { city: 'Boston' }).city).toBe('Boston')
  })
})
