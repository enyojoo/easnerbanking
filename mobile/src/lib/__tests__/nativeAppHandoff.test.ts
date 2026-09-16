import { nativeAppUrlFromHttpsPath, shouldHandoffHttpsToNativeApp } from '../nativeAppHandoff'

describe('nativeAppHandoff', () => {
  it('builds a custom-scheme URL that pendingDeepLinkNavigation already accepts', () => {
    expect(nativeAppUrlFromHttpsPath('/user/transactions/ETID95804250')).toBe(
      'easner://user/transactions/ETID95804250',
    )
  })

  it('handoffs transaction email paths on mobile even without an SES referrer', () => {
    expect(
      shouldHandoffHttpsToNativeApp({
        pathname: '/user/transactions/ETID95804250',
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)',
      }),
    ).toBe(true)
  })

  it('handoffs when SES click tracking was the previous hop', () => {
    expect(
      shouldHandoffHttpsToNativeApp({
        pathname: '/user/dashboard',
        referrer: 'https://s647vvl1.r.eu-west-2.awstrack.me/L0/https:%2F%2Fapp.easner.com%2Fuser%2Fdashboard/1',
        userAgent: 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36',
      }),
    ).toBe(true)
  })

  it('does not hijack a normal mobile web visit to the dashboard', () => {
    expect(
      shouldHandoffHttpsToNativeApp({
        pathname: '/user/dashboard',
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)',
      }),
    ).toBe(false)
  })

  it('does not hijack desktop or in-browser web with ?web=1', () => {
    expect(
      shouldHandoffHttpsToNativeApp({
        pathname: '/user/transactions/ETID1',
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
      }),
    ).toBe(false)
    expect(
      shouldHandoffHttpsToNativeApp({
        pathname: '/user/transactions/ETID1',
        search: '?web=1',
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)',
      }),
    ).toBe(false)
  })
})
