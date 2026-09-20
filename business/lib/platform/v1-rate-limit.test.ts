import { beforeEach, describe, expect, it, vi } from "vitest"
import { requireMerchant } from "./v1"

const authenticateMerchantKey = vi.hoisted(() => vi.fn())
const consumeApiRateLimit = vi.hoisted(() => vi.fn())

vi.mock("@/lib/checkout/authenticate-merchant-key", () => ({
  authenticateMerchantKey,
  requireScope: (ctx: { scopes: string[] }, scope: string) =>
    ctx.scopes.includes(scope) ? { ok: true as const } : { ok: false as const, status: 403 as const, error: "no" },
}))

vi.mock("@/lib/api/rate-limit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/rate-limit")>()
  return {
    ...actual,
    consumeApiRateLimit,
  }
})

describe("requireMerchant rate limit", () => {
  beforeEach(() => {
    authenticateMerchantKey.mockReset()
    consumeApiRateLimit.mockReset()
    authenticateMerchantKey.mockResolvedValue({
      ok: true,
      ctx: {
        businessId: "biz-1",
        mode: "test",
        keyId: "key-1",
        scopes: ["transfers.write", "accounts.read"],
      },
    })
  })

  it("blocks a merchant write when the business is over budget", async () => {
    consumeApiRateLimit.mockResolvedValue(false)
    const result = await requireMerchant({} as never, new Request("https://api.easner.com/v1/transfers"), "transfers.write")
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.response.status).toBe(429)
    expect(result.response.headers.get("Retry-After")).toBe("60")
    const body = (await result.response.json()) as { error: { type: string; code: string } }
    expect(body.error.type).toBe("rate_limit")
    expect(body.error.code).toBe("rate_limit")
  })

  it("does not add a rate-limit hop on /v1 reads", async () => {
    const result = await requireMerchant({} as never, new Request("https://api.easner.com/v1/accounts"), "accounts.read")
    expect(result.ok).toBe(true)
    expect(consumeApiRateLimit).not.toHaveBeenCalled()
  })
})
