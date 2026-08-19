import { afterEach, describe, expect, it, vi } from "vitest"
import {
  gridQuoteNeedsRefresh,
  gridQuoteCanReuseOnConfirm,
  resolveGridQuoteExpiresAt,
} from "./config"

describe("gridQuoteNeedsRefresh", () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it("is true when expiry is missing", () => {
    expect(gridQuoteNeedsRefresh(null)).toBe(true)
    expect(gridQuoteNeedsRefresh(undefined)).toBe(true)
  })

  it("is true when 45s or less remain", () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-08-19T13:47:00.000Z"))
    expect(gridQuoteNeedsRefresh("2026-08-19T13:47:44.000Z")).toBe(true)
    expect(gridQuoteNeedsRefresh("2026-08-19T13:47:45.000Z")).toBe(true)
  })

  it("is false when more than 45s remain", () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-08-19T13:47:00.000Z"))
    expect(gridQuoteNeedsRefresh("2026-08-19T13:47:46.000Z")).toBe(false)
  })
})

describe("gridQuoteCanReuseOnConfirm", () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it("reuses a Grid quote with 20s left (inside the execute refresh buffer)", () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-08-19T13:47:00.000Z"))
    expect(gridQuoteCanReuseOnConfirm("2026-08-19T13:47:20.000Z")).toBe(true)
    expect(gridQuoteNeedsRefresh("2026-08-19T13:47:20.000Z")).toBe(true)
  })

  it("does not reuse when 5s or less remain", () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-08-19T13:47:00.000Z"))
    expect(gridQuoteCanReuseOnConfirm("2026-08-19T13:47:05.000Z")).toBe(false)
    expect(gridQuoteCanReuseOnConfirm("2026-08-19T13:47:04.000Z")).toBe(false)
  })
})

describe("resolveGridQuoteExpiresAt", () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it("keeps Grid expiry when it is still in the future", () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-08-19T13:47:00.000Z"))
    expect(resolveGridQuoteExpiresAt("2026-08-19T13:47:54.000Z")).toBe(
      "2026-08-19T13:47:54.000Z",
    )
  })

  it("falls back to the session TTL when Grid expiry is in the past", () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-08-19T13:47:00.000Z"))
    const resolved = resolveGridQuoteExpiresAt("2026-08-19T13:46:00.000Z")
    expect(Date.parse(resolved)).toBeGreaterThan(Date.now())
  })
})
