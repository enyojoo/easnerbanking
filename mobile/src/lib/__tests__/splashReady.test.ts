import { markSplashReady, resetSplashReadyForTests, waitForSplashReady } from '../splashReady'

describe('splashReady', () => {
  afterEach(() => {
    resetSplashReadyForTests(false)
  })

  it('resolves immediately after splash is marked ready', async () => {
    resetSplashReadyForTests(false)
    markSplashReady()
    await waitForSplashReady()
  })

  it('waits until splash is marked ready', async () => {
    resetSplashReadyForTests(false)
    let released = false
    const pending = waitForSplashReady().then(() => {
      released = true
    })
    expect(released).toBe(false)
    markSplashReady()
    await pending
    expect(released).toBe(true)
  })
})
