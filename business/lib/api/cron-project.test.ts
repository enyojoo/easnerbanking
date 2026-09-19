import { afterEach, describe, expect, it, vi } from "vitest"
import { cronJobsEnabledOnThisProject, isScheduledCronPath } from "./cron-project"

describe("cronJobsEnabledOnThisProject", () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it("defaults to enabled so current business keeps running crons", () => {
    vi.stubEnv("EASNER_CRONS_ENABLED", "")
    expect(cronJobsEnabledOnThisProject()).toBe(true)
  })

  it("is off when explicitly disabled (platform / api before cutover)", () => {
    vi.stubEnv("EASNER_CRONS_ENABLED", "false")
    expect(cronJobsEnabledOnThisProject()).toBe(false)
  })
})

describe("isScheduledCronPath", () => {
  it("matches vercel.json cron paths", () => {
    expect(isScheduledCronPath("/api/cron/sync-exchange-rates")).toBe(true)
    expect(isScheduledCronPath("/api/internal/checkout/deliver-webhooks")).toBe(true)
    expect(isScheduledCronPath("/api/business/profile")).toBe(false)
  })
})
