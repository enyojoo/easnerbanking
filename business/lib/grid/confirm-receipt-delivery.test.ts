import { describe, expect, it, vi, beforeEach } from "vitest"

const mockGridFetch = vi.fn()

vi.mock("./http", () => ({
  gridFetch: (...args: unknown[]) => mockGridFetch(...args),
}))

import { confirmGridReceiptDelivery } from "./confirm-receipt-delivery"

describe("confirmGridReceiptDelivery", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("skips when already confirmed in metadata", async () => {
    const update = vi.fn()
    const admin = {
      from: vi.fn(() => ({ update })),
    }

    const result = await confirmGridReceiptDelivery({
      admin: admin as never,
      ledgerTransactionId: "tx-1",
      gridTransactionId: "Transaction:abc",
      metadata: { grid_receipt_delivered_at: "2026-08-01T00:00:00Z" },
    })

    expect(result).toEqual({ confirmed: false, skipped: true })
    expect(mockGridFetch).not.toHaveBeenCalled()
    expect(update).not.toHaveBeenCalled()
  })

  it("skips when gridTransactionId missing", async () => {
    const result = await confirmGridReceiptDelivery({
      admin: { from: vi.fn() } as never,
      ledgerTransactionId: "tx-1",
      gridTransactionId: "  ",
    })
    expect(result).toEqual({ confirmed: false, skipped: true })
    expect(mockGridFetch).not.toHaveBeenCalled()
  })

  it("POSTs confirm and stamps metadata", async () => {
    mockGridFetch.mockResolvedValueOnce({ status: "COMPLETED" }).mockResolvedValueOnce({})
    const eq = vi.fn().mockResolvedValue({ error: null })
    const update = vi.fn().mockReturnValue({ eq })
    const admin = { from: vi.fn(() => ({ update })) }

    const result = await confirmGridReceiptDelivery({
      admin: admin as never,
      ledgerTransactionId: "tx-1",
      gridTransactionId: "Transaction:abc",
      metadata: { grid_transaction_id: "Transaction:abc" },
      receiptDeliveryConfirmedAt: "2026-08-12T12:00:00.000Z",
    })

    expect(result).toEqual({ confirmed: true, skipped: false })
    expect(mockGridFetch).toHaveBeenCalledWith({
      method: "GET",
      path: "/transactions/Transaction%3Aabc",
    })
    expect(mockGridFetch).toHaveBeenCalledWith({
      method: "POST",
      path: "/transactions/Transaction%3Aabc/confirm",
      json: { receiptDeliveryConfirmedAt: "2026-08-12T12:00:00.000Z" },
    })
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          grid_receipt_delivered_at: "2026-08-12T12:00:00.000Z",
        }),
      }),
    )
  })

  it("skips confirm when Grid says the payout failed", async () => {
    mockGridFetch.mockResolvedValueOnce({ status: "FAILED" })
    const result = await confirmGridReceiptDelivery({
      admin: { from: vi.fn() } as never,
      ledgerTransactionId: "tx-1",
      gridTransactionId: "Transaction:abc",
    })
    expect(result).toEqual({ confirmed: false, skipped: true })
    expect(mockGridFetch).toHaveBeenCalledTimes(1)
  })

  it("skips confirm when ledger metadata already marks a refund", async () => {
    const result = await confirmGridReceiptDelivery({
      admin: { from: vi.fn() } as never,
      ledgerTransactionId: "tx-1",
      gridTransactionId: "Transaction:abc",
      metadata: { grid_refund_expected: true, failure_reason: "QUOTE_EXECUTION_FAILED" },
    })
    expect(result).toEqual({ confirmed: false, skipped: true })
    expect(mockGridFetch).not.toHaveBeenCalled()
  })
})
