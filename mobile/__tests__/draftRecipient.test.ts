import { describe, expect, it } from '@jest/globals'
import { isDraftRecipientId } from '@easner/shared'
import { buildDraftRecipient } from '../src/lib/draftRecipient'
import { recipientDataFromDraft } from '../src/lib/resolveDraftRecipient'

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

  it('rebuilds an easenet save payload from a hub draft', () => {
    const draft = buildDraftRecipient(
      'user-1',
      {
        fullName: 'Alice',
        accountNumber: 'alice',
        bankName: 'Easetag (@alice)',
        currency: 'USD',
        payeeAvatarUrl: 'https://example.com/a.png',
        payeeAccountKind: 'personal',
      },
      'easenet',
    )
    expect(recipientDataFromDraft(draft)).toMatchObject({
      fullName: 'Alice',
      accountNumber: 'alice',
      currency: 'USD',
      countryCode: 'US',
    })
  })
})
