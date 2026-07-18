import { describe, expect, it } from 'vitest'
import {
  YC_PAY_IN_BANK_COMPLETE_CTA,
  YC_PAY_IN_CONTINUE_CTA,
  YC_PAY_IN_MOMO_AUTHORIZE_CTA,
  YC_PAY_IN_SEND_EXACTLY_LABEL,
  ycPayInCompleteCta,
  ycPayInCompleteNotice,
  ycPayInInstructionNotice,
  ycPayInMomoAuthorizeNotice,
  ycPayInSendingExactlyCopy,
} from './yc-pay-in-copy'

describe('ycPayInInstructionNotice', () => {
  it('returns bank transfer copy', () => {
    expect(ycPayInInstructionNotice('bank_transfer')).toBe(
      'Use the payment details to complete transfer.',
    )
  })

  it('returns mobile money copy', () => {
    expect(ycPayInInstructionNotice('mobile_money')).toBe(
      'Click authorize, check your phone and approve the payment prompt.',
    )
  })
})

describe('ycPayInCompleteNotice', () => {
  it('returns bank transfer copy on complete deposit', () => {
    expect(ycPayInCompleteNotice('bank_transfer')).toBe(
      'Use the payment details to complete transfer.',
    )
  })

  it('returns MoMo authorize notice on complete deposit', () => {
    expect(ycPayInCompleteNotice('mobile_money')).toBe(
      'Click authorize, check your phone and approve the payment prompt.',
    )
  })
})

describe('ycPayInMomoAuthorizeNotice', () => {
  it('returns MoMo authorize screen notice', () => {
    expect(ycPayInMomoAuthorizeNotice()).toBe(
      'Click authorize, check your phone and approve the payment prompt.',
    )
  })
})

describe('YC_PAY_IN_MOMO_AUTHORIZE_CTA', () => {
  it('is Authorize payment', () => {
    expect(YC_PAY_IN_MOMO_AUTHORIZE_CTA).toBe('Authorize payment')
  })
})

describe('YC_PAY_IN_CONTINUE_CTA', () => {
  it('is Continue', () => {
    expect(YC_PAY_IN_CONTINUE_CTA).toBe('Continue')
  })
})

describe('YC_PAY_IN_BANK_COMPLETE_CTA', () => {
  it("is I've made the payment", () => {
    expect(YC_PAY_IN_BANK_COMPLETE_CTA).toBe("I've made the payment")
  })
})

describe('ycPayInCompleteCta', () => {
  it('returns MoMo authorize CTA for mobile money', () => {
    expect(ycPayInCompleteCta('mobile_money')).toBe(YC_PAY_IN_MOMO_AUTHORIZE_CTA)
  })

  it('returns bank complete CTA for bank transfer', () => {
    expect(ycPayInCompleteCta('bank_transfer')).toBe(YC_PAY_IN_BANK_COMPLETE_CTA)
  })
})

describe('ycPayInSendingExactlyCopy', () => {
  it('combines label and formatted amount', () => {
    expect(ycPayInSendingExactlyCopy('₦50,000.00')).toBe(
      `${YC_PAY_IN_SEND_EXACTLY_LABEL} ₦50,000.00`,
    )
  })
})
