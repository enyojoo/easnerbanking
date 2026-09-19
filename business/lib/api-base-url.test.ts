import { afterEach, describe, expect, it, vi } from "vitest"
import { apiUrl, getApiBaseUrl, resolveApiRequestInput } from "./api-base-url"

describe("getApiBaseUrl", () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it("uses NEXT_PUBLIC_API_URL when set", () => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", "https://api.easner.com/")
    expect(getApiBaseUrl()).toBe("https://api.easner.com")
  })

  it("falls back to the local api port when unset", () => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", "")
    vi.stubEnv("NODE_ENV", "development")
    expect(getApiBaseUrl()).toBe("http://localhost:3002")
  })

  it("falls back to api.easner.com in production when unset", () => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", "")
    vi.stubEnv("NODE_ENV", "production")
    expect(getApiBaseUrl()).toBe("https://api.easner.com")
  })
})

describe("apiUrl / resolveApiRequestInput", () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it("prefixes relative API paths with the API origin", () => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", "https://api.easner.com")
    expect(apiUrl("/api/business/profile")).toBe("https://api.easner.com/api/business/profile")
    expect(resolveApiRequestInput("/api/wallets")).toBe("https://api.easner.com/api/wallets")
  })

  it("leaves absolute URLs unchanged", () => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", "https://api.easner.com")
    expect(apiUrl("https://pay.easner.com/api/x")).toBe("https://pay.easner.com/api/x")
    expect(resolveApiRequestInput("https://api.easner.com/v1/checkout")).toBe(
      "https://api.easner.com/v1/checkout",
    )
  })
})
