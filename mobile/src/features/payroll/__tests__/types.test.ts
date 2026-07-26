import { payrollMethodDescription, payrollMethodTitle, type PayrollMethodSummary } from '../types'

function method(patch: Partial<PayrollMethodSummary>): PayrollMethodSummary {
  return {
    id: 'method-1',
    type: 'easetag',
    label: 'Easetag',
    details: { easetag: '@amina' },
    preferred: true,
    ...patch,
  }
}

describe('Payroll receiving-method presentation', () => {
  it('uses the product name for Easetag', () => {
    expect(payrollMethodTitle(method({ type: 'easetag' }))).toBe('Easetag')
  })

  it('shows the saved destination details instead of a masked database summary', () => {
    expect(
      payrollMethodDescription(
        method({
          type: 'bank',
          label: 'Access Bank',
          details: { accountNumber: '12344921', currency: 'USD' },
        }),
      ),
    ).toBe('12344921 · USD')
  })

  it('provides an actionable empty state', () => {
    expect(payrollMethodDescription(null)).toBe('Choose where you want to receive payroll')
  })
})
