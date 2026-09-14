import { afterEach, describe, expect, it, vi } from "vitest"
import {
  DEFAULT_EMAIL_PROVIDER,
  EMAIL_PROVIDER_SETTING_KEY,
  parseEmailProvider,
} from "./email-provider"
import { clearEmailProviderCache, resolveEmailProvider } from "./resolve-email-provider"

vi.mock("./supabase", () => ({
  createServerClient: vi.fn(),
}))

import { createServerClient } from "./supabase"

function mockSettings(value: string | null, error: { message: string } | null = null) {
  vi.mocked(createServerClient).mockReturnValue({
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({
            data: value == null ? null : { value },
            error,
          }),
        }),
      }),
    }),
  } as never)
}

describe("parseEmailProvider", () => {
  it("uses a stable setting key and SES default", () => {
    expect(EMAIL_PROVIDER_SETTING_KEY).toBe("email_provider")
    expect(DEFAULT_EMAIL_PROVIDER).toBe("ses")
    expect(parseEmailProvider("sendgrid")).toBe("sendgrid")
    expect(parseEmailProvider("bogus")).toBe("ses")
  })
})

describe("resolveEmailProvider", () => {
  afterEach(() => {
    delete process.env.EMAIL_PROVIDER
    clearEmailProviderCache()
    vi.clearAllMocks()
  })

  it("lets EMAIL_PROVIDER env override Office settings", async () => {
    process.env.EMAIL_PROVIDER = "sendgrid"
    mockSettings("ses")
    await expect(resolveEmailProvider()).resolves.toBe("sendgrid")
    expect(createServerClient).not.toHaveBeenCalled()
  })

  it("reads Office system_settings when env is unset", async () => {
    mockSettings("sendgrid")
    await expect(resolveEmailProvider()).resolves.toBe("sendgrid")
    expect(createServerClient).toHaveBeenCalledTimes(1)
  })

  it("defaults to ses when the setting is missing", async () => {
    mockSettings(null)
    await expect(resolveEmailProvider()).resolves.toBe("ses")
  })

  it("caches the Office setting briefly", async () => {
    mockSettings("sendgrid")
    await expect(resolveEmailProvider()).resolves.toBe("sendgrid")
    await expect(resolveEmailProvider()).resolves.toBe("sendgrid")
    expect(createServerClient).toHaveBeenCalledTimes(1)
  })
})
