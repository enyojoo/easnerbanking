import { payrollMethodDescription, payrollMethodTitle, type PayrollMethodSummary } from '../types'

function method(patch: Partial<PayrollMethodSummary>): PayrollMethodSummary {
  return {
    id: 'method-1',
    type: 'easetag',
    label: 'Easetag',
    maskedDetails: {},
    preferred: true,
    ...patch,
  }
}

describe('Payroll receiving-method presentation', () => {
  it('uses the product name for Easetag', () => {
    expect(payrollMethodTitle(method({ type: 'easetag' }))).toBe('Easetag')
  })

  it('prefers masked destination details over the generic label', () => {
    expect(
      payrollMethodDescription(
        method({
          type: 'bank',
          label: 'Access Bank',
          maskedDetails: { ending: '••••4921' },
        }),
      ),
    ).toBe('••••4921')
  })

  it('provides an actionable empty state', () => {
    expect(payrollMethodDescription(null)).toBe('Choose where you want to receive payroll')
  })
})
