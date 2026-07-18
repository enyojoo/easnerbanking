import { describe, expect, it } from 'vitest'
import {
  SEND_AMOUNT_CONTINUE_CTA,
  SEND_REVIEW_CONFIRM_CTA,
  SEND_REVIEW_CONTINUE_CTA,
} from './send-flow-copy'

describe('send-flow-copy', () => {
  it('uses Continue on amount step', () => {
    expect(SEND_AMOUNT_CONTINUE_CTA).toBe('Continue')
  })

  it('uses Confirm & Send on balance payout review', () => {
    expect(SEND_REVIEW_CONFIRM_CTA).toBe('Confirm & Send')
  })

  it('uses Continue on TLC cross-border review', () => {
    expect(SEND_REVIEW_CONTINUE_CTA).toBe('Continue')
  })
})
