import {
  FOREGROUND_BACKGROUND_THRESHOLD_MS,
  shouldRefreshOnForeground,
} from '../src/query/foreground-refresh'

describe('shouldRefreshOnForeground', () => {
  it('refreshes when app was backgrounded longer than threshold even if realtime is healthy', () => {
    const now = 100_000
    expect(
      shouldRefreshOnForeground({
        lastBackgroundAt: now - FOREGROUND_BACKGROUND_THRESHOLD_MS - 1,
        nowMs: now,
        realtimeHealth: { subscribed: true, lastEventAt: now - 1_000, lastError: null },
        hasStaleOperationalQueries: false,
      }),
    ).toBe(true)
  })

  it('refreshes when operational queries are stale', () => {
    expect(
      shouldRefreshOnForeground({
        lastBackgroundAt: null,
        nowMs: 100_000,
        realtimeHealth: { subscribed: true, lastEventAt: 99_000, lastError: null },
        hasStaleOperationalQueries: true,
      }),
    ).toBe(true)
  })

  it('refreshes when realtime is unhealthy', () => {
    expect(
      shouldRefreshOnForeground({
        lastBackgroundAt: null,
        nowMs: 100_000,
        realtimeHealth: { subscribed: false, lastEventAt: null, lastError: 'disconnected' },
        hasStaleOperationalQueries: false,
      }),
    ).toBe(true)
  })

  it('skips refresh when recently foregrounded with healthy realtime and fresh data', () => {
    const now = Date.now()
    expect(
      shouldRefreshOnForeground({
        lastBackgroundAt: now - 1_000,
        nowMs: now,
        realtimeHealth: { subscribed: true, lastEventAt: now - 500, lastError: null },
        hasStaleOperationalQueries: false,
      }),
    ).toBe(false)
  })
})
