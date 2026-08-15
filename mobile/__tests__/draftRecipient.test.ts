import { describe, expect, it } from '@jest/globals'
import { isDraftRecipientId } from '@easner/shared'
import { buildDraftRecipient } from '../src/lib/draftRecipient'

describe('buildDraftRecipient', () => {
  it('builds stable draft id for bank recipients', () => {
    const draft = buildDraftRecipient(
      'user-1',
      {
        fullName: 'Jane Doe',
        accountNumber: '12345678',
        bankName: 'Chase',
        currency: 'USD',
        countryCode: 'US',
        routingNumber: '021000021',
      },
      'bank',
    )
    expect(isDraftRecipientId(draft.id)).toBe(true)
    expect(draft.id).toMatch(/^draft_/)
    expect(draft.full_name).toBe('Jane Doe')
  })

  it('builds easenet draft with draft_easenet prefix', () => {
    const draft = buildDraftRecipient(
      'user-1',
      {
        fullName: 'Alice',
        accountNumber: 'alice',
        bankName: 'Easetag (@alice)',
        currency: 'USD',
      },
      'easenet',
    )
    expect(draft.id).toMatch(/^draft_easenet:/)
    expect(isDraftRecipientId(draft.id)).toBe(true)
  })
})
