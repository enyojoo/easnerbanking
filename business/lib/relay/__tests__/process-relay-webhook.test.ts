import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  relayGetRequestV3: vi.fn(),
  settleConvert: vi.fn(),
  reconcileWalletSend: vi.fn(),
  syncDeposit: vi.fn(),
}))

vi.mock("@/lib/relay/client", () => ({
  relayGetRequestV3: mocks.relayGetRequestV3,
}))
vi.mock("@/lib/relay/config", () => ({
  isRelayConfigured: () => true,
}))
vi.mock("@/lib/balance-convert/settle-convert", () => ({
  settleBalanceConvertByRelayRequestId: mocks.settleConvert,
}))
vi.mock("@/lib/wallet-send/settle-relay-wallet-send", () => ({
  reconcileRelayWalletSendByRequestId: mocks.reconcileWalletSend,
}))
vi.mock("@/lib/relay-deposit/settle-relay-deposit", () => ({
  syncRelayDepositFromRequestId: mocks.syncDeposit,
}))

import { processRelayWebhookEvent } from "../process-relay-webhook"

function adminWithTables(tables: Record<string, unknown>) {
  return {
    from(table: string) {
      const spec = tables[table]
      if (typeof spec === "function") return spec()
      return spec
    },
  } as never
}

describe("processRelayWebhookEvent", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.relayGetRequestV3.mockResolvedValue({ id: "req-1", status: "success" })
    mocks.settleConvert.mockResolvedValue({ settled: false, action: "no_pending_convert_session" })
    mocks.reconcileWalletSend.mockResolvedValue({ patched: false, action: "no_pending_wallet_send" })
    mocks.syncDeposit.mockResolvedValue({ ok: true, action: "awaiting_turnkey" })
  })

  it("routes to balance convert when executed session exists", async () => {
    mocks.settleConvert.mockResolvedValueOnce({ settled: true, action: "convert_settled" })
    const admin = adminWithTables({
      balance_convert_sessions: {
        select: () => ({
          eq: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: { id: "conv-1" }, error: null }),
            }),
          }),
        }),
      },
      transactions: {
        select: () => ({
          eq: () => ({
            eq: () => ({
              contains: () => ({
                limit: async () => ({ data: [], error: null }),
              }),
            }),
          }),
        }),
      },
    })

    const result = await processRelayWebhookEvent(admin, { requestId: "req-1" })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.flow).toBe("balance_convert")
      expect(result.action).toBe("convert_settled")
    }
  })

  it("routes to wallet send when pending ledger row exists", async () => {
    mocks.reconcileWalletSend.mockResolvedValueOnce({ patched: true, action: "wallet_send_settled" })
    const admin = adminWithTables({
      balance_convert_sessions: {
        select: () => ({
          eq: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: null, error: null }),
            }),
          }),
        }),
      },
      transactions: {
        select: () => ({
          eq: () => ({
            eq: () => ({
              contains: () => ({
                limit: async () => ({ data: [{ id: "tx-1" }], error: null }),
              }),
            }),
          }),
        }),
      },
    })

    const result = await processRelayWebhookEvent(admin, { requestId: "req-1" })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.flow).toBe("wallet_send")
      expect(result.action).toBe("wallet_send_settled")
    }
  })

  it("routes to tron deposit for known deposit address", async () => {
    const admin = adminWithTables({
      balance_convert_sessions: {
        select: () => ({
          eq: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: null, error: null }),
            }),
          }),
        }),
      },
      transactions: {
        select: () => ({
          eq: () => ({
            eq: () => ({
              contains: () => ({
                limit: async () => ({ data: [], error: null }),
              }),
            }),
          }),
        }),
      },
      relay_deposit_addresses: {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: { id: "addr-1" }, error: null }),
          }),
        }),
      },
    })

    const result = await processRelayWebhookEvent(admin, {
      requestId: "req-1",
      depositAddress: "T123",
    })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.flow).toBe("tron_deposit")
    }
    expect(mocks.syncDeposit).toHaveBeenCalled()
  })
})
