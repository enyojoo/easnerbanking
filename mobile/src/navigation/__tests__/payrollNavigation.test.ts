import { getScreenTransitionEntry } from '../screenTransitionRegistry'

describe('Payroll navigation transitions', () => {
  it('treats the connections hub as a stack entry from More', () => {
    expect(getScreenTransitionEntry('PayrollConnections')).toEqual({
      intent: 'stackEntry',
    })
  })

  it('uses detail transitions for invitation and connection drill-downs', () => {
    expect(getScreenTransitionEntry('PayrollConnectionDetail')?.intent).toBe('detail')
    expect(getScreenTransitionEntry('PayrollInvitation')?.intent).toBe('detail')
  })

  it('keeps receiving-method setup as a flow step', () => {
    expect(getScreenTransitionEntry('PayrollReceivingMethod')?.intent).toBe('flowStep')
  })
})
