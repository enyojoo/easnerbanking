import { webLinking } from '../src/navigation/linking'
import { parseDeepLinkFromUrl } from '../src/lib/pendingDeepLinkNavigation'

describe('webLinking path parity', () => {
  it('maps dashboard URL consistently with parseDeepLinkFromUrl', () => {
    const parsed = parseDeepLinkFromUrl('https://app.easner.com/user/dashboard')
    expect(parsed?.screen).toBe('Dashboard')
    expect(webLinking.config?.screens?.MainTabs).toBeDefined()
  })

  it('maps transaction detail paths consistently', () => {
    const parsed = parseDeepLinkFromUrl('https://app.easner.com/user/transactions/tx_abc')
    expect(parsed?.screen).toBe('TransactionDetails')
    expect(parsed?.params?.transactionId).toBe('tx_abc')
    expect(webLinking.config?.screens?.TransactionDetails).toBe('user/transactions/:transactionId')
  })
})
