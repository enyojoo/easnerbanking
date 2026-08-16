import { afterEach, beforeEach, describe, expect, it } from "vitest"
import {
  __clearHostedCredentialsMemoryForTests,
  __resetHostedCredentialsCacheForTests,
  hostedCredentialsAreReady,
  readHostedCredentialsCache,
  writeHostedCredentialsCache,
} from "./hosted-verification-credentials"

const BUSINESS_ID = "4afbef7f-0087-49c3-b5d8-7807b37710e9"

function installMemorySessionStorage() {
  const store = new Map<string, string>()
  Object.defineProperty(globalThis, "sessionStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value)
      },
      removeItem: (key: string) => {
        store.delete(key)
      },
      get length() {
        return store.size
      },
      key: (index: number) => [...store.keys()][index] ?? null,
    },
  })
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: globalThis,
  })
}

describe("hosted verification credentials persist", () => {
  beforeEach(() => {
    installMemorySessionStorage()
  })

  afterEach(() => {
    __resetHostedCredentialsCacheForTests()
  })

  it("rehydrates a still-valid token after the in-memory cache is cleared", () => {
    writeHostedCredentialsCache(BUSINESS_ID, {
      link: "https://sumsub.example/kyb",
      token: "sumsub-access-token",
      expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    })
    __clearHostedCredentialsMemoryForTests()

    const cached = readHostedCredentialsCache(BUSINESS_ID)
    expect(hostedCredentialsAreReady(cached)).toBe(true)
    expect(cached.token).toBe("sumsub-access-token")
  })

  it("ignores an expired persisted token", () => {
    writeHostedCredentialsCache(BUSINESS_ID, {
      link: "https://sumsub.example/kyb",
      token: "expired-token",
      expiresAt: new Date(Date.now() - 60_000).toISOString(),
    })

    const cached = readHostedCredentialsCache(BUSINESS_ID)
    expect(hostedCredentialsAreReady(cached)).toBe(false)
  })
})
