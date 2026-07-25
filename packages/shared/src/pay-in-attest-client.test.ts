import { describe, expect, it, vi } from "vitest"
import { attestPayInPayment } from "./pay-in-attest-client"

describe("attestPayInPayment", () => {
  it("routes Yellowcard attest to YC endpoint", async () => {
    const fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ok: true, attestedAt: "2026-01-01T00:00:00.000Z" }),
    })

    const result = await attestPayInPayment({
      provider: "yellowcard",
      transactionId: "ETID123",
      transferId: "yc-transfer-1",
      fetch,
    })

    expect(fetch).toHaveBeenCalledWith(
      "/api/yellowcard/pay-in/attest",
      expect.objectContaining({ method: "POST" }),
    )
    expect(result.attestedAt).toBe("2026-01-01T00:00:00.000Z")
  })

  it("routes Grid attest to Grid ack endpoint", async () => {
    const fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ok: true, attestedAt: "2026-01-02T00:00:00.000Z" }),
    })

    await attestPayInPayment({
      provider: "grid",
      transactionId: "ETID456",
      transferId: "grid-transfer-1",
      fetch,
    })

    expect(fetch).toHaveBeenCalledWith("/api/grid/pay-in/ack", expect.any(Object))
  })
})
