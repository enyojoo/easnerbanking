import { afterEach, describe, expect, it, vi } from "vitest"
import { resolveBusinessSyncPollMs } from "./use-business-sync"

describe("useBusinessSync poll intervals", () => {
  const originalWindow = globalThis.window

  afterEach(() => {
    vi.stubGlobal("window", originalWindow)
  })

  it("polls faster when KYB is in review", () => {
    expect(
      resolveBusinessSyncPollMs({ tier1Complete: false, verificationStatus: "pending" }),
    ).toBe(30_000)
    expect(
      resolveBusinessSyncPollMs({ tier1Complete: false, verificationStatus: "in_progress" }),
    ).toBe(60_000)
  })

  it("polls fastest on verification settings tab while in review", () => {
    vi.stubGlobal("window", {
      location: { search: "?tab=verification" },
    })
    expect(
      resolveBusinessSyncPollMs({ tier1Complete: false, verificationStatus: "pending" }),
    ).toBe(15_000)
  })

  it("polls fastest while approved accounts provision", () => {
    expect(resolveBusinessSyncPollMs({ tier1Complete: true, verificationStatus: "approved" })).toBe(
      10_000,
    )
  })
})
