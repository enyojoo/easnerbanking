import { describe, expect, it, vi, beforeEach } from "vitest"

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdmin: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: {
                id: "rec-1",
                currency: "NGN",
                country_code: "NG",
                bank_name: "GTBank",
                account_number: "0123456789",
                full_name: "Jane Doe",
              },
            }),
          }),
        }),
      }),
    }),
  }),
}))

vi.mock("@/lib/fx/noah-rates", () => ({
  listNoahRates: vi.fn(async () => [
    {
      source_currency: "USD",
      destination_currency: "NGN",
      rate: 1335,
      noah_mid: 1340,
      status: "active",
    },
  ]),
  findNoahRate: vi.fn((_rows: unknown[], source: string, dest: string) => {
    if (source === "USD" && dest === "NGN") {
      return { rate: 1335, noah_mid: 1340 }
    }
    return null
  }),
}))

vi.mock("@/lib/payout-providers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/payout-providers")>()
  return {
    ...actual,
    selectProviderForCorridor: vi.fn(async () => ({ id: "noah" })),
  }
})

vi.mock("@/lib/terminal/recipient-sell-prepare", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/terminal/recipient-sell-prepare")>()
  return {
    ...actual,
    prepareSellFromRecipientRow: vi.fn(async () => {
      throw new Error("prepare should not run on DB preview")
    }),
  }
})

describe("buildNoahBalancePayoutPreview", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("returns preview from noah_rates without calling Noah prepare", async () => {
    const { buildNoahBalancePayoutPreview } = await import("@/lib/noah/payout-quote")
    const { prepareSellFromRecipientRow } = await import("@/lib/terminal/recipient-sell-prepare")

    const quote = await buildNoahBalancePayoutPreview({
      userId: "user-1",
      noahCustomerId: "cust-1",
      recipientId: "rec-1",
      receiveFiatAmount: 6677,
      sourceBalanceCurrency: "USD",
      amountEntryMode: "receive",
    })

    expect(prepareSellFromRecipientRow).not.toHaveBeenCalled()
    expect(quote.provider).toBe("noah")
    expect(quote.quotePhase).toBe("preview")
    expect(quote.requiresConfirm).toBe(true)
    expect(quote.settlement.sessionId).toMatch(/^noah_preview_/)
    expect(quote.easner.providerRate).toBe(1335)
    expect(quote.receiveAmount).toBe(6677)
    expect(quote.totalDebited).toBeGreaterThan(quote.customerPrincipal)
  })
})
